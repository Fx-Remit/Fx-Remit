import { encodeFunctionData, parseUnits } from 'viem';
import { PrivyClient } from '@privy-io/node';
import { TransactionService } from '../transactions/transaction.service.js';
import { CryptoAddressService } from '../crypto-addresses/crypto-address.service.js';
import { DEPOSIT_TOKENS } from '../deposits/deposit.tokens.js';
import { ERC20_TRANSFER_ABI } from './instant-send.policy.js';
import { CRYPTO_INSTANT_SEND_MAX_USD, isCryptoInstantSendConfigured } from './crypto-instant-send.policy.js';
import { resolveDelegatedWalletId, InstantSendNotConfiguredError, InstantSendWalletError } from './instant-send.broadcast.js';

const CRYPTO_CASH_OUT_CHAIN_ID: Record<string, number> = {
  base: 8453,
  celo: 42220,
};

function privyNodeClient() {
  return new PrivyClient({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || process.env.PRIVY_APP_ID?.trim() || '',
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


export async function broadcastCryptoTransfer(opts: {
  privyDid: string;
  userId: string;
  walletAddress: string;
  orderId: bigint;
}): Promise<{ txHash: string; alreadyBroadcast: boolean }> {
  if (!isCryptoInstantSendConfigured()) {
    throw new InstantSendNotConfiguredError();
  }

  const remittance = await TransactionService.findRemittanceForBroadcast({
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
    throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Broadcast already in progress for this order');
  }

  if (!remittance.txHash.startsWith('pending-')) {
    throw new InstantSendWalletError('NOT_PENDING', 'Remittance is not awaiting broadcast');
  }

  const network = (remittance.recipientBank || '').startsWith('crypto:')
    ? (remittance.recipientBank || '').slice('crypto:'.length)
    : null;
  const destinationAddress = (remittance.recipientAcc || '').trim().toLowerCase();
  const chainId = network ? CRYPTO_CASH_OUT_CHAIN_ID[network] : null;

  if (!network || !chainId || !destinationAddress) {
    throw new InstantSendWalletError('NOT_CRYPTO_CASH_OUT', 'Order is not a crypto cash-out');
  }

  const savedAddress = await CryptoAddressService.listForUser(opts.userId, { backfill: false }).then(
    (rows) => rows.find((r) => r.network === network && r.address.toLowerCase() === destinationAddress),
  );

  if (!savedAddress || !savedAddress.fastPathEligible) {
    throw new InstantSendWalletError(
      'ADDRESS_NOT_TRUSTED',
      'This address is not yet eligible for Instant Send — confirm this send in your wallet instead',
    );
  }

  const token = DEPOSIT_TOKENS[chainId]?.find(
    (t) => t.symbol.toUpperCase() === (remittance.sourceToken || '').toUpperCase(),
  );
  if (!token) {
    throw new InstantSendWalletError('UNSUPPORTED_TOKEN', `${remittance.sourceToken} is not supported on ${network}`);
  }

  const amountRaw = parseUnits(remittance.amountUsd.toString(), token.decimals);
  if (amountRaw <= 0n) {
    throw new InstantSendWalletError('INVALID_AMOUNT', 'Transfer amount must be positive');
  }
  const capRaw = BigInt(CRYPTO_INSTANT_SEND_MAX_USD) * BigInt(10) ** BigInt(token.decimals);
  if (amountRaw > capRaw) {
    throw new InstantSendWalletError('AMOUNT_CAP', 'Transfer amount exceeds Instant Send policy cap');
  }

  const { walletId, delegated } = await resolveDelegatedWalletId({
    privyDid: opts.privyDid,
    walletAddress: opts.walletAddress,
  });

  if (!delegated) {
    throw new InstantSendWalletError('NOT_DELEGATED', 'Enable Instant Send to allow FX-Remit to complete this send');
  }

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [destinationAddress as `0x${string}`, amountRaw],
  });

  const pendingTxHash = remittance.txHash;
  const claimed = await TransactionService.claimBroadcastSlot({
    userId: opts.userId,
    orderId: opts.orderId,
    pendingTxHash,
  });
  if (!claimed) {
    const again = await TransactionService.findRemittanceForBroadcast({
      userId: opts.userId,
      orderId: opts.orderId,
    });
    if (again && TransactionService.isOnChainTxHash(again.txHash)) {
      return { txHash: again.txHash, alreadyBroadcast: true };
    }
    throw new InstantSendWalletError('BROADCAST_IN_PROGRESS', 'Broadcast already in progress for this order');
  }

  const client = privyNodeClient();
  const authKey = authorizationPrivateKey();

  let hash: string;
  try {
    const result = await client.wallets().ethereum().sendTransaction(walletId, {
      caip2: `eip155:${chainId}`,
      params: {
        transaction: {
          to: token.address,
          data,
          chain_id: chainId,
          value: '0x0',
        },
      },
      authorization_context: {
        authorization_private_keys: [authKey],
      },
    });
    hash = result.hash;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[CryptoInstantSend] Privy failure after claim; leaving broadcasting-* held', {
      orderId: opts.orderId.toString(),
      message,
    });
    throw new InstantSendWalletError(
      'BROADCAST_UNCERTAIN',
      'Broadcast may have been submitted — check history before sending again',
    );
  }

  if (!TransactionService.isOnChainTxHash(hash)) {
    console.error('[CryptoInstantSend] Invalid hash after Privy response; leaving broadcasting-* claim held', {
      orderId: opts.orderId.toString(),
      hash,
    });
    throw new InstantSendWalletError(
      'BROADCAST_UNCERTAIN',
      'Broadcast response was invalid — check history before sending again',
    );
  }

  try {
    await TransactionService.attachOnChainHash({
      userId: opts.userId,
      orderId: opts.orderId,
      txHash: hash,
    });
    await CryptoAddressService.markFirstConfirmed(opts.userId, network, destinationAddress);
  } catch (attachErr) {
    console.error(
      '[CryptoInstantSend] attachOnChainHash failed after broadcast; returning hash for client sync',
      attachErr,
    );
  }

  return { txHash: hash, alreadyBroadcast: false };
}
