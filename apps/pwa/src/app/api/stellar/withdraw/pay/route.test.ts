process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
process.env.STELLAR_NETWORK = 'testnet';

import { describe, it, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { clearAnchorTomlCache, seedAnchorTomlCache } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  clearAnchorTomlCache();
  delete process.env.STELLAR_TEST_SECRET;
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
  clearAnchorTomlCache();
  seedAnchorTomlCache('testanchor.stellar.org', {
    webAuthEndpoint: 'https://testanchor.stellar.org/auth',
    transferServerSep24: 'https://testanchor.stellar.org/sep24',
  });
});

function postJson(body: unknown) {
  return new NextRequest('http://localhost/api/stellar/withdraw/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/stellar/withdraw/pay — validation', () => {
  it('returns 400 without STELLAR_TEST_SECRET', async () => {
    delete process.env.STELLAR_TEST_SECRET;
    const res = await POST(
      postJson({ corridor: 'NGN', transaction_id: 'tx-1' }),
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /STELLAR_TEST_SECRET/);
  });

  it('returns 400 without transaction_id', async () => {
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(postJson({ corridor: 'NGN' }));
    assert.equal(res.status, 400);
  });

  it('returns 404 when stellar disabled', async () => {
    process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'false';
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(
      postJson({ corridor: 'NGN', transaction_id: 'tx-1' }),
    );
    assert.equal(res.status, 404);
  });
});
