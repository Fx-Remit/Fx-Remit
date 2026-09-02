import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { RecipientService } from './recipient.service';

afterEach(() => {
  mock.restoreAll();
});

describe('RecipientService.upsert', () => {
  it('returns null when institution code is missing', async () => {
    const upsert = mock.fn(async () => {
      throw new Error('should not upsert');
    });
    prisma.savedRecipient.upsert = upsert as any;

    const result = await RecipientService.upsert({
      userId: 'user-1',
      currency: 'NGN',
      institutionCode: '  ',
      institutionName: 'PalmPay',
      accountIdentifier: '0123456789',
      accountName: 'Ada',
    });

    assert.equal(result, null);
    assert.equal(upsert.mock.callCount(), 0);
  });

  it('upserts idempotently on unique key and returns serialized row', async () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    const upsert = mock.fn(async (args: any) => {
      assert.equal(
        args.where.userId_currency_institutionCode_accountIdentifier.userId,
        'user-1',
      );
      assert.equal(
        args.where.userId_currency_institutionCode_accountIdentifier.currency,
        'NGN',
      );
      assert.equal(
        args.where.userId_currency_institutionCode_accountIdentifier.institutionCode,
        'PALMNGPC',
      );
      assert.equal(args.create.type, 'BANK');
      assert.equal(args.update.accountName, 'Ada Lovelace');
      return {
        id: 'rec-1',
        userId: 'user-1',
        type: 'BANK',
        currency: 'NGN',
        institutionCode: 'PALMNGPC',
        institutionName: 'PalmPay',
        accountIdentifier: '0123456789',
        accountName: 'Ada Lovelace',
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now,
      };
    });
    prisma.savedRecipient.upsert = upsert as any;

    const result = await RecipientService.upsert({
      userId: 'user-1',
      type: 'bank',
      currency: 'ngn',
      institutionCode: 'PALMNGPC',
      institutionName: 'PalmPay',
      accountIdentifier: '0123456789',
      accountName: 'Ada Lovelace',
    });

    assert.equal(upsert.mock.callCount(), 1);
    assert.deepEqual(result, {
      id: 'rec-1',
      type: 'BANK',
      currency: 'NGN',
      institutionCode: 'PALMNGPC',
      institutionName: 'PalmPay',
      accountIdentifier: '0123456789',
      accountName: 'Ada Lovelace',
      lastUsedAt: now.toISOString(),
    });
  });
});

describe('RecipientService.listForUser', () => {
  it('scopes query to userId and optional currency/type', async () => {
    const findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.userId, 'user-1');
      assert.equal(args.where.currency, 'NGN');
      assert.equal(args.where.type, 'MOBILE');
      assert.equal(args.orderBy.lastUsedAt, 'desc');
      return [];
    });
    prisma.savedRecipient.findMany = findMany as any;

    const rows = await RecipientService.listForUser('user-1', {
      currency: 'ngn',
      type: 'mobile',
    });

    assert.equal(findMany.mock.callCount(), 1);
    assert.deepEqual(rows, []);
  });
});
