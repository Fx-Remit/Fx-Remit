import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseSignature,
  parseTransaction,
  parseUnits,
  TransactionReceiptNotFoundError,
  zeroAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { PrivyClient } from '@privy-io/node';
import { prisma } from '@fx-remit/database';
import { PAYCREST_SETTLEMENT, PayoutService } from '../paycrest/payout.service.js';
import { TransactionService } from '../transactions/transaction.service.js';
import { INSTANT_SEND_MAX_USDC_RAW } from './instant-send.policy.js';
import { InstantSendWalletError, resolveDelegatedWalletId } from './instant-send.broadcast.js';

/** pg advisory lock id serializing relayer nonces across server instances. */
const RELAYER_LOCK_ID = 4_665_873_266n;
/** Authorization lifetime; kept short so an unused signature expires quickly. */
const AUTHORIZATION_TTL_MS = 10 * 60_000;
/** Refuse to fund a Paycrest order that expires sooner than this. */
const MIN_ORDER_LIFETIME_MS = 3 * 60_000;
const RECEIPT_WAIT_MS = 25_000;
const RECEIPT_POLL_MS = 1_500;
const RELAYER_LOCK_WAIT_MS = 12_000;
/** After an authorization expires, wait this long before trusting "not funded" reads. */
const EXPIRY_GRACE_MS = 5 * 60_000;
/** A forwarder claim older than this with no outcome is picked up by recovery. */
const STUCK_CLAIM_AGE_MS = 15 * 60_000;

export const PAYOUT_FORWARDER_ABI = parseAbi([
  'function payout(uint256 orderId, address payer, address sink, uint256 amount, uint256 validBefore, uint8 v, bytes32 r, bytes32 s)',
  'function funded(uint256 orderId) view returns (bool)',
  'event PayoutFunded(uint256 indexed orderId, address indexed payer, address indexed sink, address token, uint256 amount)',
]);

const USDC_ABI = parseAbi([
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export function payoutForwarderAddress(): Address | null {
  const raw = process.env.PAYOUT_FORWARDER_ADDRESS?.trim();
  return raw && isAddress(raw) ? getAddress(raw) : null;
}

export function isPayoutForwarderConfigured(): boolean {
  return Boolean(
    payoutForwarderAddress() &&
      process.env.RELAYER_PRIVATE_KEY?.trim() &&
      // A dedicated RPC: load-balanced public endpoints give stale nonces and receipts.
      process.env.BASE_RPC_URL?.trim() &&
      process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim() &&
      (process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || process.env.PRIVY_APP_ID?.trim()) &&
      process.env.PRIVY_APP_SECRET?.trim(),
  );
}

/**
 * New bank payouts use the forwarder when it is configured and either the flag is
 * on or the user is allowlisted (by app user id or Privy DID).
 */
export function isPayoutForwarderEnabledFor(user: { id: string; privyDid: string }): boolean {
  if (!isPayoutForwarderConfigured()) return false;
  if (process.env.PAYOUT_FORWARDER_ENABLED?.trim() === 'true') return true;
  const allow = (process.env.PAYOUT_FORWARDER_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(user.id) || allow.includes(user.privyDid);
}

/** Same value as PayoutForwarder.authorizationNonce(orderId, sink). */
export function forwarderAuthorizationNonce(orderId: bigint, sink: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }], [orderId, sink]));
}

/** The RPC calls the payout path makes (narrow on purpose; tests replace it). */
export type ForwarderPublicClient = {
  readContract(
    args:
      | { address: Address; abi: typeof USDC_ABI; functionName: 'name' | 'version' | 'balanceOf'; args?: readonly [Address] }
      | { address: Address; abi: typeof PAYOUT_FORWARDER_ABI; functionName: 'funded'; args: readonly [bigint] },
  ): Promise<unknown>;
  call(args: { account: Address; to: Address; data: Hex }): Promise<unknown>;
  getTransactionCount(args: { address: Address; blockTag: 'latest' | 'pending' }): Promise<number>;
  getTransactionReceipt(args: { hash: Hex }): Promise<TransactionReceipt>;
  sendRawTransaction(args: { serializedTransaction: Hex }): Promise<Hex>;
};

