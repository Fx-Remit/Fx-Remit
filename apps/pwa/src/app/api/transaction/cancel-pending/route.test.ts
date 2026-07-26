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

function authRequest(body: unknown) {
  return new Request('http://localhost/api/transaction/cancel-pending', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/transaction/cancel-pending — happy paths', () => {
  it('cancels an abandoned remittance for the authenticated user', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    mock.method(TransactionService, 'findByPaycrestKey', async () => ({
      id: 'tx-1',
      userId: 'user-1',
      externalId: 'idem-1',
      status: 'PROCESSING',
    }));

    const cancel = mock.method(
      TransactionService,
      'cancelAbandonedPending',
      async () => ({ id: 'tx-1', status: 'FAILED' }),
    );

    const res = await POST(authRequest({ externalId: 'idem-1' }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.cancelled, true);
    assert.equal(json.status, 'FAILED');
    assert.equal(cancel.mock.calls[0].arguments[0], 'idem-1');
  });

  it('returns cancelled:false when remittance is unknown', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;
    mock.method(TransactionService, 'findByPaycrestKey', async () => null);

    const res = await POST(authRequest({ externalId: 'missing' }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.cancelled, false);
    assert.equal(json.reason, 'not_found');
  });
});

describe('POST /api/transaction/cancel-pending — unhappy paths', () => {
  it('returns 401 without bearer token', async () => {
    const res = await POST(
      new Request('http://localhost/api/transaction/cancel-pending', {
        method: 'POST',
        body: JSON.stringify({ externalId: 'x' }),
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 422 when externalId missing', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    const res = await POST(authRequest({}));
    assert.equal(res.status, 422);
  });

  it('returns 403 when remittance belongs to another user', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;
    mock.method(TransactionService, 'findByPaycrestKey', async () => ({
      id: 'tx-1',
      userId: 'user-OTHER',
      externalId: 'idem-1',
    }));

    const res = await POST(authRequest({ externalId: 'idem-1' }));
    assert.equal(res.status, 403);
  });

  it('returns 409 when on-chain txHash already attached', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;
    mock.method(TransactionService, 'findByPaycrestKey', async () => ({
      id: 'tx-1',
      userId: 'user-1',
      externalId: 'idem-1',
    }));
    mock.method(TransactionService, 'cancelAbandonedPending', async () => {
      throw new Error('Cannot cancel remittance idem-1: on-chain txHash already attached');
    });

    const res = await POST(authRequest({ externalId: 'idem-1' }));
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.equal(json.code, 'ALREADY_ON_CHAIN');
  });
});
