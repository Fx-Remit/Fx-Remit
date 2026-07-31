process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import {
  createStellarWithdrawStart,
  resolveStellarPersistUser,
} from './stellar-transaction.service.js';

const originals = {
  findFirst: prisma.transaction.findFirst,
  create: prisma.transaction.create,
  userFindUnique: prisma.user.findUnique,
};

afterEach(() => {
  prisma.transaction.findFirst = originals.findFirst;
  prisma.transaction.create = originals.create;
  prisma.user.findUnique = originals.userFindUnique;
});

function sampleStellarTx(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-31T12:00:00.000Z');
  return {
    id: 'stx-1',
    userId: 'user-1',
    orderId: 123n,
    txHash: 'stellar-pending-anchor-1',
    chainId: 0,
    blockNumber: 123n,
    logIndex: 0,
    sourceToken: 'USDC',
    amountUsd: 1 as unknown,
    payoutFiat: 0 as unknown,
    status: 'PENDING' as const,
    externalId: 'stellar:anchor-1',
    recipientName: null,
    recipientBank: 'stellar:testanchor',
    recipientAcc: 'GABC',
    createdAt: now,
    updatedAt: now,
    type: 'REMITTANCE' as const,
    rail: 'STELLAR' as const,
    stellarPaymentHash: null,
    anchorTransactionId: 'anchor-1',
    corridor: 'NGN',
    ...overrides,
  };
}

describe('createStellarWithdrawStart — happy paths', () => {
  it('creates rail=STELLAR row with anchorTransactionId and corridor', async () => {
    prisma.transaction.findFirst = (async () => null) as typeof prisma.transaction.findFirst;
    let created: Record<string, unknown> | null = null;
    prisma.transaction.create = (async (args: { data: Record<string, unknown> }) => {
      created = args.data;
      return sampleStellarTx({
        ...args.data,
        id: 'stx-new',
        amountUsd: args.data.amountUsd,
        payoutFiat: args.data.payoutFiat,
      }) as never;
    }) as typeof prisma.transaction.create;

    const row = await createStellarWithdrawStart({
      userId: 'user-1',
      account: 'GABC',
      anchorTransactionId: 'anchor-1',
      corridor: 'NGN',
      amountUsd: '1',
      anchorId: 'testanchor',
    });

    assert.equal(row.rail, 'STELLAR');
    assert.equal(row.anchorTransactionId, 'anchor-1');
    assert.ok(created);
    assert.equal(created!.rail, 'STELLAR');
    assert.equal(created!.anchorTransactionId, 'anchor-1');
    assert.equal(created!.corridor, 'NGN');
    assert.equal(created!.externalId, 'stellar:anchor-1');
    assert.equal(created!.txHash, 'stellar-pending-anchor-1');
    assert.equal(created!.chainId, 0);
    assert.equal(created!.sourceToken, 'USDC');
    assert.equal(created!.recipientAcc, 'GABC');
    assert.equal(created!.recipientBank, 'stellar:testanchor');
    assert.equal(created!.stellarPaymentHash, null);
  });

  it('is idempotent when externalId / anchorTransactionId already exists', async () => {
    const existing = sampleStellarTx();
    prisma.transaction.findFirst = (async () => existing) as typeof prisma.transaction.findFirst;
    let createCalled = false;
    prisma.transaction.create = (async () => {
      createCalled = true;
      throw new Error('should not create');
    }) as typeof prisma.transaction.create;

    const row = await createStellarWithdrawStart({
      userId: 'user-1',
      account: 'GABC',
      anchorTransactionId: 'anchor-1',
      corridor: 'NGN',
      amountUsd: '1',
    });

    assert.equal(row.id, 'stx-1');
    assert.equal(createCalled, false);
  });
});

describe('createStellarWithdrawStart — unhappy paths', () => {
  it('rejects when existing row belongs to another user', async () => {
    prisma.transaction.findFirst = (async () =>
      sampleStellarTx({ userId: 'other-user' })) as typeof prisma.transaction.findFirst;

    await assert.rejects(
      () =>
        createStellarWithdrawStart({
          userId: 'user-1',
          account: 'GABC',
          anchorTransactionId: 'anchor-1',
          corridor: 'NGN',
          amountUsd: '1',
        }),
      /belongs to another user/,
    );
  });

  it('rejects when existing row is not STELLAR rail', async () => {
    prisma.transaction.findFirst = (async () =>
      sampleStellarTx({ rail: 'EVM' })) as typeof prisma.transaction.findFirst;

    await assert.rejects(
      () =>
        createStellarWithdrawStart({
          userId: 'user-1',
          account: 'GABC',
          anchorTransactionId: 'anchor-1',
          corridor: 'NGN',
          amountUsd: '1',
        }),
      /not rail=STELLAR/,
    );
  });
});

describe('resolveStellarPersistUser', () => {
  it('returns user by id when stellarPublicKey matches account', async () => {
    prisma.user.findUnique = (async () => ({
      id: 'user-1',
      stellarPublicKey: 'GABC',
    })) as typeof prisma.user.findUnique;
    const user = await resolveStellarPersistUser({ userId: 'user-1', account: 'GABC' });
    assert.deepEqual(user, { id: 'user-1' });
  });

  it('rejects userId when stellarPublicKey does not match account', async () => {
    prisma.user.findUnique = (async () => ({
      id: 'victim',
      stellarPublicKey: 'GVICTIM',
    })) as typeof prisma.user.findUnique;
    const user = await resolveStellarPersistUser({
      userId: 'victim',
      account: 'GATTACKER',
    });
    assert.equal(user, null);
  });

  it('rejects userId when user has no stellarPublicKey', async () => {
    prisma.user.findUnique = (async () => ({
      id: 'user-1',
      stellarPublicKey: null,
    })) as typeof prisma.user.findUnique;
    const user = await resolveStellarPersistUser({ userId: 'user-1', account: 'GABC' });
    assert.equal(user, null);
  });

  it('falls back to stellarPublicKey lookup', async () => {
    prisma.user.findUnique = (async (args: { where: { stellarPublicKey?: string } }) => {
      if (args.where.stellarPublicKey === 'GABC') return { id: 'user-key' };
      return null;
    }) as typeof prisma.user.findUnique;

    const user = await resolveStellarPersistUser({ account: 'GABC' });
    assert.deepEqual(user, { id: 'user-key' });
  });

  it('returns null when no user matches (smoke without app user)', async () => {
    prisma.user.findUnique = (async () => null) as typeof prisma.user.findUnique;
    const user = await resolveStellarPersistUser({ account: 'GUNKNOWN' });
    assert.equal(user, null);
  });
});
