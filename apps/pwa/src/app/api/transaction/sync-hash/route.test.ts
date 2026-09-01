process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { TransactionService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

const HASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function authRequest(body: unknown) {
  return new Request('http://localhost/api/transaction/sync-hash', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/transaction/sync-hash', () => {
  it('attaches hash for the authenticated owner', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    const attach = mock.method(
      TransactionService,
      'attachOnChainHash',
      async (params: { userId: string; orderId: bigint; txHash: string }) => {
        assert.equal(params.userId, 'user-1');
        assert.equal(params.orderId, 99n);
        assert.equal(params.txHash, HASH);
        return {
          id: 'tx-1',
          userId: 'user-1',
          orderId: 99n,
          txHash: HASH,
          chainId: 0,
          blockNumber: 0n,
          logIndex: 0,
          sourceToken: 'USDC',
          amountUsd: 10,
          payoutFiat: 10,
          status: 'PROCESSING',
          type: 'REMITTANCE',
          externalId: 'idem-1',
          recipientName: null,
          recipientBank: null,
          recipientAcc: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    );

    mock.method(TransactionService, 'serialize', (tx: { id: string }) => ({
      id: tx.id,
      txHash: HASH,
    }));

    mock.method(
      TransactionService,
      'syncPaycrestStatusForRemittance',
      async () => ({
        id: 'tx-1',
        userId: 'user-1',
        orderId: 99n,
        txHash: HASH,
        chainId: 8453,
        blockNumber: 0n,
        logIndex: 0,
        sourceToken: 'USDC',
        amountUsd: 10,
        payoutFiat: 10,
        status: 'COMPLETED',
        type: 'REMITTANCE',
        externalId: 'idem-1',
        recipientName: null,
        recipientBank: null,
        recipientAcc: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(attach.mock.callCount(), 1);
  });

  it('returns 403 when attachOnChainHash rejects ownership', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:attacker',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'attacker' })) as any;
    mock.method(TransactionService, 'attachOnChainHash', async () => {
      throw new Error('Forbidden');
    });

    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 403);
  });

  it('returns 401 without Bearer token', async () => {
    const res = await POST(
      new Request('http://localhost/api/transaction/sync-hash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: '99', txHash: HASH }),
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 422 for invalid txHash', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));

    const res = await POST(authRequest({ orderId: '99', txHash: 'not-a-hash' }));
    assert.equal(res.status, 422);
  });
});
