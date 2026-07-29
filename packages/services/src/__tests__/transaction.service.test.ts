process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import {
  TransactionService,
  InsufficientBalanceError,
} from '../transaction.service.js';

const originals = {
  findUnique: prisma.transaction.findUnique,
  findFirst: prisma.transaction.findFirst,
  update: prisma.transaction.update,
  create: prisma.transaction.create,
  findMany: prisma.transaction.findMany,
  dollarTransaction: prisma.$transaction,
};

afterEach(() => {
  prisma.transaction.findUnique = originals.findUnique;
  prisma.transaction.findFirst = originals.findFirst;
  prisma.transaction.update = originals.update;
  prisma.transaction.create = originals.create;
  prisma.transaction.findMany = originals.findMany;
  prisma.$transaction = originals.dollarTransaction;
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
    const args = (updateMock.mock.calls as any[])[0]?.arguments[0] as {
      where: { id: string };
      data: { status: string };
    };
    assert.equal(args.where.id, 'tx-1');
    assert.equal(args.data.status, 'COMPLETED');
  });

  it('refunds ledger when remittance transitions to FAILED', async () => {
    const existing = sampleTx({ status: 'PENDING', amountUsd: 25 as any });
    const capture: { userUpdateArgs?: any } = {};
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          update: mock.fn(async () => sampleTx({ status: 'FAILED' })),
        },
        user: {
          update: mock.fn(async (args: any) => {
            capture.userUpdateArgs = args;
            return { id: args.where.id };
          }),
        },
      };
      return cb(client);
    }) as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'FAILED');
    assert.equal(result?.status, 'FAILED');
    assert.equal(capture.userUpdateArgs.where.id, 'user-1');
    assert.equal(capture.userUpdateArgs.data.walletBalance.increment, 25);
  });

  it('refunds ledger once when remittance transitions to REFUNDING', async () => {
    const existing = sampleTx({ status: 'PENDING', amountUsd: 25 as any });
    const capture: { userUpdateArgs?: any } = {};
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          update: mock.fn(async () => sampleTx({ status: 'REFUNDING' })),
        },
        user: {
          update: mock.fn(async (args: any) => {
            capture.userUpdateArgs = args;
            return { id: args.where.id };
          }),
        },
      };
      return cb(client);
    }) as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'REFUNDING');
    assert.equal(result?.status, 'REFUNDING');
    assert.equal(capture.userUpdateArgs.data.walletBalance.increment, 25);
  });

  it('treats REFUNDING as terminal — later FAILED does not re-touch ledger', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({ status: 'REFUNDING', amountUsd: 25 as any }),
    ) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not open ledger restore tx');
    });
    prisma.$transaction = dollar as any;
    const updateMock = mock.fn(async () => sampleTx({ status: 'FAILED' }));
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'FAILED');
    assert.equal(result?.status, 'REFUNDING');
    assert.equal(dollar.mock.callCount(), 0);
    assert.equal(updateMock.mock.callCount(), 0);
  });

  it('treats REFUNDING as terminal — later COMPLETED does not reverse the refund', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({ status: 'REFUNDING', amountUsd: 25 as any }),
    ) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not open ledger restore tx');
    });
    prisma.$transaction = dollar as any;
    const updateMock = mock.fn(async () => {
      throw new Error('should not update terminal row');
    });
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'COMPLETED');
    assert.equal(result?.status, 'REFUNDING');
    assert.equal(dollar.mock.callCount(), 0);
    assert.equal(updateMock.mock.callCount(), 0);
  });
});

