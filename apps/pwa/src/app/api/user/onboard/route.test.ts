process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

const OWNED = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

function authRequest(body: unknown) {
  return new Request('http://localhost/api/user/onboard', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/user/onboard — wallet ownership', () => {
  it('rejects walletAddress not linked on Privy', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    mock.method(PrivyClient.prototype, 'getUser', async () => ({
      linkedAccounts: [{ type: 'wallet', address: OWNED }],
    }));

    const upsert = mock.fn(async () => {
      throw new Error('should not upsert');
    });
    prisma.user.findUnique = mock.fn(async () => null) as any;
    prisma.user.upsert = upsert as any;

    const res = await POST(authRequest({ walletAddress: OTHER }));
    assert.equal(res.status, 403);
    assert.equal(upsert.mock.callCount(), 0);
  });

  it('accepts walletAddress linked on Privy', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    mock.method(PrivyClient.prototype, 'getUser', async () => ({
      linkedAccounts: [{ type: 'wallet', address: OWNED }],
    }));

    prisma.user.findUnique = mock.fn(async () => ({
      walletAddress: null,
    })) as any;
    prisma.user.upsert = mock.fn(async (args: any) => {
      assert.equal(args.update.walletAddress, OWNED);
      return { id: 'user-1', walletAddress: OWNED };
    }) as any;

    const res = await POST(authRequest({ walletAddress: OWNED }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
  });

  it('allows onboard without walletAddress (no ownership check)', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    const getUser = mock.method(PrivyClient.prototype, 'getUser', async () => {
      throw new Error('should not fetch user');
    });

    prisma.user.findUnique = mock.fn(async () => null) as any;
    prisma.user.upsert = mock.fn(async () => ({
      id: 'user-1',
      walletAddress: null,
    })) as any;

    const res = await POST(authRequest({ displayName: 'Ada' }));
    assert.equal(res.status, 200);
    assert.equal(getUser.mock.callCount(), 0);
  });
});
