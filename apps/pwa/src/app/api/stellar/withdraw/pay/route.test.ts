process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
process.env.STELLAR_NETWORK = 'testnet';
process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-privy-app';
process.env.PRIVY_APP_SECRET ??= 'test-privy-secret';

import { describe, it, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { PrivyClient } from '@privy-io/server-auth';
import { clearAnchorTomlCache, seedAnchorTomlCache } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
  delete process.env.STELLAR_TEST_SECRET;
  delete process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS;
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
  process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS = 'did:privy:test';
  clearAnchorTomlCache();
  seedAnchorTomlCache('testanchor.stellar.org', {
    webAuthEndpoint: 'https://testanchor.stellar.org/auth',
    signingKey: 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57',
    transferServerSep24: 'https://testanchor.stellar.org/sep24',
  });
  mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
    userId: 'did:privy:test',
  }));
});

function postJson(body: unknown, opts?: { authorization?: string | null }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.authorization !== null) {
    headers.Authorization = opts?.authorization ?? 'Bearer test-token';
  }
  return new NextRequest('http://localhost/api/stellar/withdraw/pay', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/stellar/withdraw/pay — auth (#92)', () => {
  it('returns 401 without Authorization', async () => {
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(
      postJson({ corridor: 'NGN', transaction_id: 'tx-1' }, { authorization: null }),
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  it('returns 401 when Privy token is invalid', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => {
      throw new Error('bad token');
    });
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(postJson({ corridor: 'NGN', transaction_id: 'tx-1' }));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Invalid authentication/);
  });

  it('returns 403 when operator allowlist is empty', async () => {
    delete process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS;
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(postJson({ corridor: 'NGN', transaction_id: 'tx-1' }));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /STELLAR_TEST_OPERATOR_PRIVY_DIDS/);
  });

  it('returns 403 when Privy DID is not on operator allowlist', async () => {
    process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS = 'did:privy:operator-only';
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(postJson({ corridor: 'NGN', transaction_id: 'tx-1' }));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /Not authorized/);
  });
});

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

  it('returns 400 when authToken without account', async () => {
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(
      postJson({
        corridor: 'NGN',
        transaction_id: 'tx-1',
        authToken: 'jwt',
      }),
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /account required/);
  });

  it('returns 400 when account does not match STELLAR_TEST_SECRET', async () => {
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const other = Keypair.random().publicKey();
    const res = await POST(
      postJson({
        corridor: 'NGN',
        transaction_id: 'tx-1',
        authToken: 'jwt',
        account: other,
      }),
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /must match STELLAR_TEST_SECRET/);
  });
});
