#!/usr/bin/env node
/**
 * Ops: list or recover bank payouts stuck mid-send on the PayoutForwarder path.
 *
 * Usage (from packages/services):
 *   pnpm exec node --import tsx --env-file=../../apps/pwa/.env.local \
 *     src/evm/scripts/forwarder-claims.ts                  # list stuck forwarder claims
 *   ... forwarder-claims.ts --recover                      # recover all (same pass as the nightly cron)
 *   ... forwarder-claims.ts --recover <orderId>            # recover one order now, regardless of age
 *
 * Recovery never releases a claim the contract reports as funded; those are kept and
 * printed as "kept-for-ops" (attach the funding tx with cancel-stuck-pending --attach).
 */
import { prisma } from '@fx-remit/database';
import { recoverStuckForwarderClaims } from '../forwarder-payout.js';

async function main() {
  const recover = process.argv.includes('--recover');
  const orderArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  const orderId = orderArg ? BigInt(orderArg) : undefined;

  if (!recover) {
    const rows = await prisma.transaction.findMany({
      where: {
        type: 'REMITTANCE',
        status: { in: ['PENDING', 'PROCESSING'] },
        txHash: { startsWith: 'broadcasting-' },
        fundingPath: 'forwarder',
        ...(orderId !== undefined ? { orderId } : {}),
      },
      select: { orderId: true, status: true, amountUsd: true, fundingTxHash: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    });
    if (!rows.length) {
      console.log('No forwarder payouts stuck mid-send.');
      return;
    }
    for (const r of rows) {
      console.log(
        `${r.orderId}  ${r.status}  $${r.amountUsd.toString()}  saved tx: ${r.fundingTxHash ?? 'none'}  since ${r.updatedAt.toISOString()}`,
      );
    }
    console.log('\nRun with --recover (optionally an orderId) to settle them.');
    return;
  }

  const result = await recoverStuckForwarderClaims(
    orderId !== undefined ? { orderId, olderThanMs: 0 } : {},
  );
  if ('skipped' in result) {
    console.log(`Skipped: ${result.skipped}`);
    return;
  }
  if (!result.results.length) {
    console.log('Nothing to recover.');
    return;
  }
  for (const r of result.results) console.log(`${r.orderId}  ${r.outcome}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
