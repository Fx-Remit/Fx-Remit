process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { InstantSendWalletError, PayoutService, TransactionService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

function authRequest(body: unknown) {
  return new Request('http://localhost/api/transaction/broadcast-settlement', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/transaction/broadcast-settlement', () => {
  it('returns 401 without bearer', async () => {
    const res = await POST(
      new Request('http://localhost/api/transaction/broadcast-settlement', {
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

  it('maps InstantSendWalletError codes for money-path clients', () => {
    const err = new InstantSendWalletError(
      'NOT_DELEGATED',
      'Enable Instant Send',
    );
    assert.equal(err.code, 'NOT_DELEGATED');
    assert.equal(err.message, 'Enable Instant Send');
  });

  describe('funding path selection', () => {
    const FORWARDER_ENV = {
      PAYOUT_FORWARDER_ADDRESS: '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83',
      RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      BASE_RPC_URL: 'http://127.0.0.1:8545',
    };

    function stubUserAndRow(fundingPath: 'direct' | 'forwarder') {
      mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
      prisma.user.findUnique = mock.fn(async () => ({
        id: 'user-1',
        walletAddress: '0x1111111111111111111111111111111111111111',
      })) as any;
      mock.method(TransactionService, 'findPendingRemittanceForBroadcast', async () => ({
        id: 'tx-1',
        userId: 'user-1',
        orderId: 7n,
        txHash: 'pending-pc-1',
        externalId: 'ext-1',
        type: 'REMITTANCE',
        amountUsd: { toString: () => '50' },
        fundingPath,
        fundingTxHash: null,
        fundingTxRaw: null,
      }));
    }

    it('keeps a forwarder-pinned order on the forwarder even when the flag is off', async () => {
      stubUserAndRow('forwarder');
      for (const k of Object.keys(FORWARDER_ENV)) delete process.env[k];
      delete process.env.PAYOUT_FORWARDER_ENABLED;

      const res = await POST(authRequest({ orderId: '7' }));
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.code, 'FORWARDER_UNAVAILABLE');
    });

    it('keeps a direct-pinned order on the direct path even when the flag is on', async () => {
      stubUserAndRow('direct');
      Object.assign(process.env, FORWARDER_ENV, { PAYOUT_FORWARDER_ENABLED: 'true' });
      mock.method(PayoutService, 'getSettlementOrder', async () => ({ success: false, error: 'direct-path-lookup' }));
      try {
        const res = await POST(authRequest({ orderId: '7' }));
        const body = await res.json();
        assert.equal(body.code, 'PAYCREST_LOOKUP_FAILED');
        assert.equal(body.error, 'direct-path-lookup');
      } finally {
        for (const k of Object.keys(FORWARDER_ENV)) delete process.env[k];
        delete process.env.PAYOUT_FORWARDER_ENABLED;
      }
    });
  });
});
