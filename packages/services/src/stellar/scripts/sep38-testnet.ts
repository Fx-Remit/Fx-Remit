#!/usr/bin/env node
/**
 * SEP-38 quote smoke against SDF testanchor (USD stand-in for NGN/KES).
 *
 * Usage:
 *   pnpm --filter @fx-remit/services stellar:sep38-test
 */
import { getStellarRetailQuote } from '../index.js';
import { clearAnchorTomlCache } from '../anchor-toml.js';

async function main() {
  clearAnchorTomlCache();
  const corridor = (process.env.STELLAR_TEST_CORRIDOR?.toUpperCase() === 'KES'
    ? 'KES'
    : 'NGN') as 'NGN' | 'KES';
  const amount = process.env.STELLAR_TEST_AMOUNT ?? '10';

  console.log(`Corridor (product): ${corridor}`);
  console.log(`Sell amount (USDC): ${amount}`);

  const { wholesale, retail } = await getStellarRetailQuote(corridor, amount);

  console.log('SEP-38 quote OK');
  console.log(`Anchor: ${wholesale.anchor_id}`);
  console.log(`Destination currency: ${wholesale.destination_currency}`);
  console.log(`Wholesale rate (fiat per USDC): ${wholesale.rate}`);
  console.log(`Retail rate: ${retail.retail_rate}`);
  if (wholesale.demo_fiat) {
    console.log(`Demo fiat: ${wholesale.demo_fiat}`);
    console.log(`Note: ${wholesale.demo_note}`);
  }
}

main().catch((err) => {
  console.error('[sep38-testnet]', err.message ?? err);
  process.exit(1);
});
