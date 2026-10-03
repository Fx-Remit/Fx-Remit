#!/usr/bin/env node
/**
 * Ops (report only): bank payouts where the wallet sent more than the ledger reserved
 * because Paycrest added a sender fee on top (#170). Prints each order and the gap per user.
 * It changes nothing; correct balances by hand if a gap is worth it.
 *
 * Usage (from packages/services):
 *   pnpm exec node --import tsx --env-file=../../apps/pwa/.env.local \
 *     src/evm/scripts/sender-fee-drift.ts
 */
import { Decimal } from 'decimal.js';
import { prisma } from '@fx-remit/database';
import { PaycrestClient } from '../../paycrest/paycrest.client.js';

async function main() {
  const key = process.env.PAYCREST_API_KEY?.trim() || process.env.NEXT_PUBLIC_PAYCREST_API_KEY?.trim();
  if (!key) throw new Error('PAYCREST_API_KEY missing');
  const paycrest = new PaycrestClient(key);

  const rows = await prisma.transaction.findMany({
    where: {
      type: 'REMITTANCE',
      status: 'COMPLETED',
      anchorTransactionId: { not: null },
      NOT: { recipientBank: { startsWith: 'crypto:' } },
    },
    select: { userId: true, orderId: true, amountUsd: true, anchorTransactionId: true },
  });

  const perUser = new Map<string, Decimal>();
  for (const row of rows) {
    try {
      const order = await paycrest.getOrder(row.anchorTransactionId!);
      const sent = order?.providerAccount?.amountToTransfer;
      if (sent == null) continue;
      const gap = new Decimal(String(sent)).minus(row.amountUsd.toString());
      if (gap.lte(0)) continue;
      console.log(`${row.orderId}  user ${row.userId}  reserved ${row.amountUsd}  sent ${sent}  gap ${gap.toFixed(6)}`);
      perUser.set(row.userId, (perUser.get(row.userId) ?? new Decimal(0)).plus(gap));
    } catch (err) {
      console.error(`${row.orderId}: Paycrest lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!perUser.size) {
    console.log(`Checked ${rows.length} completed bank payouts: no gaps.`);
    return;
  }
  console.log('\nGap per user (wallet sent more than the ledger debited):');
  for (const [userId, gap] of perUser) console.log(`  ${userId}  ${gap.toFixed(6)} USDC`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
