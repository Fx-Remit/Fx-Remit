#!/usr/bin/env node
/**
 * Ops: cancel a stuck pending-* remittance and restore spendable.
 *
 * Usage (from repo root):
 *   pnpm --filter @fx-remit/services exec node --import tsx --env-file=../../apps/pwa/.env.local \
 *     src/evm/scripts/cancel-stuck-pending.ts 1787732637571
 */
import { prisma } from '@fx-remit/database';
import {
  TransactionService,
  ProviderOrderStillLiveError,
} from '../../transactions/transaction.service.js';

async function main() {
  const orderIdRaw = process.argv[2];
  if (!orderIdRaw) {
    console.error('Usage: cancel-stuck-pending.ts <orderId>');
    process.exit(1);
  }

  const orderId = BigInt(orderIdRaw);
  const tx = await prisma.transaction.findFirst({
    where: { orderId, type: 'REMITTANCE' },
    orderBy: { createdAt: 'desc' },
  });

  if (!tx) {
    console.error(`No REMITTANCE found for orderId=${orderIdRaw}`);
    process.exit(1);
  }

  console.log('Found:', {
    id: tx.id,
    orderId: tx.orderId.toString(),
    status: tx.status,
    txHash: tx.txHash,
    externalId: tx.externalId,
    amountUsd: tx.amountUsd.toString(),
  });

  if (!tx.txHash.startsWith('pending-') && !tx.txHash.startsWith('abandoned-')) {
    console.error('Refusing: txHash is not a placeholder (may be on-chain).');
    process.exit(1);
  }

  const key = tx.externalId ?? tx.txHash.replace(/^(pending|abandoned)-/, '');
  if (!key) {
    console.error('No externalId / placeholder key to cancel with.');
    process.exit(1);
  }

  const paycrestId = tx.txHash.startsWith('pending-')
    ? tx.txHash.slice('pending-'.length)
    : null;

  try {
    const result = await TransactionService.cancelAbandonedPending(key);
    console.log('Cancelled:', {
      status: result?.status,
      txHash: result?.txHash,
      externalId: result?.externalId,
    });
  } catch (err) {
    if (err instanceof ProviderOrderStillLiveError) {
      console.error('Blocked (Paycrest may still be fundable):', err.message);
      if (paycrestId && !TransactionService.isAppLocalPendingKey(paycrestId, tx.externalId)) {
        const { PayoutService } = await import('../../paycrest/payout.service.js');
        const live = await PayoutService.getSettlementOrder(paycrestId);
        const validUntil = (live.order as { providerAccount?: { validUntil?: string } } | undefined)
          ?.providerAccount?.validUntil;
        console.error('Paycrest status:', (live.order as { status?: string } | undefined)?.status);
        console.error('validUntil:', validUntil ?? '(unknown)');
        console.error('Re-run this script after validUntil (order should be expired).');
      } else {
        console.error(
          'Wait until Paycrest order is expired/cancelled/failed, then re-run.',
        );
      }
      process.exit(2);
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
