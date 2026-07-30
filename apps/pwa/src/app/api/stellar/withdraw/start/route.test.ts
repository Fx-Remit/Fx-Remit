process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
process.env.STELLAR_NETWORK = 'testnet';

import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import {
  Sep10Client,
  Sep24Client,
  clearAnchorTomlCache,
  seedAnchorTomlCache,
} from '@fx-remit/services';
import { POST } from './route';

const ACCOUNT = Keypair.random().publicKey();

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
  delete process.env.STELLAR_TEST_SECRET;
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
  clearAnchorTomlCache();
  delete process.env.STELLAR_TEST_SECRET;
  seedAnchorTomlCache('testanchor.stellar.org', {
    webAuthEndpoint: 'https://testanchor.stellar.org/auth',
    transferServerSep24: 'https://testanchor.stellar.org/sep24',
  });
});

function postJson(body: unknown) {
  return new NextRequest('http://localhost/api/stellar/withdraw/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockWithdrawOk() {
  mock.method(Sep24Client.prototype, 'startWithdrawInteractive', async () => ({
    id: 'tx-withdraw-1',
    url: 'https://anchor.test/interactive',
    type: 'interactive_customer_info_needed',
  }));
}

describe('POST /api/stellar/withdraw/start — Freighter authToken', () => {
  it('starts withdraw with authToken and no server secret', async () => {
    mockWithdrawOk();
    const authSpy = mock.method(Sep10Client.prototype, 'authenticate', async () => {
      throw new Error('should not server-sign when authToken provided');
    });

    const res = await POST(
      postJson({
        corridor: 'NGN',
        amount: '1',
        account: ACCOUNT,
        authToken: 'client-jwt',
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.transaction_id, 'tx-withdraw-1');
    assert.equal(body.interactive_url, 'https://anchor.test/interactive');
    assert.equal(body.account, ACCOUNT);
    assert.equal(authSpy.mock.callCount(), 0);
  });
});

describe('POST /api/stellar/withdraw/start — signedChallenge', () => {
  it('exchanges signedChallenge then starts withdraw', async () => {
    mockWithdrawOk();
    mock.method(Sep10Client.prototype, 'submitTokenRequest', async (xdr: string) => {
      assert.equal(xdr, 'freighter-signed-xdr');
      return 'jwt-from-signed';
    });

    const res = await POST(
      postJson({
        corridor: 'NGN',
        account: ACCOUNT,
        signedChallenge: 'freighter-signed-xdr',
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.transaction_id, 'tx-withdraw-1');
  });
});

describe('POST /api/stellar/withdraw/start — STELLAR_TEST_SECRET smoke', () => {
  it('still authenticates with server secret', async () => {
    const kp = Keypair.random();
    process.env.STELLAR_TEST_SECRET = kp.secret();
    mockWithdrawOk();
    mock.method(Sep10Client.prototype, 'authenticate', async () => ({
      token: 'server-jwt',
      account: kp.publicKey(),
    }));

    const res = await POST(postJson({ corridor: 'NGN', amount: '1' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.transaction_id, 'tx-withdraw-1');
  });
});

describe('POST /api/stellar/withdraw/start — unhappy paths', () => {
  it('returns 400 without authToken, signedChallenge, or secret', async () => {
    const res = await POST(postJson({ corridor: 'NGN', account: ACCOUNT }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /authToken|signedChallenge|STELLAR_TEST_SECRET/);
  });

  it('returns 400 when authToken without account', async () => {
    const res = await POST(postJson({ corridor: 'NGN', authToken: 'jwt' }));
    assert.equal(res.status, 400);
  });
});
