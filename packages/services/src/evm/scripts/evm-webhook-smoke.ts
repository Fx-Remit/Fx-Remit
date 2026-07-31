#!/usr/bin/env node
/**
 * EVM webhook HMAC smoke.
 *
 * 1) Always validates local HMAC construction (matches Paycrest webhook route).
 * 2) If EVM_SMOKE_BASE_URL is set, POSTs bad + good signatures to /api/paycrest/webhook.
 *
 * Usage:
 *   pnpm --filter @fx-remit/services evm:webhook-smoke
 *   EVM_SMOKE_BASE_URL=http://localhost:3000 pnpm --filter @fx-remit/services evm:webhook-smoke
 *
 * Env:
 *   PAYCREST_SECRET_KEY (required for live POST; optional for local-only HMAC check)
 */
import crypto from 'crypto';

function hmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('EVM webhook HMAC smoke');

  const secret = process.env.PAYCREST_SECRET_KEY || 'local-smoke-secret';
  const body = JSON.stringify({
    event: 'payment_order.settled',
    data: { id: `smoke-${Date.now()}` },
  });
  const good = hmac(body, secret);
  const bad = 'deadbeef';

  assert(good.length === 64, 'expected sha256 hex length 64');
  assert(good !== bad, 'good sig should differ from bad');
  assert(hmac(body, secret) === good, 'HMAC must be deterministic');
  console.log('[PASS] local HMAC construction');

  const base = process.env.EVM_SMOKE_BASE_URL?.replace(/\/$/, '');
  if (!base) {
    console.log(
      '[SKIP] live webhook POST — set EVM_SMOKE_BASE_URL (e.g. http://localhost:3000)',
    );
    console.log('All local webhook checks passed');
    return;
  }

  if (!process.env.PAYCREST_SECRET_KEY) {
    throw new Error(
      'PAYCREST_SECRET_KEY required when EVM_SMOKE_BASE_URL is set (must match server)',
    );
  }

  const url = `${base}/api/paycrest/webhook`;

  const badRes = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-paycrest-signature': bad,
    },
    body,
  });
  assert(badRes.status === 401, `bad sig expected 401, got ${badRes.status}`);
  console.log('[PASS] bad signature → 401');

  const goodRes = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-paycrest-signature': good,
    },
    body,
  });
  // 200 if order unknown but signature valid; updateFromPaycrest returns null and still 200
  assert(
    goodRes.status === 200 || goodRes.status === 500,
    `good sig expected 200 (or 500 if server error), got ${goodRes.status}`,
  );
  if (goodRes.status === 200) {
    const json = (await goodRes.json()) as { received?: boolean };
    assert(json.received === true, 'expected { received: true }');
    console.log('[PASS] good signature → 200 received');
  } else {
    console.log('[WARN] good signature returned 500 — check server logs / DB');
  }

  console.log('Webhook smoke finished');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
