#!/usr/bin/env node
/**
 * EVM / Paycrest sandbox smoke (NGN + KES).
 *
 * Covers: rate → retail pricing → institutions → optional verify → optional createOrder+getOrder.
 *
 * Usage (from repo root, with apps/pwa/.env.local present):
 *   pnpm --filter @fx-remit/services evm:paycrest-smoke
 *
 * Env:
 *   PAYCREST_API_KEY or NEXT_PUBLIC_PAYCREST_API_KEY (required)
 *   EVM_SMOKE_NETWORKS=base,celo (tried in order per corridor)
 *   EVM_SMOKE_CORRIDORS=NGN,KES (default both; KES may soft-fail if no liquidity)
 *   EVM_SMOKE_STRICT=1 (treat soft failures as hard)
 *   EVM_SMOKE_AMOUNT=1 (rate reference amount)
 *   EVM_SMOKE_NGN_BANK_CODE / EVM_SMOKE_NGN_ACCOUNT (optional verify)
 *   EVM_SMOKE_KES_BANK_CODE / EVM_SMOKE_KES_ACCOUNT (optional verify)
 *   EVM_SMOKE_CREATE_ORDER=1 (opt-in; needs EVM_SMOKE_REFUND_ADDRESS + bank fields)
 *   EVM_SMOKE_REFUND_ADDRESS=0x...
 *   EVM_SMOKE_ACCOUNT_NAME=Sandbox User
 */
import { PaycrestClient } from '../../paycrest/paycrest.client.js';
import { PricingService } from '../../paycrest/pricing.service.js';

type Corridor = 'NGN' | 'KES';

type StepResult = 'pass' | 'fail' | 'soft' | 'skip';

function requiredApiKey(): string {
  const key =
    process.env.PAYCREST_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_PAYCREST_API_KEY?.trim();
  if (!key) {
    throw new Error('Set PAYCREST_API_KEY (or NEXT_PUBLIC_PAYCREST_API_KEY)');
  }
  return key;
}

function logStep(result: StepResult, label: string, detail?: string) {
  const mark =
    result === 'pass'
      ? 'PASS'
      : result === 'fail'
        ? 'FAIL'
        : result === 'soft'
          ? 'SOFT'
          : 'SKIP';
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function networks(): string[] {
  const raw =
    process.env.EVM_SMOKE_NETWORKS ||
    process.env.EVM_SMOKE_NETWORK ||
    'base,celo';
  return raw
    .split(',')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
}

function corridors(): Corridor[] {
  const raw = process.env.EVM_SMOKE_CORRIDORS || 'NGN,KES';
  return raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is Corridor => c === 'NGN' || c === 'KES');
}

