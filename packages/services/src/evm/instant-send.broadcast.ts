import { encodeFunctionData, isAddress, parseUnits } from 'viem';
import { PrivyClient } from '@privy-io/node';
import { PAYCREST_SETTLEMENT, PayoutService } from '../paycrest/payout.service.js';
import { TransactionService } from '../transactions/transaction.service.js';
import {
  ERC20_TRANSFER_ABI,
  INSTANT_SEND_MAX_USDC_RAW,
  isInstantSendServerConfigured,
} from './instant-send.policy.js';

export class InstantSendNotConfiguredError extends Error {
  readonly code = 'INSTANT_SEND_NOT_CONFIGURED';
  constructor() {
    super('Instant Send server signing is not configured');
    this.name = 'InstantSendNotConfiguredError';
  }
}

export class InstantSendWalletError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'InstantSendWalletError';
    this.code = code;
  }
}

function privyNodeClient() {
  return new PrivyClient({
    appId:
      process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ||
      process.env.PRIVY_APP_ID?.trim() ||
      '',
    appSecret: process.env.PRIVY_APP_SECRET?.trim() || '',
  });
}

function authorizationPrivateKey(): string {
  const key = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim();
  if (!key) {
    throw new InstantSendNotConfiguredError();
  }
  return key;
}

/**
 * Resolve Privy wallet id for an embedded wallet address owned by privyDid.
 */
export async function resolveDelegatedWalletId(opts: {
  privyDid: string;
  walletAddress: string;
}): Promise<{ walletId: string; delegated: boolean }> {
  const client = privyNodeClient();
  const address = opts.walletAddress.trim().toLowerCase();

  let user;
  try {
    user = await client.users()._get(opts.privyDid);
  } catch {
    try {
      user = await client.users().getByWalletAddress({ address: opts.walletAddress });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InstantSendWalletError(
        'WALLET_LOOKUP_FAILED',
        `Unable to resolve Privy wallet: ${message}`,
      );
    }
  }

  if (user.id !== opts.privyDid) {
    throw new InstantSendWalletError(
      'WALLET_OWNERSHIP',
      'Wallet does not belong to the authenticated user',
    );
  }

  const embedded = user.linked_accounts?.find(
    (a) =>
      a.type === 'wallet' &&
      'wallet_client_type' in a &&
      (a as { wallet_client_type?: string }).wallet_client_type === 'privy' &&
      'address' in a &&
      typeof (a as { address?: string }).address === 'string' &&
      (a as { address: string }).address.toLowerCase() === address,
  ) as
    | {
        id?: string | null;
        delegated?: boolean;
        address: string;
      }
    | undefined;

  if (!embedded?.id) {
    throw new InstantSendWalletError(
      'WALLET_ID_MISSING',
      'Embedded wallet id not found — user must enable Instant Send',
    );
  }

  return {
    walletId: embedded.id,
    delegated: embedded.delegated === true,
  };
}

function settlementAmountHuman(
  amountToTransfer: string | number | undefined,
  fallbackUsd: string | number,
): string {
  if (amountToTransfer == null || amountToTransfer === '') {
    return String(fallbackUsd);
  }
  return String(amountToTransfer);
}

/**
 * Server-authorized USDC transfer for a PENDING remittance.
 * Builds calldata only from Paycrest settlement + reserved ledger amount —
 * never from client-supplied to/data/value.
 */
