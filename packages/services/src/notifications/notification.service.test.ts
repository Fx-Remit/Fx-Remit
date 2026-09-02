process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { NotificationService } from './notification.service.js';

afterEach(() => {
  mock.restoreAll();
});

describe('isAllowedWebPushEndpoint', () => {
  it('allows known HTTPS push providers', async () => {
    const { isAllowedWebPushEndpoint } = await import('./notification.service');
    assert.equal(
      isAllowedWebPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'),
      true,
    );
    assert.equal(
      isAllowedWebPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/xyz'),
      true,
    );
    assert.equal(
      isAllowedWebPushEndpoint('https://web.push.apple.com/abc'),
      true,
    );
  });

  it('rejects http, arbitrary hosts, and credentialed URLs', async () => {
    const { isAllowedWebPushEndpoint } = await import('./notification.service');
    assert.equal(isAllowedWebPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false);
    assert.equal(isAllowedWebPushEndpoint('https://evil.example/hook'), false);
    assert.equal(
      isAllowedWebPushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/abc'),
      false,
    );
    assert.equal(isAllowedWebPushEndpoint('not-a-url'), false);
  });
});

describe('NotificationService.notify', () => {
  it('creates once and is idempotent on unique conflict', async () => {
    const create = mock.fn(async () => ({
      id: 'n1',
      userId: 'u1',
      type: 'DEPOSIT_CREDITED',
      title: 'Deposit received',
      body: '$10.00 USDC added to your balance',
      transactionId: 'tx1',
      readAt: null,
      createdAt: new Date('2026-09-02T00:00:00Z'),
    }));
    prisma.notification.create = create as any;
    prisma.pushSubscription.findMany = mock.fn(async () => []) as any;

    const first = await NotificationService.notify({
      userId: 'u1',
      type: 'DEPOSIT_CREDITED',
      transactionId: 'tx1',
      title: 'Deposit received',
      body: '$10.00 USDC added to your balance',
    });
    assert.equal(first?.id, 'n1');
    assert.equal(create.mock.callCount(), 1);

    prisma.notification.create = mock.fn(async () => {
      const err: any = new Error('Unique');
      err.code = 'P2002';
      throw err;
    }) as any;

    const second = await NotificationService.notify({
      userId: 'u1',
      type: 'DEPOSIT_CREDITED',
      transactionId: 'tx1',
      title: 'Deposit received',
      body: '$10.00 USDC added to your balance',
    });
    assert.equal(second, null);
  });
});

describe('NotificationService.markRead', () => {
  it('scopes updateMany to userId', async () => {
    const updateMany = mock.fn(async (args: any) => {
      assert.deepEqual(args.where, {
        userId: 'u1',
        id: { in: ['n1'] },
        readAt: null,
      });
      return { count: 1 };
    });
    prisma.notification.updateMany = updateMany as any;
    assert.equal(await NotificationService.markRead('u1', ['n1']), 1);
  });
});

describe('NotificationService.deletePushSubscription', () => {
  it('deletes only when user owns the endpoint', async () => {
    const deleteMany = mock.fn(async (args: any) => {
      assert.deepEqual(args.where, { userId: 'u1', endpoint: 'https://push.example/1' });
      return { count: 1 };
    });
    prisma.pushSubscription.deleteMany = deleteMany as any;
    assert.equal(
      await NotificationService.deletePushSubscription('u1', 'https://push.example/1'),
      true,
    );
  });
});
