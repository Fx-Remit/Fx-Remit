#!/usr/bin/env node
/**
 * Ops: sync one remittance from Paycrest or force COMPLETED when already settled.
 *
 * Usage (from packages/services):
 *   pnpm exec node --import tsx --env-file=../../apps/pwa/.env.local \
 *     src/evm/scripts/sync-remittance-status.ts <orderId>
 *
 * Skip Paycrest poll (dashboard already shows settled):
 *   ... sync-remittance-status.ts <orderId> --force-completed
 */
import { prisma } from '@fx-remit/database';
import { TransactionService } from '../../transactions/transaction.service.js';

async function main() {
  const orderIdRaw = process.argv[2];
  if (!orderIdRaw) {
    console.error(
      'Usage: sync-remittance-status.ts <orderId> [--force-completed]',
    );
    process.exit(1);
  }

  const forceCompleted = process.argv.includes('--force-completed');
  const orderId = BigInt(orderIdRaw);

  const tx = await prisma.transaction.findFirst({
    where: { orderId, type: 'REMITTANCE' },
    orderBy: { createdAt: 'desc' },
  });

  if (!tx) {
    console.error(`No REMITTANCE found for orderId=${orderIdRaw}`);
    process.exit(1);
  }

  console.log('Before:', {
    id: tx.id,
    orderId: tx.orderId.toString(),
    status: tx.status,
    txHash: tx.txHash,
    externalId: tx.externalId,
    anchorTransactionId: tx.anchorTransactionId,
  });

  if (tx.status === 'COMPLETED') {
    console.log('Already COMPLETED — nothing to do.');
    return;
  }

  if (forceCompleted) {
    const updated = await prisma.transaction.updateMany({
      where: {
        id: tx.id,
        status: { notIn: ['COMPLETED', 'FAILED'] },
      },
      data: { status: 'COMPLETED', updatedAt: new Date() },
    });
    if (updated.count !== 1) {
      console.error('Force update lost CAS — re-read row and retry.');
      process.exit(1);
    }
  } else {
    const synced = await TransactionService.syncPaycrestStatusForRemittance({
      userId: tx.userId,
      orderId,
    });
    if (synced?.status !== 'COMPLETED') {
      console.error(
        'Paycrest sync did not reach COMPLETED. If Paycrest dashboard shows settled, retry with --force-completed.',
      );
      process.exit(1);
    }
  }

  const after = await prisma.transaction.findUnique({ where: { id: tx.id } });
  console.log('After:', {
    id: after?.id,
    status: after?.status,
    txHash: after?.txHash,
    anchorTransactionId: after?.anchorTransactionId,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