describe('TransactionService.updateFromPaycrest — unhappy paths', () => {
  it('returns null when externalId is unknown', async () => {
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    prisma.transaction.findFirst = mock.fn(async () => null) as any;
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
  it('creates a PENDING remittance and reserves ledger when funds available', async () => {
    const created = sampleTx({
      status: 'PENDING',
      txHash: 'pending-ext-9',
      chainId: 0,
      blockNumber: 9n,
    });
    const capture: { createArgs?: any; updateManyArgs?: any } = {};
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    prisma.transaction.findFirst = mock.fn(async () => null) as any;
    prisma.$transaction = mock.fn(async (cb: any) => {
      const tx = {
        user: {
          updateMany: mock.fn(async (args: any) => {
            capture.updateManyArgs = args;
            assert.equal(args.where.id, 'user-1');
            assert.ok(args.where.walletBalance.gte);
            return { count: 1 };
          }),
        },
        transaction: {
          create: mock.fn(async (args: any) => {
            capture.createArgs = args;
            assert.equal(args.data.status, 'PENDING');
            assert.equal(args.data.type, 'REMITTANCE');
            assert.equal(args.data.txHash, 'pending-ext-9');
            assert.equal(args.data.chainId, 0);
            assert.equal(args.data.blockNumber, 9n);
            return created;
          }),
        },
      };
      return cb(tx);
    }) as any;

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
    assert.equal(
      capture.updateManyArgs.data.walletBalance.decrement.toString(),
      '25',
    );
  });

  it('returns existing PENDING row without double-debiting (idempotent externalId)', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      txHash: 'pending-ext-9',
      externalId: 'ext-9',
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not open ledger txn');
    });
    prisma.$transaction = dollar as any;

    const result = await TransactionService.createPending({
      userId: 'user-1',
      orderId: 99n,
      externalId: 'ext-9',
      sourceToken: 'USDC',
      amountUsd: 25,
      payoutFiat: 40000,
      recipientName: 'Jane Doe',
      recipientBank: '058',
      recipientAcc: '0123456789',
    });

    assert.equal(result.id, existing.id);
    assert.equal(dollar.mock.callCount(), 0);
  });

  it('resumes open PROCESSING when externalId was remapped to Paycrest order id', async () => {
    const open = sampleTx({
      status: 'PROCESSING',
      txHash: 'pending-paycrest-ord',
      externalId: 'paycrest-ord',
      amountUsd: 25 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    prisma.transaction.findFirst = mock.fn(async () => open) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not open ledger txn');
    });
    prisma.$transaction = dollar as any;

    const result = await TransactionService.createPending({
      userId: 'user-1',
      orderId: 99n,
      externalId: 'new-frontend-key',
      sourceToken: 'USDC',
      amountUsd: 25,
      payoutFiat: 40000,
      recipientName: 'Jane Doe',
      recipientBank: '058',
      recipientAcc: '0123456789',
    });

    assert.equal(result.id, open.id);
    assert.equal(result.status, 'PROCESSING');
    assert.equal(dollar.mock.callCount(), 0);
  });

  it('reopens FAILED abandoned row and re-reserves ledger', async () => {
    const existing = sampleTx({
      status: 'FAILED',
      txHash: 'abandoned-tx-1',
      externalId: 'ext-9',
      amountUsd: 25 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const capture: { updateManyArgs?: any; updateArgs?: any } = {};
    prisma.$transaction = mock.fn(async (cb: any) => {
      const tx = {
        user: {
          updateMany: mock.fn(async (args: any) => {
            capture.updateManyArgs = args;
            return { count: 1 };
          }),
        },
        transaction: {
          update: mock.fn(async (args: any) => {
            capture.updateArgs = args;
            return { ...existing, status: 'PENDING', txHash: 'pending-ext-9' };
          }),
        },
      };
      return cb(tx);
    }) as any;

    const result = await TransactionService.createPending({
      userId: 'user-1',
      orderId: 99n,
      externalId: 'ext-9',
      sourceToken: 'USDC',
      amountUsd: 25,
      payoutFiat: 40000,
      recipientName: 'Jane Doe',
      recipientBank: '058',
      recipientAcc: '0123456789',
    });

    assert.equal(result.status, 'PENDING');
    assert.equal(capture.updateManyArgs.data.walletBalance.decrement.toString(), '25');
    assert.equal(capture.updateArgs.data.txHash, 'pending-ext-9');
  });
});

describe('TransactionService.createPending — unhappy paths', () => {
  it('throws InsufficientBalanceError when reserve update matches no rows', async () => {
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    prisma.transaction.findFirst = mock.fn(async () => null) as any;
    prisma.$transaction = mock.fn(async (cb: any) => {
      const tx = {
        user: {
          updateMany: mock.fn(async () => ({ count: 0 })),
        },
        transaction: {
          create: mock.fn(async () => {
            throw new Error('should not create');
          }),
        },
      };
      return cb(tx);
    }) as any;

    await assert.rejects(
      () =>
        TransactionService.createPending({
          userId: 'user-1',
          orderId: 9n,
          externalId: 'ext-9',
          sourceToken: 'USDC',
          amountUsd: 25,
          payoutFiat: 40000,
          recipientName: 'Jane Doe',
          recipientBank: '058',
          recipientAcc: '0123456789',
        }),
      (err: unknown) => {
        assert.ok(err instanceof InsufficientBalanceError);
        assert.equal(err.code, 'INSUFFICIENT_BALANCE');
        return true;
      },
    );
  });
});

describe('TransactionService.cancelAbandonedPending', () => {
  it('fails and refunds when txHash is still pending-*', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      txHash: 'pending-ext-1',
      amountUsd: 10 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const restore = mock.method(
      TransactionService,
      'updateFromPaycrest',
      async () => sampleTx({ status: 'FAILED', id: 'tx-1', orderId: 42n }),
    );
    const updateMock = mock.fn(async (args: any) => {
      assert.equal(args.data.txHash, 'abandoned-tx-1');
      return { ...existing, status: 'FAILED', txHash: 'abandoned-tx-1' };
    });
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.cancelAbandonedPending('ext-1');
    assert.equal(result?.status, 'FAILED');
    assert.equal(restore.mock.calls[0].arguments[1], 'FAILED');
    assert.equal(updateMock.mock.callCount(), 1);
  });

  it('refuses cancel when on-chain txHash already attached', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({ status: 'PENDING', txHash: '0xreal' }),
    ) as any;

    await assert.rejects(
      () => TransactionService.cancelAbandonedPending('ext-1'),
      /on-chain txHash already attached/,
    );
  });
});

describe('TransactionService.expireStalePendingRemittances', () => {
  it('cancels stale pending-* remittances older than the cutoff', async () => {
    prisma.transaction.findMany = mock.fn(async (args: any) => {
      assert.deepEqual(args.where.status, { in: ['PENDING', 'PROCESSING'] });
      assert.equal(args.where.txHash.startsWith, 'pending-');
      return [{ id: 'tx-old', externalId: 'ext-old' }];
    }) as any;

    const cancel = mock.method(
      TransactionService,
      'cancelAbandonedPending',
      async (key: string) => {
        assert.equal(key, 'ext-old');
        return { id: 'tx-old', status: 'FAILED' };
      },
    );

    const result = await TransactionService.expireStalePendingRemittances({
      olderThanMs: 60_000,
    });
    assert.deepEqual(result, { scanned: 1, expired: 1, failed: 0 });
    assert.equal(cancel.mock.callCount(), 1);
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