async function findRate(
  client: PaycrestClient,
  corridor: Corridor,
  amount: string,
): Promise<{ network: string; rate: number }> {
  const errors: string[] = [];
  for (const network of networks()) {
    try {
      const wholesale = await client.getRate(network, 'USDC', amount, corridor);
      if (!wholesale.rate || wholesale.rate <= 0) {
        errors.push(`${network}: invalid rate ${wholesale.rate}`);
        continue;
      }
      return { network, rate: wholesale.rate };
    } catch (e: any) {
      errors.push(`${network}: ${e.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

async function smokeCorridor(
  client: PaycrestClient,
  corridor: Corridor,
  amount: string,
): Promise<'pass' | 'fail' | 'soft'> {
  console.log(`\n=== Corridor ${corridor} ===`);
  let hardFail = false;
  let softFail = false;

  // 1) Rate + retail
  let workingNetwork = networks()[0] || 'base';
  try {
    const found = await findRate(client, corridor, amount);
    workingNetwork = found.network;
    const retail = PricingService.calculateRetailRate(found.rate);
    if (!(retail < found.rate)) {
      throw new Error(`retail ${retail} should be < wholesale ${found.rate}`);
    }
    logStep(
      'pass',
      'quote + retail markup',
      `${workingNetwork} wholesale=${found.rate} retail=${retail}`,
    );
  } catch (e: any) {
    softFail = true;
    logStep(
      'soft',
      'quote + retail markup',
      `no liquidity / provider — ${e.message}`,
    );
  }

  // 2) Institutions (Paycrest uses ISO-4217 fiat, e.g. NGN)
  try {
    const list = await client.getInstitutions(corridor);
    if (!Array.isArray(list)) {
      throw new Error(`unexpected shape: ${typeof list}`);
    }
    if (list.length === 0) {
      softFail = true;
      logStep(
        'soft',
        `institutions ${corridor}`,
        'API returned [] (provider directory empty or gated)',
      );
    } else {
      logStep('pass', `institutions ${corridor}`, `${list.length} providers`);
    }
  } catch (e: any) {
    softFail = true;
    logStep('soft', `institutions ${corridor}`, e.message);
  }

  // 3) Optional verify
  const bankCode =
    corridor === 'NGN'
      ? process.env.EVM_SMOKE_NGN_BANK_CODE
      : process.env.EVM_SMOKE_KES_BANK_CODE;
  const account =
    corridor === 'NGN'
      ? process.env.EVM_SMOKE_NGN_ACCOUNT
      : process.env.EVM_SMOKE_KES_ACCOUNT;

  if (bankCode && account) {
    try {
      const name = await client.verifyAccount({
        institution: bankCode,
        accountIdentifier: account,
      });
      logStep('pass', 'verify-account', String(name));
    } catch (e: any) {
      hardFail = true;
      logStep('fail', 'verify-account', e.message);
    }
  } else {
    logStep(
      'skip',
      'verify-account',
      `set EVM_SMOKE_${corridor}_BANK_CODE and EVM_SMOKE_${corridor}_ACCOUNT`,
    );
  }

  // 4) Optional create + get order
  if (process.env.EVM_SMOKE_CREATE_ORDER === '1') {
    const refund = process.env.EVM_SMOKE_REFUND_ADDRESS?.trim();
    if (!refund || refund === '0x0000000000000000000000000000000000000000') {
      hardFail = true;
      logStep('fail', 'create-order', 'EVM_SMOKE_REFUND_ADDRESS missing or zero');
    } else if (!bankCode || !account) {
      hardFail = true;
      logStep('fail', 'create-order', 'need bank code + account for create');
    } else {
      try {
        const orderAmount = process.env.EVM_SMOKE_ORDER_AMOUNT ?? '1';
        const order = await client.createOrder({
          amount: orderAmount,
          source: {
            type: 'crypto',
            currency: 'USDC',
            network: workingNetwork,
            refundAddress: refund,
          },
          destination: {
            type: 'fiat',
            currency: corridor,
            recipient: {
              institution: bankCode,
              accountIdentifier: account,
              accountName: process.env.EVM_SMOKE_ACCOUNT_NAME ?? 'Sandbox User',
              memo: 'FX Remit smoke',
            },
          },
          reference: `smoke-${corridor}-${Date.now()}`,
        });
        logStep('pass', 'create-order', `id=${order.id} status=${order.status}`);

        const fetched = await client.getOrder(order.id);
        logStep(
          'pass',
          'get-order',
          `id=${fetched.id ?? order.id} status=${fetched.status}`,
        );
      } catch (e: any) {
        hardFail = true;
        logStep('fail', 'create-order/get-order', e.message);
      }
    }
  } else {
    logStep('skip', 'create-order', 'set EVM_SMOKE_CREATE_ORDER=1 to opt in');
  }

  if (hardFail) return 'fail';
  if (softFail) return 'soft';
  return 'pass';
}

async function main() {
  const apiKey = requiredApiKey();
  const amount = process.env.EVM_SMOKE_AMOUNT || '1';
  const strict = process.env.EVM_SMOKE_STRICT === '1';
  const client = new PaycrestClient(apiKey);
  const list = corridors();

  console.log('EVM Paycrest sandbox smoke');
  console.log(`Networks: ${networks().join(', ')}`);
  console.log(`Corridors: ${list.join(', ')}`);
  console.log(`Rate amount: ${amount}`);
  console.log(`Strict: ${strict}`);

  const results: Record<string, string> = {};
  for (const corridor of list) {
    results[corridor] = await smokeCorridor(client, corridor, amount);
  }

  console.log('\n--- Summary ---');
  for (const [c, r] of Object.entries(results)) {
    console.log(`${c}: ${r}`);
  }

  const failed = Object.values(results).includes('fail');
  const soft = Object.values(results).includes('soft');
  if (failed || (strict && soft)) {
    console.error('\nSmoke finished with failures');
    process.exit(1);
  }
  if (soft) {
    console.log(
      '\nSmoke finished with soft provider gaps (set EVM_SMOKE_STRICT=1 to fail on those)',
    );
  } else {
    console.log('\nAll corridor smokes passed (within opted-in steps)');
  }}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