/** Network, signing and locking seams; tests replace these. */
export const forwarderDeps = {
  resolveWallet: resolveDelegatedWalletId,
  getSettlement: (paycrestOrderId: string) => PayoutService.getSettlementOrder(paycrestOrderId),

  publicClient(): ForwarderPublicClient {
    return createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL?.trim() || undefined),
    }) as unknown as ForwarderPublicClient;
  },

  relayerAddress(): Address {
    return privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY!.trim() as Hex).address;
  },

  async signAuthorization(walletId: string, typedData: Record<string, unknown>): Promise<Hex> {
    const client = new PrivyClient({
      appId: (process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID || '').trim(),
      appSecret: (process.env.PRIVY_APP_SECRET || '').trim(),
    });
    const res = await client.wallets().ethereum().signTypedData(walletId, {
      params: { typed_data: typedData as never },
      authorization_context: {
        authorization_private_keys: [process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!.trim()],
      },
    });
    return res.signature as Hex;
  },

  /**
   * Hold one Postgres advisory lock so two payouts never get the same relayer nonce.
   * Waiters poll with pg_try_advisory_xact_lock instead of blocking, so they don't hold
   * pooled connections while the lock holder needs one to save its tx.
   */
  async withRelayerLock<T>(fn: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + RELAYER_LOCK_WAIT_MS;
    for (;;) {
      const result = await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${RELAYER_LOCK_ID}) AS locked`;
          if (!rows[0]?.locked) return { acquired: false as const };
          return { acquired: true as const, value: await fn() };
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
      if (result.acquired) return result.value;
      if (Date.now() > deadline) throw new Error('relayer is busy');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  },

  async signRelayerTx(to: Address, data: Hex): Promise<Hex> {
    const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY!.trim() as Hex);
    const wallet = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.BASE_RPC_URL?.trim() || undefined),
    });
    // Casts: viem's generic request types don't resolve under the app's tsconfig.
    const request = await wallet.prepareTransactionRequest({ account, chain: base, to, data } as unknown as Parameters<
      typeof wallet.prepareTransactionRequest
    >[0]);
    return wallet.signTransaction(request as unknown as Parameters<typeof wallet.signTransaction>[0]);
  },

  async sendRaw(raw: Hex): Promise<void> {
    await this.publicClient().sendRawTransaction({ serializedTransaction: raw });
  },

  /** null only when the node says the tx is unknown; any other RPC failure throws. */
  async getReceipt(hash: Hex): Promise<TransactionReceipt | null> {
    try {
      return await this.publicClient().getTransactionReceipt({ hash });
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError) return null;
      throw err;
    }
  },

  /** On-chain truth: has PayoutForwarder already funded this order? */
  async isFunded(forwarder: Address, orderId: bigint): Promise<boolean> {
    return (await this.publicClient().readContract({
      address: forwarder,
      abi: PAYOUT_FORWARDER_ABI,
      functionName: 'funded',
      args: [orderId],
    })) as boolean;
  },

  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

type Remittance = NonNullable<Awaited<ReturnType<typeof TransactionService.findPendingRemittanceForBroadcast>>>;

type FundingContext = {
  userId: string;
  orderId: bigint;
  paycrestOrderId: string;
  forwarder: Address;
  payer: Address;
  sink: Address;
  amount: bigint;
};

/**
 * Bank payout through PayoutForwarder: the user's wallet signs a USDC
 * ReceiveWithAuthorization (Privy policy allows only this, to the forwarder), and the
 * relayer sends `payout`, paying the gas.
 *
 * Money-path rules:
 * - The recipient and amount come only from the linked Paycrest order and must
 *   equal the ledger reserve exactly; the client sends only the orderId.
 * - The signed relayer tx is saved before broadcast. A timeout resends that tx and
 *   never signs a new one while it can still land. The contract funds each order once.
 * - The hash is attached only after the receipt shows PayoutFunded and both USDC legs.
 * - Nothing falls back to a user-paid transaction.
 */
export async function broadcastForwarderPayout(opts: {
  privyDid: string;
  userId: string;
  walletAddress: string;
  orderId: bigint;
}): Promise<{ txHash: string; alreadyBroadcast: boolean }> {
  const remittance = await TransactionService.findPendingRemittanceForBroadcast({
    userId: opts.userId,
    orderId: opts.orderId,
  });
  if (!remittance) {
    throw new InstantSendWalletError('ORDER_NOT_FOUND', 'Transaction not found');
  }
  if (TransactionService.isOnChainTxHash(remittance.txHash)) {
    return { txHash: remittance.txHash, alreadyBroadcast: true };
  }

  const forwarder = payoutForwarderAddress();
  if (!forwarder || !isPayoutForwarderConfigured()) {
    if (TransactionService.isBroadcastClaimHash(remittance.txHash)) {
      // A send may be in flight; never tell the client "nothing moved".
      throw new InstantSendWalletError('BROADCAST_UNCERTAIN', 'Payment may have been submitted — check history before trying again.');
    }
    // Not InstantSendNotConfiguredError: that one makes the client fall back to a user-paid send.
    throw new InstantSendWalletError('FORWARDER_UNAVAILABLE', "Couldn't send this payout. Tap Send to try again.");
  }
  if (remittance.fundingPath === 'direct') {
    throw new InstantSendWalletError('FUNDING_PATH_MISMATCH', 'This payout already started on the direct path');
  }
  if (TransactionService.isBroadcastClaimHash(remittance.txHash)) {
    if (remittance.fundingTxHash && remittance.fundingTxRaw) {
      return resumeStoredFunding(remittance, forwarder);
    }
    throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Broadcast already in progress for this order');
  }
  if (!remittance.txHash.startsWith('pending-')) {
    throw new InstantSendWalletError('NOT_PENDING', 'Remittance is not awaiting broadcast');
  }

  const pendingTxHash = remittance.txHash;
  const paycrestOrderId = TransactionService.paycrestOrderIdFromTxHash(pendingTxHash);
  if (!paycrestOrderId || TransactionService.isAppLocalPendingKey(paycrestOrderId, remittance.externalId)) {
    throw new InstantSendWalletError(
      'PAYCREST_ORDER_MISSING',
      'Paycrest order is not linked yet — wait for create-pending to finish',
    );
  }

  const settlement = await forwarderDeps.getSettlement(paycrestOrderId);
  if (!settlement.success) {
    throw new InstantSendWalletError('PAYCREST_LOOKUP_FAILED', settlement.error || 'Failed to load Paycrest settlement');
  }
  const order = settlement.order;
  const receiveAddress = order.providerAccount?.receiveAddress;
  if (!receiveAddress || !isAddress(receiveAddress)) {
    throw new InstantSendWalletError('INVALID_RECEIVE_ADDRESS', 'Paycrest did not provide a valid receive address');
  }
  const tokenAddress = (settlement.settlement.tokenAddress as string) || PAYCREST_SETTLEMENT.tokenAddress;
  if (tokenAddress.toLowerCase() !== PAYCREST_SETTLEMENT.tokenAddress.toLowerCase()) {
    throw new InstantSendWalletError('UNSUPPORTED_TOKEN', `Payouts only support ${PAYCREST_SETTLEMENT.token}`);
  }
  const amountToTransfer = order.providerAccount?.amountToTransfer;
  if (amountToTransfer == null || String(amountToTransfer).trim() === '') {
    // Never substitute the ledger amount for Paycrest's figure.
    throw new InstantSendWalletError('PAYCREST_AMOUNT_MISSING', 'Paycrest did not provide the amount to send');
  }
  const amount = parseUnits(String(amountToTransfer), PAYCREST_SETTLEMENT.decimals);
  const reserved = parseUnits(remittance.amountUsd.toString(), PAYCREST_SETTLEMENT.decimals);
  if (amount !== reserved) {
    // The ledger must take exactly what leaves the wallet.
    throw new InstantSendWalletError(
      'AMOUNT_MISMATCH',
      `Paycrest asks for ${amountToTransfer} but ${remittance.amountUsd.toString()} is reserved`,
    );
  }
  if (amount <= 0n || amount > INSTANT_SEND_MAX_USDC_RAW) {
    throw new InstantSendWalletError('AMOUNT_CAP', 'Settlement amount is outside the payout limit');
  }
  const validUntilMs = order.providerAccount?.validUntil ? Date.parse(order.providerAccount.validUntil) : NaN;
  const now = forwarderDeps.now();
  if (Number.isFinite(validUntilMs) && validUntilMs - now < MIN_ORDER_LIFETIME_MS) {
    throw new InstantSendWalletError('ORDER_EXPIRING', 'This quote is about to expire. Start the payout again.');
  }

  const { walletId, delegated } = await forwarderDeps.resolveWallet({
    privyDid: opts.privyDid,
    walletAddress: opts.walletAddress,
  });
  if (!delegated) {
    throw new InstantSendWalletError('NOT_DELEGATED', 'Enable Instant Send to allow FX-Remit to complete payouts');
  }

  const payer = getAddress(opts.walletAddress);
  const sink = getAddress(receiveAddress);
  const usdc = getAddress(PAYCREST_SETTLEMENT.tokenAddress);
  const client = forwarderDeps.publicClient();
  const balance = (await client.readContract({
    address: usdc,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [payer],
  })) as bigint;
  if (balance < amount) {
    throw new InstantSendWalletError('INSUFFICIENT_USDC', 'Not enough USDC in the wallet for this payout');
  }

  const claimed = await TransactionService.claimBroadcastSlot({
    userId: opts.userId,
    orderId: opts.orderId,
    pendingTxHash,
    fundingPath: 'forwarder',
  });
  if (!claimed) {
    const again = await TransactionService.findPendingRemittanceForBroadcast({ userId: opts.userId, orderId: opts.orderId });
    if (again && TransactionService.isOnChainTxHash(again.txHash)) {
      return { txHash: again.txHash, alreadyBroadcast: true };
    }
    throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Broadcast already in progress for this order');
  }
  const claimTxHash = `broadcasting-${paycrestOrderId}`;
  const fundingCtx: FundingContext = { userId: opts.userId, orderId: opts.orderId, paycrestOrderId, forwarder, payer, sink, amount };
  /** Release a claim when nothing was sent. If it didn't release, never report "nothing moved". */
  const releaseClaim = async () => {
    const released = await TransactionService.releaseBroadcastClaim({
      userId: opts.userId,
      orderId: opts.orderId,
      paycrestOrderId,
      resetFundingPath: true,
    });
    if (!released) {
      throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Payment is already sending — check history before trying again.');
    }
  };

  // Anyone holding a previously exposed authorization can call payout(); the contract
  // is the truth on whether USDC already left for this order.
  await assertNotFundedOnChain(fundingCtx);

  // 1. The user's wallet authorizes exactly this order, destination and amount.
  let data: Hex;
  try {
    const [name, version] = (await Promise.all([
      client.readContract({ address: usdc, abi: USDC_ABI, functionName: 'name' }),
      client.readContract({ address: usdc, abi: USDC_ABI, functionName: 'version' }),
    ])) as [string, string];
    const expiresAt = Math.min(now + AUTHORIZATION_TTL_MS, Number.isFinite(validUntilMs) ? validUntilMs - 60_000 : Infinity);
    const validBefore = BigInt(Math.floor(expiresAt / 1000));
    const nonce = forwarderAuthorizationNonce(opts.orderId, sink);
    const signature = await forwarderDeps.signAuthorization(walletId, {
      domain: { name, version, chainId: PAYCREST_SETTLEMENT.chainId, verifyingContract: usdc },
      types: RECEIVE_WITH_AUTHORIZATION_TYPES,
      primary_type: 'ReceiveWithAuthorization',
      message: {
        from: payer,
        to: forwarder,
        value: amount.toString(),
        validAfter: '0',
        validBefore: validBefore.toString(),
        nonce,
      },
    });
    const { v, yParity, r, s } = parseSignature(signature);
    // Signers may return v (27/28) or yParity (0/1).
    const recovery = v !== undefined ? Number(v) : Number(yParity) + 27;
    data = encodeFunctionData({
      abi: PAYOUT_FORWARDER_ABI,
      functionName: 'payout',
      args: [opts.orderId, payer, sink, amount, validBefore, recovery, r, s],
    });
    // Dry run before any gas is spent; a revert here means nothing was sent.
    await client.call({ account: forwarderDeps.relayerAddress(), to: forwarder, data });
  } catch (err) {
    // A dry run also reverts when the order was funded by someone else: check before releasing.
    await assertNotFundedOnChain(fundingCtx);
    await releaseClaim();
    console.error('[ForwarderPayout] authorization or dry run failed; claim released', {
      orderId: opts.orderId.toString(),
      message: err instanceof Error ? err.message : String(err),
    });
    throw new InstantSendWalletError('PAYOUT_NOT_AUTHORIZED', "Couldn't send this payout. Tap Send to try again.");
  }

  // 2. Relayer: sign, save, then broadcast, under one lock so relayer nonces never collide.
  let saved: { hash: Hex } | null = null;
  try {
    await forwarderDeps.withRelayerLock(async () => {
      const raw = await forwarderDeps.signRelayerTx(forwarder, data);
      const hash = keccak256(raw);
      const ok = await TransactionService.saveFundingTx({
        userId: opts.userId,
        orderId: opts.orderId,
        claimTxHash,
        fundingTxHash: hash,
        fundingTxRaw: raw,
      });
      if (!ok) throw new Error('could not save the funding tx');
      saved = { hash };
      await forwarderDeps.sendRaw(raw);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!saved) {
      // Nothing was broadcast.
      await releaseClaim();
      console.error('[ForwarderPayout] relayer signing failed before broadcast; claim released', {
        orderId: opts.orderId.toString(),
        message,
      });
      throw new InstantSendWalletError('FORWARDER_UNAVAILABLE', "Couldn't send this payout. Tap Send to try again.");
    }
    // The tx may be out. Keep the claim; the next call resumes the saved tx.
    console.error('[ForwarderPayout] broadcast result unknown; claim and saved tx kept', {
      orderId: opts.orderId.toString(),
      message,
    });
    throw new InstantSendWalletError(
      'BROADCAST_UNCERTAIN',
      'Payment may have been submitted — check history before trying again.',
    );
  }

  const fundingHash = (saved as { hash: Hex } | null)!.hash;
  return settleStoredFunding(fundingCtx, fundingHash);
}

/** A claim with a saved relayer tx: find out what happened to it, resend it, or retire it. */
type SavedFundingRow = Pick<Remittance, 'userId' | 'orderId' | 'txHash' | 'fundingTxHash' | 'fundingTxRaw'>;

/** Decode and sanity-check the relayer tx saved on a claimed row. */
function decodeSavedFunding(row: SavedFundingRow, forwarder: Address) {
  const hash = row.fundingTxHash as Hex;
  const raw = row.fundingTxRaw as Hex;
  const paycrestOrderId = TransactionService.paycrestOrderIdFromTxHash(row.txHash);
  const inconsistent = () => {
    console.error('[ForwarderPayout] stored funding tx is inconsistent; ops review needed', {
      orderId: row.orderId.toString(),
    });
    return new InstantSendWalletError('BROADCAST_UNCERTAIN', 'Payment may have been submitted — check history before trying again.');
  };
  if (!paycrestOrderId || keccak256(raw) !== hash) throw inconsistent();
  const tx = parseTransaction(raw);
  if (!tx.data) throw inconsistent();
  const call = decodeFunctionData({ abi: PAYOUT_FORWARDER_ABI, data: tx.data });
  const [orderId, payer, sink, amount, validBefore] = call.args as readonly [bigint, Address, Address, bigint, bigint, ...unknown[]];
  if (!tx.to || getAddress(tx.to) !== forwarder || orderId !== row.orderId) throw inconsistent();
  const ctx: FundingContext = {
    userId: row.userId,
    orderId,
    paycrestOrderId,
    forwarder,
    payer: getAddress(payer),
    sink: getAddress(sink),
    amount,
  };
  return { ctx, hash, raw, validBefore };
}

/** True once the saved tx's authorization has expired past the grace period. */
function authorizationExpired(validBefore: bigint): boolean {
  return forwarderDeps.now() > Number(validBefore) * 1000 + EXPIRY_GRACE_MS;
}

async function resumeStoredFunding(remittance: Remittance, forwarder: Address) {
  const { ctx, hash, raw, validBefore } = decodeSavedFunding(remittance, forwarder);
  try {
    if (!(await forwarderDeps.getReceipt(hash))) {
      // No receipt. Once the user's authorization has expired (plus a grace period),
      // this tx can never fund the order, so a "not funded" read can be trusted even
      // from a lagging node. Before that, never retire it: resend the same payload.
      if (authorizationExpired(validBefore)) {
        await discardIfUnfunded(ctx, hash, 'PAYOUT_DROPPED');
      }
      try {
        await forwarderDeps.sendRaw(raw);
      } catch {
        // Already known to the node, or still pending: the receipt wait decides.
      }
    }
  } catch (err) {
    if (err instanceof InstantSendWalletError) throw err;
    throw uncertain(ctx, hash, err);
  }
  return settleStoredFunding(ctx, hash);
}

export type ForwarderRecoveryOutcome =
  | 'attached'
  | 'retired'
  | 'released'
  | 'rebroadcast'
  | 'waiting'
  | 'kept-for-ops'
  | 'error';

/**
 * Nightly / ops recovery for forwarder claims stuck in broadcasting-*. One pass, no waiting:
 * - saved tx landed and matches → attach the hash;
 * - saved tx reverted, or unmined after its authorization expired → retire it, only if
 *   the contract reports the order unfunded;
 * - saved tx unmined and still valid → resend the same payload;
 * - nothing saved (the request died before broadcasting) → release, only if unfunded.
 * Anything funded without a matching tx is kept and alerted for ops.
 */
export async function recoverStuckForwarderClaims(opts: { olderThanMs?: number; limit?: number; orderId?: bigint } = {}) {
  const forwarder = payoutForwarderAddress();
  if (!forwarder || !isPayoutForwarderConfigured()) {
    return { skipped: 'forwarder not configured' as const, results: [] as { orderId: string; outcome: ForwarderRecoveryOutcome }[] };
  }
  const cutoff = new Date(forwarderDeps.now() - (opts.olderThanMs ?? STUCK_CLAIM_AGE_MS));
  const rows = await prisma.transaction.findMany({
    where: {
      type: 'REMITTANCE',
      status: { in: ['PENDING', 'PROCESSING'] },
      txHash: { startsWith: 'broadcasting-' },
      fundingPath: 'forwarder',
      updatedAt: { lte: cutoff },
      ...(opts.orderId !== undefined ? { orderId: opts.orderId } : {}),
    },
    select: { userId: true, orderId: true, txHash: true, fundingTxHash: true, fundingTxRaw: true },
    orderBy: { updatedAt: 'asc' },
    take: opts.limit ?? 50,
  });

  const results: { orderId: string; outcome: ForwarderRecoveryOutcome }[] = [];
  for (const row of rows) {
    let outcome: ForwarderRecoveryOutcome;
    try {
      outcome = await recoverOneClaim(row, forwarder);
    } catch (err) {
      const errCode = err instanceof InstantSendWalletError ? err.code : null;
      outcome =
        errCode === 'PAYOUT_DROPPED' || errCode === 'PAYOUT_REVERTED'
          ? 'retired'
          : errCode === 'BROADCAST_UNCERTAIN'
            ? 'kept-for-ops'
            : errCode === 'BROADCAST_IN_PROGRESS'
              ? 'waiting'
              : 'error';
      if (outcome === 'error') {
        console.error('[ForwarderRecovery] unexpected error', {
          orderId: row.orderId.toString(),
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    results.push({ orderId: row.orderId.toString(), outcome });
  }
  return { results };
}

async function recoverOneClaim(row: SavedFundingRow, forwarder: Address): Promise<ForwarderRecoveryOutcome> {
  if (!row.fundingTxHash || !row.fundingTxRaw) {
    // Claimed, but the request died before a tx was saved, so nothing was broadcast.
    const paycrestOrderId = TransactionService.paycrestOrderIdFromTxHash(row.txHash);
    if (!paycrestOrderId) return 'error';
    await assertNotFundedOnChain({
      userId: row.userId,
      orderId: row.orderId,
      paycrestOrderId,
      forwarder,
      payer: zeroAddress,
      sink: zeroAddress,
      amount: 0n,
    });
    const released = await TransactionService.releaseBroadcastClaim({
      userId: row.userId,
      orderId: row.orderId,
      paycrestOrderId,
      resetFundingPath: true,
    });
    return released ? 'released' : 'waiting';
  }

  const { ctx, hash, raw, validBefore } = decodeSavedFunding(row, forwarder);
  let receipt: TransactionReceipt | null;
  try {
    receipt = await forwarderDeps.getReceipt(hash);
  } catch (err) {
    throw uncertain(ctx, hash, err);
  }
  if (receipt) {
    if (receipt.status !== 'success') await discardIfUnfunded(ctx, hash, 'PAYOUT_REVERTED');
    if (!fundingReceiptMatches(receipt, ctx)) {
      console.error(
        JSON.stringify({
          alert: 'FORWARDER_RECEIPT_MISMATCH',
          severity: 'high',
          orderId: ctx.orderId.toString(),
          txHash: hash,
          message: 'Saved tx receipt lacks the expected PayoutFunded / USDC transfers; claim kept for ops review',
        }),
      );
      return 'kept-for-ops';
    }
    await TransactionService.attachOnChainHash({ userId: ctx.userId, orderId: ctx.orderId, txHash: hash });
    return 'attached';
  }
  if (authorizationExpired(validBefore)) await discardIfUnfunded(ctx, hash, 'PAYOUT_DROPPED');
  if (forwarderDeps.now() >= Number(validBefore) * 1000) {
    // Expired but still inside the grace period: resending would only revert. Wait.
    return 'waiting';
  }
  try {
    await forwarderDeps.sendRaw(raw);
  } catch {
    // Already known, or replaced: the next pass decides.
  }
  return 'rebroadcast';
}

function uncertain(ctx: FundingContext, hash: Hex, err?: unknown) {
  if (err) {
    console.error('[ForwarderPayout] RPC error while checking a sent payout; claim kept', {
      orderId: ctx.orderId.toString(),
      txHash: hash,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return new InstantSendWalletError('BROADCAST_UNCERTAIN', 'Payment may have been submitted — check history before trying again.');
}

/**
 * Keep the claim (and say "may have been submitted") when the contract reports the order
 * funded, or when that can't be read. Releasing then would let the reserve be restored
 * after USDC already left.
 */
async function assertNotFundedOnChain(ctx: FundingContext): Promise<void> {
  let funded: boolean;
  try {
    funded = await forwarderDeps.isFunded(ctx.forwarder, ctx.orderId);
  } catch (err) {
    throw uncertain(ctx, '0x' as Hex, err);
  }
  if (funded) {
    console.error(
      JSON.stringify({
        alert: 'FORWARDER_ORDER_FUNDED_BY_OTHER_TX',
        severity: 'high',
        orderId: ctx.orderId.toString(),
        message: 'Order is funded on-chain without a matching saved tx; claim kept for ops to attach the funding tx',
      }),
    );
    throw uncertain(ctx, '0x' as Hex);
  }
}

/**
 * Retire a saved tx that can't fund the order, but only after the contract confirms
 * the order is NOT funded. If it is funded (by this tx or an earlier one), the claim
 * stays held: releasing it would let the reserve be restored after USDC already left.
 */
async function discardIfUnfunded(ctx: FundingContext, hash: Hex, codeIfDiscarded: 'PAYOUT_DROPPED' | 'PAYOUT_REVERTED'): Promise<never> {
  if (await forwarderDeps.isFunded(ctx.forwarder, ctx.orderId)) {
    console.error(
      JSON.stringify({
        alert: 'FORWARDER_ORDER_FUNDED_BY_OTHER_TX',
        severity: 'high',
        orderId: ctx.orderId.toString(),
        savedTxHash: hash,
        message: 'Order is funded on-chain but not by the saved tx; claim kept for ops to attach the funding tx',
      }),
    );
    throw uncertain(ctx, hash);
  }
  const cleared = await TransactionService.discardFundingTx({
    userId: ctx.userId,
    orderId: ctx.orderId,
    paycrestOrderId: ctx.paycrestOrderId,
    fundingTxHash: hash,
  });
  if (!cleared) {
    // Another request already attached or retired this tx. Never tell the client
    // "nothing was sent" here: that would cancel the reserve.
    throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Payment is already sending — check history before trying again.');
  }
  throw new InstantSendWalletError(codeIfDiscarded, "Couldn't send this payout. Tap Send to try again.");
}

async function settleStoredFunding(ctx: FundingContext, hash: Hex) {
  let receipt: TransactionReceipt | null = null;
  try {
    const deadline = forwarderDeps.now() + RECEIPT_WAIT_MS;
    while (!(receipt = await forwarderDeps.getReceipt(hash)) && forwarderDeps.now() < deadline) {
      await forwarderDeps.sleep(RECEIPT_POLL_MS);
    }
  } catch (err) {
    throw uncertain(ctx, hash, err);
  }
  if (!receipt) {
    throw uncertain(ctx, hash);
  }
  if (receipt.status !== 'success') {
    // Reverted: no USDC moved in this tx, so the order can be funded again through the
    // same path, unless the contract says it is already funded.
    try {
      await discardIfUnfunded(ctx, hash, 'PAYOUT_REVERTED');
    } catch (err) {
      if (err instanceof InstantSendWalletError) throw err;
      throw uncertain(ctx, hash, err);
    }
  }
  if (!fundingReceiptMatches(receipt, ctx)) {
    console.error(
      JSON.stringify({
        alert: 'FORWARDER_RECEIPT_MISMATCH',
        severity: 'high',
        orderId: ctx.orderId.toString(),
        txHash: hash,
        message: 'Receipt lacks the expected PayoutFunded / USDC transfers; claim kept for ops review',
      }),
    );
    throw new InstantSendWalletError('BROADCAST_UNCERTAIN', 'Payment may have been submitted — check history before trying again.');
  }

  try {
    await TransactionService.attachOnChainHash({ userId: ctx.userId, orderId: ctx.orderId, txHash: hash });
  } catch (err) {
    // The payout landed; still return the hash (the client syncs it). Claim stays held.
    console.error('[ForwarderPayout] attachOnChainHash failed after a confirmed payout; returning hash for client sync', {
      orderId: ctx.orderId.toString(),
      txHash: hash,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return { txHash: hash as string, alreadyBroadcast: false };
}

/** The receipt shows PayoutFunded for this order plus both USDC legs of `amount`. */
export function fundingReceiptMatches(receipt: TransactionReceipt, ctx: FundingContext): boolean {
  const usdc = PAYCREST_SETTLEMENT.tokenAddress.toLowerCase();
  let funded = false;
  let pulled = false;
  let forwarded = false;
  type RawLog = { address: string; data: Hex; topics: [Hex, ...Hex[]] | [] };
  type Decoded = { eventName: string; args: Record<string, any> };
  for (const log of receipt.logs as unknown as RawLog[]) {
    const address = log.address.toLowerCase();
    try {
      if (address === ctx.forwarder.toLowerCase()) {
        const ev = decodeEventLog({ abi: PAYOUT_FORWARDER_ABI, data: log.data, topics: log.topics }) as unknown as Decoded;
        if (
          ev.eventName === 'PayoutFunded' &&
          ev.args.orderId === ctx.orderId &&
          getAddress(ev.args.payer) === ctx.payer &&
          getAddress(ev.args.sink) === ctx.sink &&
          ev.args.token.toLowerCase() === usdc &&
          ev.args.amount === ctx.amount
        ) {
          funded = true;
        }
      } else if (address === usdc) {
        const ev = decodeEventLog({ abi: USDC_ABI, data: log.data, topics: log.topics }) as unknown as Decoded;
        if (ev.eventName !== 'Transfer' || ev.args.value !== ctx.amount) continue;
        const from = getAddress(ev.args.from);
        const to = getAddress(ev.args.to);
        if (from === ctx.payer && to === ctx.forwarder) pulled = true;
        if (from === ctx.forwarder && to === ctx.sink) forwarded = true;
      }
    } catch {
      // Other events on these contracts (e.g. AuthorizationUsed).
    }
  }
  return funded && pulled && forwarded;
}
