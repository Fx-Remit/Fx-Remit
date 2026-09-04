process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';
process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO ??= 'test-crypto-policy';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { InstantSendWalletError } from '@fx-remit/services';
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