export async function broadcastSettlementTransfer(opts: {
  privyDid: string;
  userId: string;
  walletAddress: string;
  orderId: bigint;
}): Promise<{ txHash: string; alreadyBroadcast: boolean }> {
  if (!isInstantSendServerConfigured()) {
    throw new InstantSendNotConfiguredError();
  }

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

  if (TransactionService.isBroadcastClaimHash(remittance.txHash)) {
    throw new InstantSendWalletError(
      'BROADCAST_IN_PROGRESS',
      'Broadcast already in progress for this order',
    );
  }

  if (!remittance.txHash.startsWith('pending-')) {
    throw new InstantSendWalletError(
      'NOT_PENDING',
      'Remittance is not awaiting broadcast',
    );
  }

  const pendingTxHash = remittance.txHash;
  const paycrestOrderId =
    TransactionService.paycrestOrderIdFromTxHash(pendingTxHash);
  if (
    !paycrestOrderId ||
    TransactionService.isAppLocalPendingKey(
      paycrestOrderId,
      remittance.externalId,
    )
  ) {
    throw new InstantSendWalletError(
      'PAYCREST_ORDER_MISSING',
      'Paycrest order is not linked yet — wait for create-pending to finish',
    );
  }

  const settlement = await PayoutService.getSettlementOrder(paycrestOrderId);
  if (!settlement.success) {
    throw new InstantSendWalletError(
      'PAYCREST_LOOKUP_FAILED',
      settlement.error || 'Failed to load Paycrest settlement',
    );
  }

  const receiveAddress = settlement.order.providerAccount?.receiveAddress;
  if (!receiveAddress || !isAddress(receiveAddress)) {
    throw new InstantSendWalletError(
      'INVALID_RECEIVE_ADDRESS',
      'Paycrest did not provide a valid receive address',
    );
  }

  const amountHuman = settlementAmountHuman(
    settlement.order.providerAccount?.amountToTransfer,
    remittance.amountUsd.toString(),
  );
  const decimals = settlement.settlement.decimals ?? PAYCREST_SETTLEMENT.decimals;
  const tokenAddress =
    (settlement.settlement.tokenAddress as `0x${string}`) ||
    PAYCREST_SETTLEMENT.tokenAddress;

  if (tokenAddress.toLowerCase() !== PAYCREST_SETTLEMENT.tokenAddress.toLowerCase()) {
    throw new InstantSendWalletError(
      'UNSUPPORTED_TOKEN',
      `Instant Send only supports ${PAYCREST_SETTLEMENT.token}`,
    );
  }

  const amountRaw = parseUnits(amountHuman, decimals);
  if (amountRaw <= 0n) {
    throw new InstantSendWalletError('INVALID_AMOUNT', 'Settlement amount must be positive');
  }
  if (amountRaw > INSTANT_SEND_MAX_USDC_RAW) {
    throw new InstantSendWalletError(
      'AMOUNT_CAP',
      'Settlement amount exceeds Instant Send policy cap',
    );
  }

  const { walletId, delegated } = await resolveDelegatedWalletId({
    privyDid: opts.privyDid,
    walletAddress: opts.walletAddress,
  });

  if (!delegated) {
    throw new InstantSendWalletError(
      'NOT_DELEGATED',
      'Enable Instant Send to allow FX-Remit to complete payouts',
    );
  }

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [receiveAddress as `0x${string}`, amountRaw],
  });

  // Atomic claim before Privy — concurrent POSTs must not both sendTransaction.
  const claimed = await TransactionService.claimBroadcastSlot({
    userId: opts.userId,
    orderId: opts.orderId,
    pendingTxHash,
  });
  if (!claimed) {
    const again = await TransactionService.findPendingRemittanceForBroadcast({
      userId: opts.userId,
      orderId: opts.orderId,
    });
    if (again && TransactionService.isOnChainTxHash(again.txHash)) {
      return { txHash: again.txHash, alreadyBroadcast: true };
    }
    throw new InstantSendWalletError(
      'BROADCAST_IN_PROGRESS',
      'Broadcast already in progress for this order',
    );
  }

  const client = privyNodeClient();
  const authKey = authorizationPrivateKey();

  let hash: string;
  try {
    const result = await client.wallets().ethereum().sendTransaction(walletId, {
      caip2: `eip155:${PAYCREST_SETTLEMENT.chainId}`,
      params: {
        transaction: {
          to: tokenAddress,
          data,
          chain_id: PAYCREST_SETTLEMENT.chainId,
          value: '0x0',
        },
      },
      authorization_context: {
        authorization_private_keys: [authKey],
      },
    });
    hash = result.hash;
  } catch (err) {
    await TransactionService.releaseBroadcastClaim({
      userId: opts.userId,
      orderId: opts.orderId,
      paycrestOrderId,
    }).catch((releaseErr) => {
      console.error(
        '[InstantSend] releaseBroadcastClaim failed after Privy error:',
        releaseErr,
      );
    });
    const message = err instanceof Error ? err.message : String(err);
    throw new InstantSendWalletError('BROADCAST_FAILED', message);
  }

  if (!TransactionService.isOnChainTxHash(hash)) {
    await TransactionService.releaseBroadcastClaim({
      userId: opts.userId,
      orderId: opts.orderId,
      paycrestOrderId,
    }).catch(() => undefined);
    throw new InstantSendWalletError(
      'INVALID_HASH',
      'Privy returned an invalid transaction hash',
    );
  }

  try {
    await TransactionService.attachOnChainHash({
      userId: opts.userId,
      orderId: opts.orderId,
      txHash: hash,
    });
  } catch (attachErr) {
    // Privy already broadcast — still return the hash so the client can sync-hash.
    // Do not release the claim (would reopen a double-send window).
    console.error(
      '[InstantSend] attachOnChainHash failed after broadcast; returning hash for client sync',
      attachErr,
    );
  }

  return { txHash: hash, alreadyBroadcast: false };
}
