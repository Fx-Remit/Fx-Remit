process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { NotificationService } from './notification.service.js';

afterEach(() => {
  mock.restoreAll();
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
