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

describe('GET /api/user/recipients', () => {
  it('returns 401 without bearer token', async () => {
    const res = await GET(new Request('http://localhost/api/user/recipients'));
    assert.equal(res.status, 401);
  });

  it('returns 404 when user row is missing', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:missing',
    }));
    prisma.user.findUnique = mock.fn(async () => null) as any;

    const res = await GET(
      new Request('http://localhost/api/user/recipients', {
        headers: { authorization: 'Bearer test-token' },
      }),
    );
    assert.equal(res.status, 404);
  });

  it('lists recipients scoped to authenticated user', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async (args: any) => {
      assert.equal(args.where.privyDid, 'did:privy:user-1');
      return { id: 'user-1' };
    }) as any;

    const now = new Date('2026-09-02T12:00:00.000Z');
    const findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.userId, 'user-1');
      assert.equal(args.where.currency, 'NGN');
      assert.equal(args.where.type, 'BANK');
      return [
        {
          id: 'rec-1',
          userId: 'user-1',
          type: 'BANK',
          currency: 'NGN',
          institutionCode: 'PALMNGPC',
          institutionName: 'PalmPay',
          accountIdentifier: '0123456789',
          accountName: 'Ada',
          lastUsedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ];
    });
    prisma.savedRecipient.findMany = findMany as any;

    const res = await GET(
      new Request('http://localhost/api/user/recipients?currency=NGN&type=BANK', {
        headers: { authorization: 'Bearer test-token' },
      }),
    );
    const json = await res.json();
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.equal(json.success, true, JSON.stringify(json));
    assert.equal(json.recipients.length, 1);
    assert.equal(json.recipients[0].institutionCode, 'PALMNGPC');
    assert.equal(findMany.mock.callCount(), 1);
  });
});
