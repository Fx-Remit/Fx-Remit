process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { TransactionService } from '../transaction.service.js';

const originals = {
  findUnique: prisma.transaction.findUnique,
  update: prisma.transaction.update,
  create: prisma.transaction.create,
  findMany: prisma.transaction.findMany,
};

afterEach(() => {
  prisma.transaction.findUnique = originals.findUnique;
  prisma.transaction.update = originals.update;
  prisma.transaction.create = originals.create;
  prisma.transaction.findMany = originals.findMany;
  mock.restoreAll();
});

function sampleTx(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-15T12:00:00.000Z');
  return {
    id: 'tx-1',
    userId: 'user-1',
    orderId: 42n,
    txHash: '0xabc',
    chainId: 8453,
    blockNumber: 100n,
    logIndex: 1,
    sourceToken: 'USDC',
    amountUsd: 100.5 as any,
    payoutFiat: 158800 as any,
    status: 'PENDING' as const,
    externalId: 'ext-1',
    recipientName: 'Jane Doe',
    recipientBank: '058',
    recipientAcc: '0123456789',
    createdAt: now,
    updatedAt: now,
    type: 'REMITTANCE' as const,
    rail: 'EVM' as const,
    stellarPaymentHash: null,
    anchorTransactionId: null,
    corridor: null,
    ...overrides,
  };
}

describe('TransactionService.serialize — happy paths', () => {
  it('converts BigInt and Decimal-like fields to JSON-safe values', () => {
    const serialized = TransactionService.serialize(sampleTx() as any);

    assert.equal(serialized.id, 'tx-1');
    assert.equal(serialized.orderId, '42');
    assert.equal(serialized.blockNumber, '100');
    assert.equal(serialized.amountUsd, 100.5);
    assert.equal(serialized.payoutFiat, 158800);
    assert.equal(serialized.createdAt, '2026-01-15T12:00:00.000Z');
    assert.equal(serialized.updatedAt, '2026-01-15T12:00:00.000Z');
    assert.equal(serialized.status, 'PENDING');
  });
});

describe('TransactionService.updateFromPaycrest — happy paths', () => {
  it('updates status when transaction is non-terminal', async () => {
    const existing = sampleTx({ status: 'PROCESSING' });
    const updated = sampleTx({ status: 'COMPLETED' });

    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const updateMock = mock.fn(async () => updated);
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'COMPLETED');

    assert.equal(result?.status, 'COMPLETED');
    const args = updateMock.mock.calls[0].arguments[0] as {
      where: { id: string };
      data: { status: string };
    };
    assert.equal(args.where.id, 'tx-1');
    assert.equal(args.data.status, 'COMPLETED');
  });
});

describe('TransactionService.updateFromPaycrest — unhappy paths', () => {
  it('returns null when externalId is unknown', async () => {
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    const updateMock = mock.fn(async () => {
      throw new Error('should not update');
    });
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.updateFromPaycrest('missing', 'COMPLETED');
    assert.equal(result, null);
    assert.equal(updateMock.mock.callCount(), 0);
  });

  it('ignores transitions out of COMPLETED', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({ status: 'COMPLETED' }),
    ) as any;
    const updateMock = mock.fn(async () => {
      throw new Error('should not update');
    });
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'FAILED');
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(updateMock.mock.callCount(), 0);
  });

  it('ignores transitions out of FAILED', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({ status: 'FAILED' }),
    ) as any;
    const updateMock = mock.fn(async () => {
      throw new Error('should not update');
    });
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'COMPLETED');
    assert.equal(result?.status, 'FAILED');
    assert.equal(updateMock.mock.callCount(), 0);
  });
});

describe('TransactionService.createPending — happy paths', () => {
  it('creates a PENDING remittance with placeholder txHash', async () => {
    const created = sampleTx({
      status: 'PENDING',
      txHash: 'pending-ext-9',
      chainId: 0,
      blockNumber: 0n,
    });
    const createMock = mock.fn(async (args: any) => {
      assert.equal(args.data.status, 'PENDING');
      assert.equal(args.data.type, 'REMITTANCE');
      assert.equal(args.data.txHash, 'pending-ext-9');
      assert.equal(args.data.chainId, 0);
      return created;
    });
    prisma.transaction.create = createMock as any;

    const result = await TransactionService.createPending({
      userId: 'user-1',
      orderId: 9n,
      externalId: 'ext-9',
      sourceToken: 'USDC',
      amountUsd: 25,
      payoutFiat: 40000,
      recipientName: 'Jane Doe',
      recipientBank: '058',
      recipientAcc: '0123456789',
    });

    assert.equal(result.status, 'PENDING');
    assert.equal(createMock.mock.callCount(), 1);
  });
});

describe('TransactionService.getHistory — happy paths', () => {
  it('returns serialized rows ordered by createdAt desc', async () => {
    prisma.transaction.findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.userId, 'user-1');
      assert.equal(args.take, 10);
      assert.equal(args.skip, 5);
      assert.deepEqual(args.orderBy, { createdAt: 'desc' });
      return [sampleTx()];
    }) as any;

    const rows = await TransactionService.getHistory('user-1', 10, 5);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].orderId, '42');
    assert.equal(rows[0].amountUsd, 100.5);
  });
});
