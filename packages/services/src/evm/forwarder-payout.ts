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
import { base, celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { PrivyClient } from '@privy-io/node';
import { prisma } from '@fx-remit/database';
import { PAYCREST_SETTLEMENT, PayoutService, bankSettlementFor } from '../paycrest/payout.service.js';
import { CRYPTO_CASH_OUT_CHAIN_ID, TransactionService } from '../transactions/transaction.service.js';
import { INSTANT_SEND_MAX_USDC_RAW } from './instant-send.policy.js';
import { InstantSendWalletError, resolveDelegatedWalletId } from './instant-send.broadcast.js';
import { DEPOSIT_TOKENS } from '../deposits/deposit.tokens.js';
import { CryptoAddressService } from '../crypto-addresses/crypto-address.service.js';
import { CRYPTO_INSTANT_SEND_MAX_USD } from './crypto-instant-send.policy.js';

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

/** Chains PayoutForwarder runs on (same CREATE2 address on each). */
export type ForwarderChainId = 8453 | 42220;

function usdcOn(chainId: ForwarderChainId): Address {
  const usdc = DEPOSIT_TOKENS[chainId]?.find((t) => t.symbol === 'USDC');
  if (!usdc) throw new Error(`No USDC configured for chain ${chainId}`);
  return getAddress(usdc.address);
}

const FORWARDER_CHAINS: Record<ForwarderChainId, { chain: typeof base | typeof celo; rpcEnv: string }> = {
  8453: { chain: base, rpcEnv: 'BASE_RPC_URL' },
  42220: { chain: celo, rpcEnv: 'CELO_RPC_URL' },
};

export function isForwarderChainId(chainId: number): chainId is ForwarderChainId {
  return chainId === 8453 || chainId === 42220;
}

function rpcUrl(chainId: ForwarderChainId): string | undefined {
  return process.env[FORWARDER_CHAINS[chainId].rpcEnv]?.trim() || undefined;
}

/** Forwarder chain for a crypto cash-out network ('base', 'celo'), or null if it doesn't run there. */
export function forwarderChainForNetwork(network: string): ForwarderChainId | null {
  const chainId = CRYPTO_CASH_OUT_CHAIN_ID[network];
  return chainId !== undefined && isForwarderChainId(chainId) ? chainId : null;
}

/**
 * Chains the forwarder is switched on for (PAYOUT_FORWARDER_CHAINS, comma-separated ids).
 * Base only by default: another chain needs an explicit switch once its deploy, relayer
 * gas and RPC are confirmed.
 */
function enabledForwarderChains(): Set<number> {
  const raw = process.env.PAYOUT_FORWARDER_CHAINS?.trim() || '8453';
  return new Set(raw.split(',').map((s) => Number(s.trim())).filter(Number.isFinite));
}

export function payoutForwarderAddress(): Address | null {
  const raw = process.env.PAYOUT_FORWARDER_ADDRESS?.trim();
  return raw && isAddress(raw) ? getAddress(raw) : null;
}

export function isPayoutForwarderConfigured(chainId: ForwarderChainId = 8453): boolean {
  return Boolean(
    enabledForwarderChains().has(chainId) &&
      payoutForwarderAddress() &&
      process.env.RELAYER_PRIVATE_KEY?.trim() &&
      // A dedicated RPC per chain: load-balanced public endpoints give stale nonces and receipts.
      rpcUrl(chainId) &&
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

/**
 * How a crypto cash-out on `network` is funded for this user:
 * - 'forwarder' when the forwarder is on for them and configured on that chain;
 * - 'direct' (legacy wallet send) only while the forwarder is off for them;
 * - 'unavailable' when it's on but that chain isn't configured, or the network isn't supported.
 */
export function cryptoFundingPathFor(
  user: { id: string; privyDid: string },
  network: string,
): 'forwarder' | 'direct' | 'unavailable' {
  const chainId = forwarderChainForNetwork(network);
  if (chainId === null) return 'unavailable';
  if (!isPayoutForwarderEnabledFor(user)) return 'direct';
  return isPayoutForwarderConfigured(chainId) ? 'forwarder' : 'unavailable';
}

/**
 * Networks a bank payout can be paid from right now: Base always; Celo once the forwarder is on
 * for everyone and switched on for Celo (Celo payouts have no direct path).
 */
export function bankSourceNetworksAvailable(): Array<'base' | 'celo'> {
  const celo = process.env.PAYOUT_FORWARDER_ENABLED?.trim() === 'true' && isPayoutForwarderConfigured(42220);
  return celo ? ['base', 'celo'] : ['base'];
}

/** Whether this user's bank payout may be paid from `network` (Celo only through the forwarder). */
export function bankSourceEnabledFor(user: { id: string; privyDid: string }, network: string): boolean {
  if (network === 'base') return true;
  const chainId = forwarderChainForNetwork(network);
  return chainId !== null && isPayoutForwarderEnabledFor(user) && isPayoutForwarderConfigured(chainId);
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

const publicClients = new Map<string, ForwarderPublicClient>();

/** Network, signing and locking seams; tests replace these. */
export const forwarderDeps = {
  resolveWallet: resolveDelegatedWalletId,
  getSettlement: (paycrestOrderId: string, network?: string | null) =>
    PayoutService.getSettlementOrder(paycrestOrderId, network),

  publicClient(chainId: ForwarderChainId = 8453): ForwarderPublicClient {
    const url = rpcUrl(chainId);
    const key = `${chainId}:${url ?? ''}`;
    let client = publicClients.get(key);
    if (!client) {
      client = createPublicClient({ chain: FORWARDER_CHAINS[chainId].chain, transport: http(url) }) as unknown as ForwarderPublicClient;
      publicClients.set(key, client);
    }
    return client;
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
  async withRelayerLock<T>(fn: () => Promise<T>, chainId: ForwarderChainId = 8453): Promise<T> {
    // Nonces are per chain, so each chain gets its own lock (Base keeps the original id).
    const lockId = chainId === 8453 ? RELAYER_LOCK_ID : RELAYER_LOCK_ID + BigInt(chainId);
    const deadline = Date.now() + RELAYER_LOCK_WAIT_MS;
    for (;;) {
      const result = await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${lockId}) AS locked`;
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

  async signRelayerTx(to: Address, data: Hex, chainId: ForwarderChainId = 8453): Promise<Hex> {
    const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY!.trim() as Hex);
    const chain = FORWARDER_CHAINS[chainId].chain;
    const wallet = createWalletClient({ account, chain, transport: http(rpcUrl(chainId)) });
    // Casts: viem's generic request types don't resolve under the app's tsconfig.
    const request = await wallet.prepareTransactionRequest({ account, chain, to, data } as unknown as Parameters<
      typeof wallet.prepareTransactionRequest
    >[0]);
    return wallet.signTransaction(request as unknown as Parameters<typeof wallet.signTransaction>[0]);
  },

  async sendRaw(raw: Hex, chainId: ForwarderChainId = 8453): Promise<void> {
    await this.publicClient(chainId).sendRawTransaction({ serializedTransaction: raw });
  },

  /** null only when the node says the tx is unknown; any other RPC failure throws. */
  async getReceipt(hash: Hex, chainId: ForwarderChainId = 8453): Promise<TransactionReceipt | null> {
    try {
      return await this.publicClient(chainId).getTransactionReceipt({ hash });
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError) return null;
      throw err;
    }
  },

  /** On-chain truth: has PayoutForwarder already funded this order? */
  async isFunded(forwarder: Address, orderId: bigint, chainId: ForwarderChainId = 8453): Promise<boolean> {
    return (await this.publicClient(chainId).readContract({
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
  /** Claim key: the Paycrest order id for bank payouts, the app key for crypto cash-outs. */
  paycrestOrderId: string;
  chainId: ForwarderChainId;
  usdc: Address;
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

  // The network the payout is funded from (Base unless the user chose Celo).
  const source = bankSettlementFor(remittance.sourceNetwork);
  const chainId = source?.chainId;
  if (!source || chainId === undefined || !isForwarderChainId(chainId) || !isPayoutForwarderConfigured(chainId)) {
    throw new InstantSendWalletError('FORWARDER_UNAVAILABLE', "Couldn't send this payout. Tap Send to try again.");
  }

  const settlement = await forwarderDeps.getSettlement(paycrestOrderId, remittance.sourceNetwork);
  if (!settlement.success) {
    throw new InstantSendWalletError('PAYCREST_LOOKUP_FAILED', settlement.error || 'Failed to load Paycrest settlement');
  }
  const order = settlement.order;
  const receiveAddress = order.providerAccount?.receiveAddress;
  if (!receiveAddress || !isAddress(receiveAddress)) {
    throw new InstantSendWalletError('INVALID_RECEIVE_ADDRESS', 'Paycrest did not provide a valid receive address');
  }
  const tokenAddress = (settlement.settlement.tokenAddress as string) || source.tokenAddress;
  if (tokenAddress.toLowerCase() !== usdcOn(chainId).toLowerCase()) {
    throw new InstantSendWalletError('UNSUPPORTED_TOKEN', `Payouts only support ${PAYCREST_SETTLEMENT.token}`);
  }
  const amountToTransfer = order.providerAccount?.amountToTransfer;
  if (amountToTransfer == null || String(amountToTransfer).trim() === '') {
    // Never substitute the ledger amount for Paycrest's figure.
    throw new InstantSendWalletError('PAYCREST_AMOUNT_MISSING', 'Paycrest did not provide the amount to send');
  }
  const amount = parseUnits(String(amountToTransfer), source.decimals);
  const reserved = parseUnits(remittance.amountUsd.toString(), source.decimals);
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
  const usdc = usdcOn(chainId);
  const client = forwarderDeps.publicClient(chainId);
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
  const fundingCtx: FundingContext = {
    userId: opts.userId,
    orderId: opts.orderId,
    paycrestOrderId,
    chainId,
    usdc,
    forwarder,
    payer,
    sink,
    amount,
  };

  return relayClaimedPayout(fundingCtx, async () => {
    // The user's wallet authorizes exactly this order, destination and amount.
    const expiresAt = Math.min(now + AUTHORIZATION_TTL_MS, Number.isFinite(validUntilMs) ? validUntilMs - 60_000 : Infinity);
    const validBefore = BigInt(Math.floor(expiresAt / 1000));
    const signature = await forwarderDeps.signAuthorization(walletId, await authorizationTypedData(fundingCtx, validBefore));
    return encodePayoutCall(fundingCtx, validBefore, signature);
  });
}

/** EIP-712 ReceiveWithAuthorization for one order: from payer, to the forwarder, nonce bound to (orderId, sink). */
async function authorizationTypedData(ctx: FundingContext, validBefore: bigint) {
  const client = forwarderDeps.publicClient(ctx.chainId);
  const [name, version] = (await Promise.all([
    client.readContract({ address: ctx.usdc, abi: USDC_ABI, functionName: 'name' }),
    client.readContract({ address: ctx.usdc, abi: USDC_ABI, functionName: 'version' }),
  ])) as [string, string];
  return {
    domain: { name, version, chainId: ctx.chainId, verifyingContract: ctx.usdc },
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primary_type: 'ReceiveWithAuthorization',
    message: {
      from: ctx.payer,
      to: ctx.forwarder,
      value: ctx.amount.toString(),
      validAfter: '0',
      validBefore: validBefore.toString(),
      nonce: forwarderAuthorizationNonce(ctx.orderId, ctx.sink),
    },
  };
}

function encodePayoutCall(ctx: FundingContext, validBefore: bigint, signature: Hex): Hex {
  const { v, yParity, r, s } = parseSignature(signature);
  // Signers may return v (27/28) or yParity (0/1).
  const recovery = v !== undefined ? Number(v) : Number(yParity) + 27;
  return encodeFunctionData({
    abi: PAYOUT_FORWARDER_ABI,
    functionName: 'payout',
    args: [ctx.orderId, ctx.payer, ctx.sink, ctx.amount, validBefore, recovery, r, s],
  });
}

/**
 * Shared send pipeline once an order is claimed (broadcasting-*): check the contract hasn't
 * funded it, get the user's authorization and dry-run it, then sign, save and broadcast the
 * relayer tx under the chain's lock, and settle on the receipt. Bank and crypto both use it.
 */
async function relayClaimedPayout(
  ctx: FundingContext,
  buildPayoutCall: () => Promise<Hex>,
): Promise<{ txHash: string; alreadyBroadcast: boolean }> {
  const claimTxHash = `broadcasting-${ctx.paycrestOrderId}`;
  /** Release a claim when nothing was sent. If it didn't release, never report "nothing moved". */
  const releaseClaim = async () => {
    const released = await TransactionService.releaseBroadcastClaim({
      userId: ctx.userId,
      orderId: ctx.orderId,
      paycrestOrderId: ctx.paycrestOrderId,
      resetFundingPath: true,
    });
    if (!released) {
      throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Payment is already sending — check history before trying again.');
    }
  };

  // Anyone holding a previously exposed authorization can call payout(); the contract
  // is the truth on whether funds already left for this order.
  await assertNotFundedOnChain(ctx);

  // 1. The user's authorization for exactly this order, destination and amount.
  let data: Hex;
  try {
    data = await buildPayoutCall();
    // Dry run before any gas is spent; a revert here means nothing was sent.
    await forwarderDeps.publicClient(ctx.chainId).call({ account: forwarderDeps.relayerAddress(), to: ctx.forwarder, data });
  } catch (err) {
    // A dry run also reverts when the order was funded by someone else: check before releasing.
    await assertNotFundedOnChain(ctx);
    await releaseClaim();
    console.error('[ForwarderPayout] authorization or dry run failed; claim released', {
      orderId: ctx.orderId.toString(),
      message: err instanceof Error ? err.message : String(err),
    });
    throw new InstantSendWalletError('PAYOUT_NOT_AUTHORIZED', "Couldn't send this payout. Tap Send to try again.");
  }

  // 2. Relayer: sign, save, then broadcast, under one lock so relayer nonces never collide.
  let saved: { hash: Hex } | null = null;
  try {
    await forwarderDeps.withRelayerLock(async () => {
      const raw = await forwarderDeps.signRelayerTx(ctx.forwarder, data, ctx.chainId);
      const hash = keccak256(raw);
      const ok = await TransactionService.saveFundingTx({
        userId: ctx.userId,
        orderId: ctx.orderId,
        claimTxHash,
        fundingTxHash: hash,
        fundingTxRaw: raw,
      });
      if (!ok) throw new Error('could not save the funding tx');
      saved = { hash };
      await forwarderDeps.sendRaw(raw, ctx.chainId);
    }, ctx.chainId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!saved) {
      // Nothing was broadcast.
      await releaseClaim();
      console.error('[ForwarderPayout] relayer signing failed before broadcast; claim released', {
        orderId: ctx.orderId.toString(),
        message,
      });
      throw new InstantSendWalletError('FORWARDER_UNAVAILABLE', "Couldn't send this payout. Tap Send to try again.");
    }
    // The tx may be out. Keep the claim; the next call resumes the saved tx.
    console.error('[ForwarderPayout] broadcast result unknown; claim and saved tx kept', {
      orderId: ctx.orderId.toString(),
      message,
    });
    throw new InstantSendWalletError(
      'BROADCAST_UNCERTAIN',
      'Payment may have been submitted — check history before trying again.',
    );
  }

  const fundingHash = (saved as { hash: Hex } | null)!.hash;
  return settleStoredFunding(ctx, fundingHash);
}

/** A claim with a saved relayer tx: find out what happened to it, resend it, or retire it. */
type SavedFundingRow = Pick<Remittance, 'userId' | 'orderId' | 'txHash' | 'fundingTxHash' | 'fundingTxRaw'> &
  Partial<Pick<Remittance, 'recipientBank' | 'recipientAcc' | 'sourceNetwork'>>;

/** Chain a row pays from (crypto network, or a bank payout's source network). Null if unknown. */
function chainOfRow(row: { recipientBank?: string | null; sourceNetwork?: string | null }): ForwarderChainId | null {
  return forwarderChainForNetwork(TransactionService.payoutNetworkOf(row));
}

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
  const chainId = tx.chainId ?? 8453;
  if (!isForwarderChainId(chainId)) throw inconsistent();
  const call = decodeFunctionData({ abi: PAYOUT_FORWARDER_ABI, data: tx.data });
  const [orderId, payer, sink, amount, validBefore] = call.args as readonly [bigint, Address, Address, bigint, bigint, ...unknown[]];
  if (!tx.to || getAddress(tx.to) !== forwarder || orderId !== row.orderId) throw inconsistent();
  const ctx: FundingContext = {
    userId: row.userId,
    orderId,
    paycrestOrderId,
    chainId,
    usdc: usdcOn(chainId),
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
    if (!(await forwarderDeps.getReceipt(hash, ctx.chainId))) {
      // No receipt. Once the user's authorization has expired (plus a grace period),
      // this tx can never fund the order, so a "not funded" read can be trusted even
      // from a lagging node. Before that, never retire it: resend the same payload.
      if (authorizationExpired(validBefore)) {
        await discardIfUnfunded(ctx, hash, 'PAYOUT_DROPPED');
      }
      try {
        await forwarderDeps.sendRaw(raw, ctx.chainId);
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
    select: {
      userId: true,
      orderId: true,
      txHash: true,
      fundingTxHash: true,
      fundingTxRaw: true,
      recipientBank: true,
      recipientAcc: true,
      sourceNetwork: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: opts.limit ?? 50,
  });

  const results: { orderId: string; outcome: ForwarderRecoveryOutcome }[] = [];
  for (const row of rows) {
    let outcome: ForwarderRecoveryOutcome;
    const chainId = savedTxChain(row) ?? chainOfRow(row);
    if (chainId === null || !isPayoutForwarderConfigured(chainId)) {
      // Never judge a claim on a chain we can't read reliably (no switch or no dedicated RPC): keep it held.
      results.push({ orderId: row.orderId.toString(), outcome: 'waiting' });
      continue;
    }
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

/** Chain id baked into a saved relayer tx, if there is one and it parses. */
function savedTxChain(row: SavedFundingRow): ForwarderChainId | null {
  if (!row.fundingTxRaw) return null;
  try {
    const chainId = parseTransaction(row.fundingTxRaw as Hex).chainId ?? 8453;
    return isForwarderChainId(chainId) ? chainId : null;
  } catch {
    return null;
  }
}

async function recoverOneClaim(row: SavedFundingRow, forwarder: Address): Promise<ForwarderRecoveryOutcome> {
  if (!row.fundingTxHash || !row.fundingTxRaw) {
    // Claimed, but the request died before a tx was saved, so nothing was broadcast.
    const paycrestOrderId = TransactionService.paycrestOrderIdFromTxHash(row.txHash);
    if (!paycrestOrderId) return 'error';
    const chainId = chainOfRow(row);
    if (chainId === null) return 'waiting';
    await assertNotFundedOnChain({
      userId: row.userId,
      orderId: row.orderId,
      paycrestOrderId,
      chainId,
      usdc: usdcOn(chainId),
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
    receipt = await forwarderDeps.getReceipt(hash, ctx.chainId);
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
    await markCryptoDestinationConfirmed(ctx.userId, row);
    return 'attached';
  }
  if (authorizationExpired(validBefore)) await discardIfUnfunded(ctx, hash, 'PAYOUT_DROPPED');
  if (forwarderDeps.now() >= Number(validBefore) * 1000) {
    // Expired but still inside the grace period: resending would only revert. Wait.
    return 'waiting';
  }
  try {
    await forwarderDeps.sendRaw(raw, ctx.chainId);
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
    funded = await forwarderDeps.isFunded(ctx.forwarder, ctx.orderId, ctx.chainId);
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
  if (await forwarderDeps.isFunded(ctx.forwarder, ctx.orderId, ctx.chainId)) {
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
    while (!(receipt = await forwarderDeps.getReceipt(hash, ctx.chainId)) && forwarderDeps.now() < deadline) {
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

/** Crypto cash-outs start the destination's trust cooldown once a send confirms. Best effort. */
async function markCryptoDestinationConfirmed(
  userId: string,
  row: { recipientBank?: string | null; recipientAcc?: string | null },
): Promise<void> {
  const bank = row.recipientBank ?? '';
  if (!bank.startsWith('crypto:') || !row.recipientAcc) return;
  try {
    await CryptoAddressService.markFirstConfirmed(userId, bank.slice('crypto:'.length), row.recipientAcc.trim().toLowerCase());
  } catch (err) {
    console.error('[ForwarderPayout] could not mark crypto destination confirmed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Allowed slack between the authorization the client signed and the TTL we hand out. */
const USER_AUTHORIZATION_SLACK_MS = 2 * 60_000;
const USDC_DECIMALS = 6;

type CryptoTerms = { network: string; chainId: ForwarderChainId; usdc: Address; payer: Address; sink: Address; amount: bigint };

/** Everything about a crypto cash-out comes from the reserved row; the client sends only the orderId. */
function cryptoPayoutTerms(remittance: Remittance, walletAddress: string): CryptoTerms {
  const bank = remittance.recipientBank ?? '';
  const network = bank.startsWith('crypto:') ? bank.slice('crypto:'.length) : '';
  const chainId = forwarderChainForNetwork(network);
  if (chainId === null) {
    throw new InstantSendWalletError('NOT_CRYPTO_CASH_OUT', 'This cash-out network is not supported');
  }
  if ((remittance.sourceToken || '').toUpperCase() !== 'USDC') {
    throw new InstantSendWalletError('UNSUPPORTED_TOKEN', 'Only USDC cash-outs are supported right now');
  }
  const destination = (remittance.recipientAcc || '').trim();
  if (!isAddress(destination)) {
    throw new InstantSendWalletError('INVALID_DESTINATION', 'The destination address is not valid');
  }
  const payer = getAddress(walletAddress);
  const sink = getAddress(destination);
  if (sink === payer) {
    // The contract rejects sink == payer; nothing would move.
    throw new InstantSendWalletError('SINK_IS_PAYER', "You can't cash out to your own FX Remit wallet");
  }
  const amount = parseUnits(remittance.amountUsd.toString(), USDC_DECIMALS);
  if (amount <= 0n || amount > INSTANT_SEND_MAX_USDC_RAW) {
    // The forwarder itself refuses anything over $10k.
    throw new InstantSendWalletError('AMOUNT_CAP', 'Transfer amount is outside the payout limit');
  }
  return { network, chainId, usdc: usdcOn(chainId), payer, sink, amount };
}

/** Load a crypto remittance that can still be funded through the forwarder on its chain. */
async function loadCryptoRemittance(opts: { userId: string; orderId: bigint }) {
  const remittance = await TransactionService.findRemittanceForBroadcast({ userId: opts.userId, orderId: opts.orderId });
  if (!remittance || remittance.type !== 'REMITTANCE') {
    throw new InstantSendWalletError('ORDER_NOT_FOUND', 'Transaction not found');
  }
  return remittance;
}

/**
 * The typed data a user signs in their wallet to send a crypto cash-out to a new
 * (not yet trusted) address. Built entirely from the reserved row.
 */
export async function prepareCryptoAuthorization(opts: { userId: string; walletAddress: string; orderId: bigint }) {
  const remittance = await loadCryptoRemittance(opts);
  if (!remittance.txHash.startsWith('pending-')) {
    throw new InstantSendWalletError('NOT_PENDING', 'This cash-out is not awaiting a send');
  }
  const terms = cryptoPayoutTerms(remittance, opts.walletAddress);
  const forwarder = payoutForwarderAddress();
  if (!forwarder || !isPayoutForwarderConfigured(terms.chainId)) {
    throw new InstantSendWalletError('FORWARDER_UNAVAILABLE', "Couldn't send this payout. Tap Send to try again.");
  }
  const validBefore = BigInt(Math.floor((forwarderDeps.now() + AUTHORIZATION_TTL_MS) / 1000));
  const typed = await authorizationTypedData(
    { userId: opts.userId, orderId: opts.orderId, paycrestOrderId: '', forwarder, ...terms },
    validBefore,
  );
  return {
    validBefore: validBefore.toString(),
    typedData: { domain: typed.domain, types: typed.types, primaryType: typed.primary_type, message: typed.message },
  };
}

/**
 * Crypto cash-out through PayoutForwarder: USDC on Base or Celo, from the user's wallet to their
 * chosen address, gas paid by the relayer. Same money-path rules as bank payouts (saved relayer tx,
 * resume on timeout, receipt-checked attach, recovery). Two ways to authorize:
 * - no `userAuthorization`: the server signs, only for a trusted address on a delegated wallet;
 * - `userAuthorization`: the user signed `prepareCryptoAuthorization`'s typed data in their wallet.
 */
export async function broadcastForwarderCryptoTransfer(opts: {
  privyDid: string;
  userId: string;
  walletAddress: string;
  orderId: bigint;
  userAuthorization?: { signature: Hex; validBefore: string };
}): Promise<{ txHash: string; alreadyBroadcast: boolean }> {
  const remittance = await loadCryptoRemittance(opts);
  if (TransactionService.isOnChainTxHash(remittance.txHash)) {
    return { txHash: remittance.txHash, alreadyBroadcast: true };
  }
  const terms = cryptoPayoutTerms(remittance, opts.walletAddress);
  const forwarder = payoutForwarderAddress();
  if (!forwarder || !isPayoutForwarderConfigured(terms.chainId)) {
    if (TransactionService.isBroadcastClaimHash(remittance.txHash)) {
      throw new InstantSendWalletError('BROADCAST_UNCERTAIN', 'Payment may have been submitted — check history before trying again.');
    }
    throw new InstantSendWalletError('FORWARDER_UNAVAILABLE', "Couldn't send this payout. Tap Send to try again.");
  }
  if (remittance.fundingPath === 'direct') {
    throw new InstantSendWalletError('FUNDING_PATH_MISMATCH', 'This cash-out already started on the direct path');
  }
  if (TransactionService.isBroadcastClaimHash(remittance.txHash)) {
    if (remittance.fundingTxHash && remittance.fundingTxRaw) {
      const result = await resumeStoredFunding(remittance, forwarder);
      await markCryptoDestinationConfirmed(opts.userId, remittance);
      return result;
    }
    throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Broadcast already in progress for this order');
  }
  if (!remittance.txHash.startsWith('pending-')) {
    throw new InstantSendWalletError('NOT_PENDING', 'This cash-out is not awaiting a send');
  }
  const claimKey = TransactionService.paycrestOrderIdFromTxHash(remittance.txHash);
  if (!claimKey) {
    throw new InstantSendWalletError('NOT_PENDING', 'This cash-out is not awaiting a send');
  }

  // Who authorizes: the user (any address, explicit wallet prompt) or the server (trusted address only).
  const now = forwarderDeps.now();
  let userValidBefore: bigint | null = null;
  let walletId: string | null = null;
  if (opts.userAuthorization) {
    const raw = opts.userAuthorization.validBefore;
    const ms = /^\d{1,12}$/.test(raw) ? Number(raw) * 1000 : NaN;
    if (!(ms > now + 30_000 && ms <= now + AUTHORIZATION_TTL_MS + USER_AUTHORIZATION_SLACK_MS)) {
      throw new InstantSendWalletError('AUTHORIZATION_EXPIRED', 'This authorization expired. Tap Send to try again.');
    }
    userValidBefore = BigInt(raw);
  } else {
    // A silent send has no user prompt, so it keeps the tighter crypto cap. The Privy rule allows
    // up to $10k to the forwarder for any sink, so this cap is ours to hold. Over it, the user signs.
    if (terms.amount > BigInt(CRYPTO_INSTANT_SEND_MAX_USD) * 10n ** BigInt(USDC_DECIMALS)) {
      throw new InstantSendWalletError('AMOUNT_CAP', 'Confirm this send in your wallet');
    }
    const destination = terms.sink.toLowerCase();
    const trusted = await CryptoAddressService.listForUser(opts.userId, { backfill: false }).then((rows) =>
      rows.find((r) => r.network === terms.network && r.address.toLowerCase() === destination),
    );
    if (!trusted || !trusted.fastPathEligible) {
      throw new InstantSendWalletError('ADDRESS_NOT_TRUSTED', 'Confirm this send in your wallet');
    }
    const resolved = await forwarderDeps.resolveWallet({ privyDid: opts.privyDid, walletAddress: opts.walletAddress });
    if (!resolved.delegated) {
      throw new InstantSendWalletError('NOT_DELEGATED', 'Enable Instant Send to allow FX-Remit to complete this send');
    }
    walletId = resolved.walletId;
  }

  const balance = (await forwarderDeps.publicClient(terms.chainId).readContract({
    address: terms.usdc,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [terms.payer],
  })) as bigint;
  if (balance < terms.amount) {
    throw new InstantSendWalletError('INSUFFICIENT_USDC', 'Not enough USDC in the wallet for this cash-out');
  }

  const claimed = await TransactionService.claimBroadcastSlot({
    userId: opts.userId,
    orderId: opts.orderId,
    pendingTxHash: remittance.txHash,
    fundingPath: 'forwarder',
  });
  if (!claimed) {
    const again = await TransactionService.findRemittanceForBroadcast({ userId: opts.userId, orderId: opts.orderId });
    if (again && TransactionService.isOnChainTxHash(again.txHash)) {
      return { txHash: again.txHash, alreadyBroadcast: true };
    }
    throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Broadcast already in progress for this order');
  }
  const ctx: FundingContext = {
    userId: opts.userId,
    orderId: opts.orderId,
    paycrestOrderId: claimKey,
    chainId: terms.chainId,
    usdc: terms.usdc,
    forwarder,
    payer: terms.payer,
    sink: terms.sink,
    amount: terms.amount,
  };

  const result = await relayClaimedPayout(ctx, async () => {
    if (userValidBefore !== null) {
      // The dry run proves the signature covers exactly this order, destination and amount.
      return encodePayoutCall(ctx, userValidBefore, opts.userAuthorization!.signature);
    }
    const validBefore = BigInt(Math.floor((now + AUTHORIZATION_TTL_MS) / 1000));
    const signature = await forwarderDeps.signAuthorization(walletId!, await authorizationTypedData(ctx, validBefore));
    return encodePayoutCall(ctx, validBefore, signature);
  });
  await markCryptoDestinationConfirmed(opts.userId, remittance);
  return result;
}

/** The receipt shows PayoutFunded for this order plus both USDC legs of `amount`. */
export function fundingReceiptMatches(receipt: TransactionReceipt, ctx: FundingContext): boolean {
  const usdc = ctx.usdc.toLowerCase();
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
