process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { GET } from './route';

afterEach(() => {
  mock.restoreAll();
});

describe('GET /api/user/crypto-addresses', () => {
  it('returns 401 without bearer token', async () => {
    const res = await GET(new Request('http://localhost/api/user/crypto-addresses'));
    assert.equal(res.status, 401);
  });

  it('returns 404 when user row is missing', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:missing',
    }));
    prisma.user.findUnique = mock.fn(async () => null) as any;

    const res = await GET(
      new Request('http://localhost/api/user/crypto-addresses', {
        headers: { authorization: 'Bearer test-token' },
      }),
    );
    assert.equal(res.status, 404);
  });

  it('lists saved crypto addresses scoped to the authenticated user', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async (args: any) => {
      assert.equal(args.where.privyDid, 'did:privy:user-1');
      return { id: 'user-1' };
    }) as any;

    // Backfill runs first no remittance history for this test.
    prisma.transaction.findMany = mock.fn(async () => []) as any;

    const now = new Date('2026-09-04T12:00:00.000Z');
    const findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.userId, 'user-1');
      return [
        {
          id: 'addr-1',
          userId: 'user-1',
          network: 'celo',
          address: '0xabc0000000000000000000000000000000abc0',
          label: null,
          lastUsedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ];
    });
    prisma.savedCryptoAddress.findMany = findMany as any;

    const res = await GET(
      new Request('http://localhost/api/user/crypto-addresses', {
        headers: { authorization: 'Bearer test-token' },
      }),
    );
    const json = await res.json();
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.equal(json.success, true);
    assert.equal(json.addresses.length, 1);
    assert.equal(json.addresses[0].network, 'celo');
    assert.equal(findMany.mock.callCount(), 1);
  });
});
