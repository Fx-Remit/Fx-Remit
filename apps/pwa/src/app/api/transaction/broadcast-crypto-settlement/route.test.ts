process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';
process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO ??= 'test-crypto-policy';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { InstantSendWalletError, TransactionService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

function authRequest(body: unknown) {
  return new Request('http://localhost/api/transaction/broadcast-crypto-settlement', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/transaction/broadcast-crypto-settlement', () => {
  it('returns 401 without bearer', async () => {
    const res = await POST(
      new Request('http://localhost/api/transaction/broadcast-crypto-settlement', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: '1' }),
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 422 when orderId missing', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    const res = await POST(authRequest({}));
    assert.equal(res.status, 422);
  });

  it('returns 404 when user missing', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:ghost',
    }));
    prisma.user.findUnique = mock.fn(async () => null) as any;
    const res = await POST(authRequest({ orderId: '9' }));
    assert.equal(res.status, 404);
  });

  it('maps ADDRESS_NOT_TRUSTED to 403 (fail closed on an unvetted destination)', () => {
    const err = new InstantSendWalletError(
      'ADDRESS_NOT_TRUSTED',
      'This address is not yet eligible for Instant Send',
    );
    assert.equal(err.code, 'ADDRESS_NOT_TRUSTED');
  });
});

describe('POST /api/transaction/broadcast-crypto-settlement path choice (#190)', () => {
  const SIG = `0x${'11'.repeat(64)}1b`;

  function stubUser() {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1', walletAddress: '0x1111111111111111111111111111111111111111' })) as any;
  }

  function withEnv(env: Record<string, string | undefined>) {
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return () => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    };
  }

  it('requires signature and validBefore together', async () => {
    stubUser();
    const res = await POST(authRequest({ orderId: '9', signature: SIG }));
    assert.equal(res.status, 422);
  });

  it('returns 404 when the order does not exist', async () => {
    stubUser();
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => null);
    const res = await POST(authRequest({ orderId: '9' }));
    assert.equal(res.status, 404);
  });

  it('refuses a wallet signature for an order on the legacy direct path', async () => {
    stubUser();
    const restore = withEnv({ PAYOUT_FORWARDER_ENABLED: 'false', PAYOUT_FORWARDER_ALLOWLIST: '' });
    try {
      mock.method(TransactionService, 'findRemittanceForBroadcast', async () => ({
        recipientBank: 'crypto:base',
        fundingPath: null,
      }));
      const res = await POST(authRequest({ orderId: '9', signature: SIG, validBefore: '1791200000' }));
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, 'FUNDING_PATH_MISMATCH');
    } finally {
      restore();
    }
  });

  it('returns 503 instead of a gas-paying send when the forwarder is on but the chain is not configured', async () => {
    stubUser();
    const restore = withEnv({
      PAYOUT_FORWARDER_ENABLED: 'true',
      PAYOUT_FORWARDER_ADDRESS: '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83',
      RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      BASE_RPC_URL: 'http://127.0.0.1:8545',
      CELO_RPC_URL: undefined,
    });
    try {
      mock.method(TransactionService, 'findRemittanceForBroadcast', async () => ({
        recipientBank: 'crypto:celo',
        fundingPath: null,
      }));
      const res = await POST(authRequest({ orderId: '9' }));
      assert.equal(res.status, 503);
      assert.equal((await res.json()).code, 'NETWORK_UNAVAILABLE');
    } finally {
      restore();
    }
  });
});
