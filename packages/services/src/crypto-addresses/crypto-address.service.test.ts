import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { CryptoAddressService, CRYPTO_TRUST_COOLDOWN_MS } from './crypto-address.service';

afterEach(() => {
  mock.restoreAll();
});

function stubNotifications() {
  prisma.notification.create = mock.fn(async () => ({ id: 'notif-1' })) as any;
  prisma.pushSubscription.findMany = mock.fn(async () => []) as any;
}

describe('CryptoAddressService.backfillFromRemittances', () => {
  it('extracts network + address from recipientBank/recipientAcc and upserts, only for COMPLETED sends', async () => {
    stubNotifications();
    const findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.status, 'COMPLETED');
      return [
        {
          recipientBank: 'crypto:celo',
          recipientAcc: '0xabc0000000000000000000000000000000abc0',
          updatedAt: new Date('2026-09-02T12:00:00.000Z'),
        },
      ];
    });
    prisma.transaction.findMany = findMany as any;
    prisma.savedCryptoAddress.findUnique = mock.fn(async () => null) as any;

    const upsert = mock.fn(async (args: any) => {
      assert.deepEqual(args.where.userId_network_address, {
        userId: 'user-1',
        network: 'celo',
        address: '0xabc0000000000000000000000000000000abc0',
      });
      assert.equal(args.create.firstConfirmedAt.toISOString(), '2026-09-02T12:00:00.000Z');
      return {};
    });
    prisma.savedCryptoAddress.upsert = upsert as any;

    const saved = await CryptoAddressService.backfillFromRemittances('user-1');
    assert.equal(saved, 1);
    assert.equal(upsert.mock.callCount(), 1);
    assert.equal(findMany.mock.callCount(), 1);
  });

  it('dedupes repeated addresses within one pass, keeping the most recently confirmed use', async () => {
    stubNotifications();
    prisma.transaction.findMany = mock.fn(async () => [
      {
        recipientBank: 'crypto:base',
        recipientAcc: '0xdef0000000000000000000000000000000def0',
        updatedAt: new Date('2026-09-03T00:00:00.000Z'), // most recent (query is desc)
      },
      {
        recipientBank: 'crypto:base',
        recipientAcc: '0xDEF0000000000000000000000000000000DEF0', // same address, different case
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]) as any;
    prisma.savedCryptoAddress.findUnique = mock.fn(async () => null) as any;

    const upsert = mock.fn(async (args: any) => {
      assert.equal(args.create.lastUsedAt.toISOString(), '2026-09-03T00:00:00.000Z');
      return {};
    });
    prisma.savedCryptoAddress.upsert = upsert as any;

    const saved = await CryptoAddressService.backfillFromRemittances('user-1');
    assert.equal(saved, 1);
    assert.equal(upsert.mock.callCount(), 1);
  });

  it('skips rows with no crypto network prefix or empty address', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      { recipientBank: 'crypto:', recipientAcc: '0x1', updatedAt: new Date() },
    ]) as any;

    const upsert = mock.fn(async () => ({}));
    prisma.savedCryptoAddress.upsert = upsert as any;

    const saved = await CryptoAddressService.backfillFromRemittances('user-1');
    assert.equal(saved, 0);
    assert.equal(upsert.mock.callCount(), 0);
  });

  it('fires a new-address notification only for addresses not already saved', async () => {
    const create = mock.fn(async () => ({ id: 'notif-1' }));
    prisma.notification.create = create as any;
    prisma.pushSubscription.findMany = mock.fn(async () => []) as any;

    prisma.transaction.findMany = mock.fn(async () => [
      {
        recipientBank: 'crypto:base',
        recipientAcc: '0xnew0000000000000000000000000000000new0',
        updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      },
      {
        recipientBank: 'crypto:base',
        recipientAcc: '0xold0000000000000000000000000000000old0',
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]) as any;
    prisma.savedCryptoAddress.findUnique = mock.fn(async (args: any) => {
      return args.where.userId_network_address.address.includes('old') ? { id: 'existing' } : null;
    }) as any;
    prisma.savedCryptoAddress.upsert = mock.fn(async () => ({})) as any;

    await CryptoAddressService.backfillFromRemittances('user-1');

    assert.equal(create.mock.callCount(), 1);
    assert.equal((create.mock.calls[0].arguments[0] as any).data.type, 'NEW_CRYPTO_ADDRESS');
  });
});

describe('CryptoAddressService.isFastPathEligible', () => {
  it('is false when never confirmed', () => {
    assert.equal(CryptoAddressService.isFastPathEligible({ firstConfirmedAt: null }), false);
  });

  it('is false before the cooldown has elapsed', () => {
    const justNow = new Date(Date.now() - 1000);
    assert.equal(CryptoAddressService.isFastPathEligible({ firstConfirmedAt: justNow }), false);
  });

  it('is true once the cooldown has elapsed', () => {
    const wellPast = new Date(Date.now() - CRYPTO_TRUST_COOLDOWN_MS - 1000);
    assert.equal(CryptoAddressService.isFastPathEligible({ firstConfirmedAt: wellPast }), true);
  });
});

describe('CryptoAddressService.markFirstConfirmed', () => {
  it('only stamps firstConfirmedAt when it is not already set', async () => {
    const updateMany = mock.fn(async (args: any) => {
      assert.equal(args.where.userId, 'user-1');
      assert.equal(args.where.network, 'base');
      assert.equal(args.where.address, '0xabc0000000000000000000000000000000abc0');
      assert.equal(args.where.firstConfirmedAt, null);
      return { count: 1 };
    });
    prisma.savedCryptoAddress.updateMany = updateMany as any;

    await CryptoAddressService.markFirstConfirmed(
      'user-1',
      'base',
      '0xABC0000000000000000000000000000000ABC0',
    );
    assert.equal(updateMany.mock.callCount(), 1);
  });
});

describe('CryptoAddressService.deleteForUser', () => {
  it('deletes only when the row belongs to the requesting user', async () => {
    const deleteMany = mock.fn(async (args: any) => {
      assert.equal(args.where.id, 'addr-1');
      assert.equal(args.where.userId, 'user-1');
      return { count: 1 };
    });
    prisma.savedCryptoAddress.deleteMany = deleteMany as any;

    const result = await CryptoAddressService.deleteForUser('user-1', 'addr-1');
    assert.equal(result, true);
  });

  it('returns false when nothing was deleted', async () => {
    prisma.savedCryptoAddress.deleteMany = mock.fn(async () => ({ count: 0 })) as any;

    const result = await CryptoAddressService.deleteForUser('user-1', 'missing');
    assert.equal(result, false);
  });
});
