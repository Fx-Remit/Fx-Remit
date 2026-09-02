process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { GET, PATCH } from './route';

afterEach(() => {
  mock.restoreAll();
});

describe('GET /api/user/notifications', () => {
  it('returns 401 without bearer token', async () => {
    const res = await GET(new Request('http://localhost/api/user/notifications'));
    assert.equal(res.status, 401);
  });

  it('lists notifications for the authenticated user', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    const findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.userId, 'user-1');
      return [
        {
          id: 'n1',
          userId: 'user-1',
          type: 'DEPOSIT_CREDITED',
          title: 'Deposit received',
          body: '$10.00 USDC added to your balance',
          transactionId: 'tx1',
          readAt: null,
          createdAt: new Date('2026-09-02T12:00:00Z'),
        },
      ];
    });
    const count = mock.fn(async (args: any) => {
      assert.deepEqual(args.where, { userId: 'user-1', readAt: null });
      return 1;
    });
    prisma.notification.findMany = findMany as any;
    prisma.notification.count = count as any;

    const res = await GET(
      new Request('http://localhost/api/user/notifications', {
        headers: { authorization: 'Bearer test-token' },
      }),
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.unreadCount, 1);
    assert.equal(json.notifications.length, 1);
    assert.equal(json.notifications[0].id, 'n1');
  });
});

describe('PATCH /api/user/notifications', () => {
  it('marks only the caller\'s notification ids as read', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    const updateMany = mock.fn(async (args: any) => {
      assert.deepEqual(args.where, {
        userId: 'user-1',
        id: { in: ['n-other'] },
        readAt: null,
      });
      return { count: 0 };
    });
    prisma.notification.updateMany = updateMany as any;

    const res = await PATCH(
      new Request('http://localhost/api/user/notifications', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ids: ['n-other'] }),
      }),
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.count, 0);
    assert.equal(updateMany.mock.callCount(), 1);
  });
});
