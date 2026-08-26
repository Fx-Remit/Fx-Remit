process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
process.env.STELLAR_NETWORK = 'testnet';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-privy-app';
process.env.PRIVY_APP_SECRET ??= 'test-privy-secret';

import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import {
  Sep10Client,
  Sep24Client,
  clearAnchorTomlCache,
  seedAnchorTomlCache,
} from '@fx-remit/services';
import { POST } from './route';

const ACCOUNT = Keypair.random().publicKey();

const prismaOriginals = {
  userFindUnique: prisma.user.findUnique,
  txFindFirst: prisma.transaction.findFirst,
  txCreate: prisma.transaction.create,
};

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
  delete process.env.STELLAR_TEST_SECRET;
  delete process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS;
  prisma.user.findUnique = prismaOriginals.userFindUnique;
  prisma.transaction.findFirst = prismaOriginals.txFindFirst;
  prisma.transaction.create = prismaOriginals.txCreate;
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
  process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS = 'did:privy:test';
  clearAnchorTomlCache();
  delete process.env.STELLAR_TEST_SECRET;
  seedAnchorTomlCache('testanchor.stellar.org', {
    webAuthEndpoint: 'https://testanchor.stellar.org/auth',
    signingKey: 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57',
    transferServerSep24: 'https://testanchor.stellar.org/sep24',
  });
  // Default: no app user → skip DB persist (smoke-safe)
  prisma.user.findUnique = (async () => null) as any;
  mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
    userId: 'did:privy:test',
  }));
});

function postJson(body: unknown, opts?: { authorization?: string | null }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.authorization !== null) {
    headers.Authorization = opts?.authorization ?? 'Bearer test-token';
  }
  return new NextRequest('http://localhost/api/stellar/withdraw/start', {
    method: 'POST',
    headers,
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

describe('POST /api/stellar/withdraw/start — auth (#92)', () => {
  it('returns 401 without Authorization', async () => {
    const res = await POST(
      postJson({ corridor: 'NGN', amount: '1', account: ACCOUNT, authToken: 'jwt' }, {
        authorization: null,
      }),
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  it('returns 401 when Privy token is invalid', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => {
      throw new Error('bad token');
    });
    const res = await POST(
      postJson({ corridor: 'NGN', amount: '1', account: ACCOUNT, authToken: 'jwt' }),
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Invalid authentication/);
  });
});

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
    assert.equal(body.persisted, false);
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
    assert.equal(body.persisted, false);
  });
});

describe('POST /api/stellar/withdraw/start — STELLAR_TEST_SECRET smoke', () => {
  it('still authenticates with server secret when DID is allowlisted', async () => {
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
    assert.equal(body.persisted, false);
  });

  it('returns 403 when operator allowlist is empty', async () => {
    delete process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS;
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(postJson({ corridor: 'NGN', amount: '1' }));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /STELLAR_TEST_OPERATOR_PRIVY_DIDS/);
  });

  it('returns 403 when Privy DID is not on operator allowlist', async () => {
    process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS = 'did:privy:operator-only';
    process.env.STELLAR_TEST_SECRET = Keypair.random().secret();
    const res = await POST(postJson({ corridor: 'NGN', amount: '1' }));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /Not authorized/);
  });
});

describe('POST /api/stellar/withdraw/start — sandbox persist', () => {
  it('persists rail=STELLAR when userId has matching stellarPublicKey', async () => {
    mockWithdrawOk();
    prisma.user.findUnique = (async () => ({
      id: 'user-1',
      stellarPublicKey: ACCOUNT,
    })) as any;
    prisma.transaction.findFirst = (async () => null) as any;
    prisma.transaction.create = (async (args: { data: Record<string, unknown> }) =>
      ({
        id: 'remittance-1',
        ...args.data,
      }) as never) as any;

    const res = await POST(
      postJson({
        corridor: 'NGN',
        amount: '1',
        account: ACCOUNT,
        authToken: 'client-jwt',
        userId: 'user-1',
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.persisted, true);
    assert.equal(body.remittance_id, 'remittance-1');
    assert.equal(body.transaction_id, 'tx-withdraw-1');
  });

  it('does not persist when userId stellarPublicKey mismatches account', async () => {
    mockWithdrawOk();
    let createCalled = false;
    prisma.user.findUnique = (async () => ({
      id: 'victim',
      stellarPublicKey: Keypair.random().publicKey(),
    })) as any;
    prisma.transaction.create = (async () => {
      createCalled = true;
      throw new Error('should not create');
    }) as any;

    const res = await POST(
      postJson({
        corridor: 'NGN',
        amount: '1',
        account: ACCOUNT,
        authToken: 'client-jwt',
        userId: 'victim',
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.persisted, false);
    assert.equal(body.remittance_id, undefined);
    assert.equal(body.stellar_account_mismatch, true);
    assert.equal(createCalled, false);
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
