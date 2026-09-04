import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { CryptoAddressService } from './crypto-address.service';

afterEach(() => {
  mock.restoreAll();
});

describe('CryptoAddressService.backfillFromRemittances', () => {
  it('extracts network + address from recipientBank/recipientAcc and upserts', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      {
        recipientBank: 'crypto:celo',
        recipientAcc: '0xabc0000000000000000000000000000000abc0',
        createdAt: new Date('2026-09-02T12:00:00.000Z'),
      },
    ]) as any;

    const upsert = mock.fn(async (args: any) => {
      assert.deepEqual(args.where.userId_network_address, {
        userId: 'user-1',
        network: 'celo',
        address: '0xabc0000000000000000000000000000000abc0',
      });
      return {};
    });
    prisma.savedCryptoAddress.upsert = upsert as any;

    const saved = await CryptoAddressService.backfillFromRemittances('user-1');
    assert.equal(saved, 1);
    assert.equal(upsert.mock.callCount(), 1);
  });

  it('dedupes repeated addresses within one pass, keeping the most recent createdAt', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      {
        recipientBank: 'crypto:base',
        recipientAcc: '0xdef0000000000000000000000000000000def0',
        createdAt: new Date('2026-09-03T00:00:00.000Z'), // most recent (query is desc)
      },
      {
        recipientBank: 'crypto:base',
        recipientAcc: '0xDEF0000000000000000000000000000000DEF0', // same address, different case
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]) as any;

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
      { recipientBank: 'crypto:', recipientAcc: '0x1', createdAt: new Date() },
    ]) as any;

    const upsert = mock.fn(async () => ({}));
    prisma.savedCryptoAddress.upsert = upsert as any;

    const saved = await CryptoAddressService.backfillFromRemittances('user-1');
    assert.equal(saved, 0);
    assert.equal(upsert.mock.callCount(), 0);
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
