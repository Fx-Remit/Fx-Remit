process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import {
  TransactionService,
  InsufficientBalanceError,
  ProviderOrderStillLiveError,
} from './transaction.service.js';
import { PayoutService } from '../paycrest/payout.service.js';

const ON_CHAIN =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const originals = {
  findUnique: prisma.transaction.findUnique,
  findFirst: prisma.transaction.findFirst,
  update: prisma.transaction.update,
  updateMany: prisma.transaction.updateMany,
  create: prisma.transaction.create,
  findMany: prisma.transaction.findMany,
  queryRaw: prisma.$queryRaw,
  dollarTransaction: prisma.$transaction,
  userUpdate: prisma.user.update,
};

afterEach(() => {
  prisma.transaction.findUnique = originals.findUnique;
  prisma.transaction.findFirst = originals.findFirst;
  prisma.transaction.update = originals.update;
  prisma.transaction.updateMany = originals.updateMany;
  prisma.transaction.create = originals.create;
  prisma.transaction.findMany = originals.findMany;
  prisma.$queryRaw = originals.queryRaw;
  prisma.$transaction = originals.dollarTransaction;
  prisma.user.update = originals.userUpdate;
  mock.restoreAll();
});

/** Simulate CAS failAndReleasePlaceholderCas inside $transaction. */
function mockCasRelease(existing: ReturnType<typeof sampleTx>) {
  const updateMany = mock.fn(async (args: any) => {
    assert.equal(args.where.id, existing.id);
    assert.equal(args.where.status, existing.status);
    assert.equal(args.where.txHash, existing.txHash);
    return { count: 1 };
  });
  const userUpdate = mock.fn(async () => ({ id: existing.userId }));
  const txUpdate = mock.fn(async () =>
    sampleTx({
      ...existing,
      status: 'FAILED',
      txHash: `abandoned-${existing.id}`,
    }),
  );
  prisma.$transaction = mock.fn(async (fn: any) =>
    fn({
      transaction: { updateMany, update: txUpdate },
      user: { update: userUpdate },
    }),
  ) as any;
  return { updateMany, userUpdate, txUpdate };
}

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
    assert.equal(serialized.type, 'REMITTANCE');
    assert.equal(typeof JSON.stringify(serialized), 'string');
    assert.equal((serialized as any).orderId === 42n, false);
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
    const existing = sampleTx({
      status: 'PENDING',
      amountUsd: 25 as any,
      txHash: 'pending-ext-1',
    });
    const capture: { userUpdateArgs?: any } = {};
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          updateMany: mock.fn(async () => ({ count: 1 })),
          findUnique: mock.fn(async () =>
            sampleTx({ status: 'FAILED', txHash: 'pending-ext-1' }),
          ),
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
    const existing = sampleTx({
      status: 'PENDING',
      amountUsd: 25 as any,
      txHash: 'pending-ext-1',
    });
    const capture: { userUpdateArgs?: any } = {};
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          updateMany: mock.fn(async () => ({ count: 1 })),
          findUnique: mock.fn(async () =>
            sampleTx({ status: 'REFUNDING', txHash: 'pending-ext-1' }),
          ),
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

  it('does not restore ledger on FAILED for funded on-chain remittance (#90)', async () => {
    const existing = sampleTx({
      status: 'PROCESSING',
      amountUsd: 25 as any,
      txHash: '0xfundedabc',
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not open ledger restore tx');
    });
    prisma.$transaction = dollar as any;
    const updateMock = mock.fn(async () =>
      sampleTx({ status: 'FAILED', txHash: '0xfundedabc', amountUsd: 25 as any }),
    );
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'FAILED');
    assert.equal(result?.status, 'FAILED');
    assert.equal(dollar.mock.callCount(), 0);
    assert.equal(updateMock.mock.callCount(), 1);
  });

  it('does not restore ledger on REFUNDING for funded on-chain remittance (#90)', async () => {
    const existing = sampleTx({
      status: 'PROCESSING',
      amountUsd: 25 as any,
      txHash: '0xfundedabc',
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not open ledger restore tx');
    });
    prisma.$transaction = dollar as any;
    const updateMock = mock.fn(async () =>
      sampleTx({ status: 'REFUNDING', txHash: '0xfundedabc', amountUsd: 25 as any }),
    );
    prisma.transaction.update = updateMock as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'REFUNDING');
    assert.equal(result?.status, 'REFUNDING');
    assert.equal(dollar.mock.callCount(), 0);
    assert.equal(updateMock.mock.callCount(), 1);
  });

  it('does not restore ledger when attachOnChainHash races after placeholder snapshot (#90)', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      amountUsd: 25 as any,
      txHash: 'pending-ext-1',
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    let balanceIncrements = 0;
    const capture: { statusOnlyUpdate?: any } = {};
    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          updateMany: mock.fn(async () => ({ count: 0 })),
          findUnique: mock.fn(async () =>
            sampleTx({
              status: 'PENDING',
              amountUsd: 25 as any,
              txHash: '0xattachednow',
            }),
          ),
          update: mock.fn(async (args: any) => {
            capture.statusOnlyUpdate = args;
            return sampleTx({
              status: 'FAILED',
              amountUsd: 25 as any,
              txHash: '0xattachednow',
            });
          }),
        },
        user: {
          update: mock.fn(async () => {
            balanceIncrements += 1;
          }),
        },
      };
      return cb(client);
    }) as any;

    const result = await TransactionService.updateFromPaycrest('ext-1', 'FAILED');
    assert.equal(result?.status, 'FAILED');
    assert.equal(balanceIncrements, 0);
    assert.equal(capture.statusOnlyUpdate?.data.status, 'FAILED');
  });

  it('CAS restore does not pin snapshot status so PENDING→PROCESSING cannot skip refund', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      amountUsd: 25 as any,
      txHash: 'pending-ext-1',
    });
    const capture: { updateManyArgs?: any; userUpdateArgs?: any } = {};
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          updateMany: mock.fn(async (args: any) => {
            capture.updateManyArgs = args;
            return { count: 1 };
          }),
          findUnique: mock.fn(async () =>
            sampleTx({ status: 'FAILED', txHash: 'pending-ext-1', amountUsd: 25 as any }),
          ),
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
    assert.deepEqual(capture.updateManyArgs.where.status, {
      notIn: ['COMPLETED', 'FAILED', 'REFUNDING', 'REFUND_REQUIRED'],
    });
    assert.equal(capture.userUpdateArgs.data.walletBalance.increment, 25);
  });

  it('restores ledger at most once under concurrent FAILED webhooks (#91)', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      amountUsd: 25 as any,
      txHash: 'pending-ext-1',
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;

    let claimAttempts = 0;
    let balanceIncrements = 0;

    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          updateMany: mock.fn(async () => {
            claimAttempts += 1;
            return { count: claimAttempts === 1 ? 1 : 0 };
          }),
          findUnique: mock.fn(async () =>
            sampleTx({
              status: 'FAILED',
              amountUsd: 25 as any,
              txHash: 'pending-ext-1',
            }),
          ),
          update: mock.fn(async () => {
            throw new Error('loser must not status-update after terminal claim');
          }),
        },
        user: {
          update: mock.fn(async () => {
            balanceIncrements += 1;
            return { id: 'user-1' };
          }),
        },
      };
      return cb(client);
    }) as any;

    const [a, b] = await Promise.all([
      TransactionService.updateFromPaycrest('ext-1', 'FAILED'),
      TransactionService.updateFromPaycrest('ext-1', 'FAILED'),
    ]);

    assert.equal(a?.status, 'FAILED');
    assert.equal(b?.status, 'FAILED');
    assert.equal(claimAttempts, 2);
    assert.equal(balanceIncrements, 1);
  });

  it('restores ledger at most once under concurrent FAILED then REFUNDING (#91)', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      amountUsd: 40 as any,
      txHash: 'pending-ext-1',
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;

    let claimAttempts = 0;
    let balanceIncrements = 0;

    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          updateMany: mock.fn(async () => {
            claimAttempts += 1;
            return { count: claimAttempts === 1 ? 1 : 0 };
          }),
          findUnique: mock.fn(async () =>
            sampleTx({
              status: 'FAILED',
              amountUsd: 40 as any,
              txHash: 'pending-ext-1',
            }),
          ),
          update: mock.fn(async () => {
            throw new Error('loser must not status-update after terminal claim');
          }),
        },
        user: {
          update: mock.fn(async () => {
            balanceIncrements += 1;
            return { id: 'user-1' };
          }),
        },
      };
      return cb(client);
    }) as any;

    const [a, b] = await Promise.all([
      TransactionService.updateFromPaycrest('ext-1', 'FAILED'),
      TransactionService.updateFromPaycrest('ext-1', 'REFUNDING'),
    ]);

    assert.ok(a?.status === 'FAILED' || a?.status === 'REFUNDING');
    assert.ok(b?.status === 'FAILED' || b?.status === 'REFUNDING');
    assert.equal(claimAttempts, 2);
    assert.equal(balanceIncrements, 1);
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

  it('creates a second bank row for same USD amount with a different externalId (#94)', async () => {
    // Open bank remittance for Bank A must not be resumed by amount-match.
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    const findFirst = mock.fn(async () => {
      throw new Error('amount-match must not run (#94)');
    });
    prisma.transaction.findFirst = findFirst as any;

    const capture: { createArgs?: any } = {};
    prisma.$transaction = mock.fn(async (cb: any) => {
      const tx = {
        user: {
          updateMany: async () => ({ count: 1 }),
        },
        transaction: {
          create: async (args: any) => {
            capture.createArgs = args;
            return sampleTx({
              id: 'bank-b',
              ...args.data,
              status: 'PENDING',
            });
          },
        },
      };
      return cb(tx);
    }) as any;

    const result = await TransactionService.createPending({
      userId: 'user-1',
      orderId: 100n,
      externalId: 'ext-bank-b',
      sourceToken: 'USDC',
      amountUsd: 25,
      payoutFiat: 40000,
      recipientName: 'Bank B Recipient',
      recipientBank: '033',
      recipientAcc: '9876543210',
    });

    assert.equal(result.id, 'bank-b');
    assert.equal(findFirst.mock.callCount(), 0);
    assert.equal(capture.createArgs.data.externalId, 'ext-bank-b');
    assert.equal(capture.createArgs.data.recipientBank, '033');
    assert.equal(capture.createArgs.data.recipientAcc, '9876543210');
  });

  it('does not amount-match for crypto withdraws either', async () => {
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    const findFirst = mock.fn(async () => {
      throw new Error('crypto must not amount-match');
    });
    prisma.transaction.findFirst = findFirst as any;

    const capture: { updateManyArgs?: any; createArgs?: any } = {};
    prisma.$transaction = mock.fn(async (cb: any) => {
      const tx = {
        user: {
          updateMany: async (args: any) => {
            capture.updateManyArgs = args;
            return { count: 1 };
          },
        },
        transaction: {
          create: async (args: any) => {
            capture.createArgs = args;
            return sampleTx({
              ...args.data,
              id: 'crypto-new',
              status: 'PENDING',
            });
          },
        },
      };
      return cb(tx);
    }) as any;

    const result = await TransactionService.createPending({
      userId: 'user-1',
      orderId: 99n,
      externalId: 'crypto_fresh',
      sourceToken: 'USDC',
      amountUsd: 25,
      payoutFiat: 25,
      recipientName: 'Crypto withdraw',
      recipientBank: 'crypto:base',
      recipientAcc: '0x1111111111111111111111111111111111111111',
    });

    assert.equal(result.id, 'crypto-new');
    assert.equal(findFirst.mock.callCount(), 0);
    assert.equal(capture.createArgs.data.recipientBank, 'crypto:base');
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
  it('fails and refunds when txHash is still pending-* app-local and PENDING', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      txHash: 'pending-pnd_ext-1',
      amountUsd: 10 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const cas = mockCasRelease(existing);

    const result = await TransactionService.cancelAbandonedPending('ext-1');
    assert.equal(result?.status, 'FAILED');
    assert.equal(cas.updateMany.mock.callCount(), 1);
    assert.equal(cas.userUpdate.mock.callCount(), 1);
  });

  it('fails and refunds when pending hash is the client externalId (not pnd_*)', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      externalId: 'idem-client-9',
      txHash: 'pending-idem-client-9',
      amountUsd: 10 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const cas = mockCasRelease(existing);

    const result = await TransactionService.cancelAbandonedPending('idem-client-9');
    assert.equal(result?.status, 'FAILED');
    assert.equal(cas.updateMany.mock.callCount(), 1);
  });

  it('refuses cancel when CAS loses to concurrent create claim', async () => {
    const existing = sampleTx({
      status: 'PENDING',
      txHash: 'pending-pnd_race',
      externalId: 'ext-cas',
      amountUsd: 10 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    prisma.$transaction = mock.fn(async (fn: any) =>
      fn({
        transaction: {
          updateMany: async () => ({ count: 0 }),
          update: async () => {
            throw new Error('should not update');
          },
        },
        user: {
          update: async () => {
            throw new Error('should not credit');
          },
        },
      }),
    ) as any;

    await assert.rejects(
      () => TransactionService.cancelAbandonedPending('ext-cas'),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.equal(err.providerStatus, 'cas-lost');
        return true;
      },
    );
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

  it('refuses ledger restore when Paycrest order is still fundable', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({
        status: 'PROCESSING',
        txHash: 'pending-paycrest-ord-live',
        externalId: 'ext-live',
      }),
    ) as any;

    mock.method(PayoutService, 'getSettlementOrder', async (id: string) => {
      assert.equal(id, 'paycrest-ord-live');
      return { success: true, order: { id, status: 'pending' } };
    });

    await assert.rejects(
      () => TransactionService.cancelAbandonedPending('ext-live'),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.equal(err.code, 'PROVIDER_ORDER_STILL_LIVE');
        assert.equal(err.providerStatus, 'pending');
        return true;
      },
    );
  });

  it('refuses restore for PROCESSING + app-local hash (order before attach)', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({
        status: 'PROCESSING',
        txHash: 'pending-pnd_race',
        externalId: 'ext-race',
      }),
    ) as any;

    await assert.rejects(
      () => TransactionService.cancelAbandonedPending('ext-race'),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.equal(err.providerStatus, 'processing-unattached');
        return true;
      },
    );
  });

  it('restores when Paycrest order is already expired', async () => {
    const existing = sampleTx({
      status: 'PROCESSING',
      txHash: 'pending-paycrest-ord-dead',
      externalId: 'ext-dead',
      amountUsd: 10 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;

    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: { id: 'paycrest-ord-dead', status: 'expired' },
    }));

    const cas = mockCasRelease(existing);
    const result = await TransactionService.cancelAbandonedPending('ext-dead');
    assert.equal(result?.status, 'FAILED');
    assert.equal(cas.updateMany.mock.callCount(), 1);
  });

  it('restores when Paycrest stays initiated but unpaid past validUntil', async () => {
    const existing = sampleTx({
      status: 'PROCESSING',
      txHash: 'pending-paycrest-ord-stale-init',
      externalId: 'ext-stale-init',
      amountUsd: 10 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;

    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: {
        id: 'paycrest-ord-stale-init',
        status: 'initiated',
        amountPaid: '0',
        providerAccount: {
          validUntil: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    }));

    const cas = mockCasRelease(existing);
    const result =
      await TransactionService.cancelAbandonedPending('ext-stale-init');
    assert.equal(result?.status, 'FAILED');
    assert.equal(cas.updateMany.mock.callCount(), 1);
  });

  it('refuses restore when initiated and validUntil still in the future', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({
        status: 'PROCESSING',
        txHash: 'pending-paycrest-ord-live-window',
        externalId: 'ext-live-window',
      }),
    ) as any;

    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: {
        id: 'paycrest-ord-live-window',
        status: 'initiated',
        amountPaid: '0',
        providerAccount: {
          validUntil: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    }));

    await assert.rejects(
      () => TransactionService.cancelAbandonedPending('ext-live-window'),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.equal(err.providerStatus, 'initiated');
        return true;
      },
    );
  });

  it('refuses restore when amountPaid is missing even past validUntil', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({
        status: 'PROCESSING',
        txHash: 'pending-paycrest-ord-thin',
        externalId: 'ext-thin',
      }),
    ) as any;

    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: {
        id: 'paycrest-ord-thin',
        status: 'initiated',
        providerAccount: {
          validUntil: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    }));

    await assert.rejects(
      () => TransactionService.cancelAbandonedPending('ext-thin'),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.equal(err.providerStatus, 'initiated');
        return true;
      },
    );
  });

  it('refuses unpaid-window restore for non-initiated Paycrest status', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({
        status: 'PROCESSING',
        txHash: 'pending-paycrest-ord-pending',
        externalId: 'ext-pending-status',
      }),
    ) as any;

    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: {
        id: 'paycrest-ord-pending',
        status: 'pending',
        amountPaid: '0',
        providerAccount: {
          validUntil: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    }));

    await assert.rejects(
      () => TransactionService.cancelAbandonedPending('ext-pending-status'),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.equal(err.providerStatus, 'pending');
        return true;
      },
    );
  });

  it('forceUnpaid restores initiated unpaid order even inside validUntil', async () => {
    const existing = sampleTx({
      status: 'PROCESSING',
      txHash: 'pending-paycrest-ord-force',
      externalId: 'ext-force',
      amountUsd: 10 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;

    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: {
        id: 'paycrest-ord-force',
        status: 'initiated',
        amountPaid: '0',
        providerAccount: {
          validUntil: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    }));

    const cas = mockCasRelease(existing);
    const result = await TransactionService.cancelAbandonedPending('ext-force', {
      forceUnpaid: true,
    });
    assert.equal(result?.status, 'FAILED');
    assert.equal(cas.updateMany.mock.callCount(), 1);
  });

  it('forceUnpaid refuses when amountPaid is positive', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({
        status: 'PROCESSING',
        txHash: 'pending-paycrest-ord-paid',
        externalId: 'ext-paid',
      }),
    ) as any;

    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: {
        id: 'paycrest-ord-paid',
        status: 'initiated',
        amountPaid: '1',
      },
    }));

    await assert.rejects(
      () =>
        TransactionService.cancelAbandonedPending('ext-paid', {
          forceUnpaid: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.match(String(err.providerStatus), /amountPaid=1/);
        return true;
      },
    );
  });

  it('forceUnpaid refuses when amountPaid is missing', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({
        status: 'PROCESSING',
        txHash: 'pending-paycrest-ord-force-thin',
        externalId: 'ext-force-thin',
      }),
    ) as any;

    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: {
        id: 'paycrest-ord-force-thin',
        status: 'initiated',
      },
    }));

    await assert.rejects(
      () =>
        TransactionService.cancelAbandonedPending('ext-force-thin', {
          forceUnpaid: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.match(String(err.providerStatus), /amountPaid=missing/);
        return true;
      },
    );
  });

  it('refundAfterFailedProviderCreate restores PROCESSING app-local hash', async () => {
    const existing = sampleTx({
      status: 'PROCESSING',
      externalId: 'idem-client-9',
      txHash: 'pending-idem-client-9',
      amountUsd: 10 as any,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    const cas = mockCasRelease(existing);

    const result =
      await TransactionService.refundAfterFailedProviderCreate('idem-client-9');
    assert.equal(result?.status, 'FAILED');
    assert.equal(cas.updateMany.mock.callCount(), 1);
  });

  it('refundAfterFailedProviderCreate refuses once Paycrest order id is on the hash', async () => {
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({
        status: 'PROCESSING',
        externalId: 'idem-client-9',
        txHash: 'pending-paycrest-ord-live',
      }),
    ) as any;

    await assert.rejects(
      () => TransactionService.refundAfterFailedProviderCreate('idem-client-9'),
      (err: unknown) => {
        assert.ok(err instanceof ProviderOrderStillLiveError);
        assert.equal(err.providerStatus, 'linked-order');
        return true;
      },
    );
  });

  it('releaseCreateClaim reverts PROCESSING → PENDING for app-local hash', async () => {
    const existing = sampleTx({
      status: 'PROCESSING',
      externalId: 'idem-1',
      txHash: 'pending-idem-1',
    });
    let findCalls = 0;
    prisma.transaction.findUnique = mock.fn(async () => {
      findCalls += 1;
      return findCalls === 1
        ? existing
        : sampleTx({ ...existing, status: 'PENDING' });
    }) as any;
    const updateMany = mock.fn(async (args: any) => {
      assert.equal(args.where.status, 'PROCESSING');
      assert.equal(args.data.status, 'PENDING');
      return { count: 1 };
    });
    prisma.transaction.updateMany = updateMany as any;

    const result = await TransactionService.releaseCreateClaim('idem-1');
    assert.equal(result?.status, 'PENDING');
    assert.equal(updateMany.mock.callCount(), 1);
  });
});

describe('TransactionService.expireStalePendingRemittances', () => {
  it('cancels stale pending-* remittances older than the cutoff', async () => {
    prisma.transaction.findMany = mock.fn(async (args: any) => {
      assert.deepEqual(args.where.status, { in: ['PENDING', 'PROCESSING'] });
      assert.equal(args.where.txHash.startsWith, 'pending-');
      return [
        {
          id: 'tx-old',
          externalId: 'ext-old',
          txHash: 'pending-pnd_old',
          recipientBank: '058',
        },
      ];
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
    assert.deepEqual(result, { scanned: 1, expired: 1, failed: 0, deferred: 0 });
    assert.equal(cancel.mock.callCount(), 1);
  });

  it('never auto-refunds crypto withdraws stuck on pending-crypto_*', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'tx-crypto',
        externalId: 'crypto_1',
        txHash: 'pending-crypto_1',
        recipientBank: 'crypto:base',
      },
    ]) as any;

    const touch = mock.fn(async (args: any) => {
      assert.equal(args.where.id, 'tx-crypto');
      return { id: 'tx-crypto' };
    });
    prisma.transaction.update = touch as any;

    const cancel = mock.method(
      TransactionService,
      'cancelAbandonedPending',
      async () => {
        throw new Error('should not cancel crypto');
      },
    );

    const result = await TransactionService.expireStalePendingRemittances({
      olderThanMs: 60_000,
    });
    assert.deepEqual(result, { scanned: 1, expired: 0, failed: 0, deferred: 1 });
    assert.equal(touch.mock.callCount(), 1);
    assert.equal(cancel.mock.callCount(), 0);
  });

  it('defers expire when Paycrest order is still live after unsynced broadcast', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'tx-live',
        externalId: 'ext-live',
        txHash: 'pending-paycrest-ord-1',
        recipientBank: '058',
      },
    ]) as any;

    const touch = mock.fn(async (args: any) => {
      assert.equal(args.where.id, 'tx-live');
      assert.ok(args.data.updatedAt instanceof Date);
      return { id: 'tx-live' };
    });
    prisma.transaction.update = touch as any;

    const cancel = mock.method(
      TransactionService,
      'cancelAbandonedPending',
      async () => {
        throw new ProviderOrderStillLiveError('ext-live', 'pending');
      },
    );

    const result = await TransactionService.expireStalePendingRemittances({
      olderThanMs: 60_000,
    });
    assert.deepEqual(result, { scanned: 1, expired: 0, failed: 0, deferred: 1 });
    assert.equal(touch.mock.callCount(), 1);
    assert.equal(cancel.mock.callCount(), 1);
  });

  it('defers expire when provider status cannot be confirmed safe', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'tx-ambig',
        externalId: 'ext-ambig',
        txHash: 'pending-paycrest-ord-ambig',
        recipientBank: '058',
      },
    ]) as any;

    const touch = mock.fn(async () => ({ id: 'tx-ambig' }));
    prisma.transaction.update = touch as any;

    const cancel = mock.method(
      TransactionService,
      'cancelAbandonedPending',
      async () => {
        throw new ProviderOrderStillLiveError('ext-ambig');
      },
    );

    const result = await TransactionService.expireStalePendingRemittances({
      olderThanMs: 60_000,
    });
    assert.deepEqual(result, { scanned: 1, expired: 0, failed: 0, deferred: 1 });
    assert.equal(touch.mock.callCount(), 1);
    assert.equal(cancel.mock.callCount(), 1);
  });

  it('defers expire for PROCESSING + pending-pnd_* (order before attach)', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'tx-pnd',
        externalId: 'ext-pnd',
        txHash: 'pending-pnd_still',
        recipientBank: '058',
      },
    ]) as any;

    const touch = mock.fn(async () => ({ id: 'tx-pnd' }));
    prisma.transaction.update = touch as any;

    const cancel = mock.method(
      TransactionService,
      'cancelAbandonedPending',
      async () => {
        throw new ProviderOrderStillLiveError('ext-pnd', 'processing-unattached');
      },
    );

    const result = await TransactionService.expireStalePendingRemittances({
      olderThanMs: 60_000,
    });
    assert.deepEqual(result, { scanned: 1, expired: 0, failed: 0, deferred: 1 });
    assert.equal(cancel.mock.callCount(), 1);
    assert.equal(touch.mock.callCount(), 1);
  });

  it('expires when Paycrest order is already expired/failed', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'tx-dead',
        externalId: 'ext-dead',
        txHash: 'pending-paycrest-ord-dead',
        recipientBank: '058',
      },
    ]) as any;

    const cancel = mock.method(
      TransactionService,
      'cancelAbandonedPending',
      async (key: string) => {
        assert.equal(key, 'ext-dead');
        return { id: 'tx-dead', status: 'FAILED' };
      },
    );

    const result = await TransactionService.expireStalePendingRemittances({
      olderThanMs: 60_000,
    });
    assert.deepEqual(result, { scanned: 1, expired: 1, failed: 0, deferred: 0 });
    assert.equal(cancel.mock.callCount(), 1);
  });
});

describe('TransactionService.tryMarkCompletedFromPaycrest', () => {
  it('marks COMPLETED when Paycrest reports settled', async () => {
    const updated = sampleTx({ status: 'COMPLETED' });
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: { id: 'pc-1', status: 'settled' },
    }));
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({ status: 'PROCESSING', txHash: ON_CHAIN }),
    ) as any;
    prisma.transaction.update = mock.fn(async () => updated) as any;

    const result = await TransactionService.tryMarkCompletedFromPaycrest({
      externalId: 'ref-1',
      anchorTransactionId: 'pc-1',
    });
    assert.equal(result?.status, 'COMPLETED');
  });

  it('no-ops when Paycrest order is still processing', async () => {
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: { id: 'pc-2', status: 'processing' },
    }));

    const result = await TransactionService.tryMarkCompletedFromPaycrest({
      externalId: 'ref-2',
      anchorTransactionId: 'pc-2',
    });
    assert.equal(result, null);
  });
});

describe('TransactionService.findByPaycrestKey', () => {
  it('resolves by externalId (Paycrest reference)', async () => {
    const row = sampleTx({ externalId: 'ref-uuid' });
    prisma.transaction.findUnique = mock.fn(async () => row) as any;
    const result = await TransactionService.findByPaycrestKey('ref-uuid');
    assert.equal(result?.id, row.id);
  });

  it('resolves by anchorTransactionId after on-chain hash attached', async () => {
    const row = sampleTx({
      externalId: 'ref-uuid',
      anchorTransactionId: '2e15d59e-e62e-492a-bc8c-6f478b11d044',
      txHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    prisma.transaction.findFirst = mock.fn(async (args: any) => {
      if (args?.where?.anchorTransactionId) return row;
      return null;
    }) as any;
    const result = await TransactionService.findByPaycrestKey(
      '2e15d59e-e62e-492a-bc8c-6f478b11d044',
    );
    assert.equal(result?.id, row.id);
  });
});

describe('TransactionService.attachOnChainHash', () => {
  const HASH =
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  it('attaches hash only for the owning user', async () => {
    const existing = sampleTx({
      userId: 'user-1',
      status: 'PENDING',
      txHash: 'pending-pnd_1',
      recipientBank: '058',
    });
    const attached = { ...existing, txHash: HASH, chainId: 8453 };
    prisma.transaction.findFirst = mock.fn(async () => existing) as any;
    prisma.transaction.findUnique = mock.fn(async () => attached) as any;
    const updateManyMock = mock.fn(async (args: any) => {
      assert.equal(args.data.txHash, HASH);
      assert.equal(args.data.chainId, 8453);
      assert.equal(args.data.status, undefined);
      assert.ok(args.where.OR);
      return { count: 1 };
    });
    prisma.transaction.updateMany = updateManyMock as any;

    const result = await TransactionService.attachOnChainHash({
      userId: 'user-1',
      orderId: 42n,
      txHash: HASH,
    });
    assert.equal(result?.txHash, HASH);
    assert.equal(updateManyMock.mock.callCount(), 1);
  });

  it('returns null when userId does not own the row', async () => {
    prisma.transaction.findFirst = mock.fn(async () => null) as any;

    const result = await TransactionService.attachOnChainHash({
      userId: 'attacker',
      orderId: 42n,
      txHash: HASH,
    });
    assert.equal(result, null);
  });

  it('is idempotent when hash already attached after chainId stamp', async () => {
    const existing = sampleTx({
      userId: 'user-1',
      status: 'PROCESSING',
      txHash: HASH,
      chainId: 8453,
      recipientBank: '058',
    });
    prisma.transaction.findFirst = mock.fn(async () => existing) as any;
    const updateMany = mock.fn(async () => ({ count: 0 }));
    prisma.transaction.updateMany = updateMany as any;

    const result = await TransactionService.attachOnChainHash({
      userId: 'user-1',
      orderId: 42n,
      txHash: HASH,
    });
    assert.equal(result?.txHash, HASH);
    assert.equal(updateMany.mock.callCount(), 0);
  });

  it('preserves Paycrest order id on anchorTransactionId when attaching', async () => {
    const existing = sampleTx({
      userId: 'user-1',
      status: 'PROCESSING',
      txHash: 'pending-ord_paycrest_1',
      recipientBank: '058',
      anchorTransactionId: null,
    });
    const attached = { ...existing, txHash: HASH, chainId: 8453 };
    prisma.transaction.findFirst = mock.fn(async () => existing) as any;
    prisma.transaction.findUnique = mock.fn(async () => attached) as any;
    const updateManyMock = mock.fn(async (args: any) => {
      assert.equal(args.data.anchorTransactionId, 'ord_paycrest_1');
      return { count: 1 };
    });
    prisma.transaction.updateMany = updateManyMock as any;

    await TransactionService.attachOnChainHash({
      userId: 'user-1',
      orderId: 42n,
      txHash: HASH,
    });
    assert.equal(updateManyMock.mock.callCount(), 1);
  });

  it('marks crypto withdraw COMPLETED', async () => {
    const existing = sampleTx({
      userId: 'user-1',
      status: 'PENDING',
      txHash: 'pending-crypto_1',
      recipientBank: 'crypto:base',
    });
    const attached = { ...existing, status: 'COMPLETED', txHash: HASH, chainId: 8453 };
    prisma.transaction.findFirst = mock.fn(async () => existing) as any;
    prisma.transaction.findUnique = mock.fn(async () => attached) as any;
    prisma.transaction.updateMany = mock.fn(async (args: any) => {
      assert.equal(args.data.status, 'COMPLETED');
      assert.equal(args.data.txHash, HASH);
      assert.equal(args.data.chainId, 8453);
      return { count: 1 };
    }) as any;

    const result = await TransactionService.attachOnChainHash({
      userId: 'user-1',
      orderId: 42n,
      txHash: HASH,
    });
    assert.equal(result?.status, 'COMPLETED');
  });

  it('stamps the real settlement chain for a Celo crypto withdraw, not Paycrest\'s Base chainId', async () => {
    const existing = sampleTx({
      userId: 'user-1',
      status: 'PENDING',
      txHash: 'pending-crypto_2',
      recipientBank: 'crypto:celo',
    });
    const attached = { ...existing, status: 'COMPLETED', txHash: HASH, chainId: 42220 };
    prisma.transaction.findFirst = mock.fn(async () => existing) as any;
    prisma.transaction.findUnique = mock.fn(async () => attached) as any;
    prisma.transaction.updateMany = mock.fn(async (args: any) => {
      assert.equal(args.data.chainId, 42220);
      return { count: 1 };
    }) as any;

    const result = await TransactionService.attachOnChainHash({
      userId: 'user-1',
      orderId: 42n,
      txHash: HASH,
    });
    assert.equal(result?.chainId, 42220);
  });
});

describe('TransactionService REFUND_REQUIRED ops paths (#96)', () => {
  const ON_CHAIN =
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  it('restoreRefundRequired credits wallet and marks FAILED', async () => {
    const existing = sampleTx({
      status: 'REFUND_REQUIRED',
      amountUsd: 25 as any,
      txHash: ON_CHAIN,
    });
    prisma.transaction.findUnique = mock.fn(async () =>
      sampleTx({ status: 'FAILED', amountUsd: 25 as any, txHash: ON_CHAIN }),
    ) as any;

    const capture: { userUpdateArgs?: any } = {};
    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          updateMany: mock.fn(async (args: any) => {
            assert.equal(args.where.status, 'REFUND_REQUIRED');
            assert.equal(args.data.status, 'FAILED');
            return { count: 1 };
          }),
          findUnique: mock.fn(async () =>
            sampleTx({ status: 'FAILED', amountUsd: 25 as any, txHash: ON_CHAIN }),
          ),
        },
        user: {
          update: mock.fn(async (args: any) => {
            capture.userUpdateArgs = args;
            return { id: args.where.id };
          }),
        },
      };
      // First findUnique outside $transaction
      return cb(client);
    }) as any;

    // Outside findUnique for the initial load
    let calls = 0;
    prisma.transaction.findUnique = mock.fn(async () => {
      calls += 1;
      return calls === 1
        ? existing
        : sampleTx({ status: 'FAILED', amountUsd: 25 as any, txHash: ON_CHAIN });
    }) as any;

    const result = await TransactionService.restoreRefundRequired('tx-1');
    assert.equal(result?.status, 'FAILED');
    assert.equal(capture.userUpdateArgs.data.walletBalance.increment, 25);
  });

  it('completeRefundRequiredAfterOnChainCredit closes without ledger restore', async () => {
    const existing = sampleTx({
      status: 'REFUND_REQUIRED',
      amountUsd: 25 as any,
      txHash: ON_CHAIN,
    });
    prisma.transaction.findUnique = mock.fn(async () => existing) as any;
    prisma.transaction.updateMany = mock.fn(async (args: any) => {
      assert.equal(args.data.status, 'FAILED');
      return { count: 1 };
    }) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not open ledger restore');
    });
    prisma.$transaction = dollar as any;

    // Second findUnique after claim
    let n = 0;
    prisma.transaction.findUnique = mock.fn(async () => {
      n += 1;
      return n === 1
        ? existing
        : sampleTx({ status: 'FAILED', amountUsd: 25 as any, txHash: ON_CHAIN });
    }) as any;

    const result =
      await TransactionService.completeRefundRequiredAfterOnChainCredit('tx-1');
    assert.equal(result?.status, 'FAILED');
    assert.equal(dollar.mock.callCount(), 0);
  });

  it('expireStaleRefundRequired is disabled when TTL is 0', async () => {
    process.env.REFUND_REQUIRED_TTL_MS = '0';
    const result = await TransactionService.expireStaleRefundRequired();
    assert.equal(result.disabled, true);
    assert.equal(result.restored, 0);
    assert.equal(result.escalated, 0);
    delete process.env.REFUND_REQUIRED_TTL_MS;
  });

  it('expireStaleRefundRequired escalates on-chain holds without ledger restore', async () => {
    const ON_CHAIN =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'tx-rr',
        txHash: ON_CHAIN,
        refundTxHash: null,
        amountUsd: { toString: () => '25' },
        orderId: 1n,
      },
    ]) as any;
    const restore = mock.method(
      TransactionService,
      'restoreRefundRequired',
      async () => {
        throw new Error('must not restore on-chain TTL');
      },
    );

    const result = await TransactionService.expireStaleRefundRequired({
      olderThanMs: 1,
    });
    assert.equal(result.escalated, 1);
    assert.equal(result.restored, 0);
    assert.equal(restore.mock.callCount(), 0);
  });

  it('expireStaleRefundRequired escalates unknown-* holds without ledger restore', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'tx-rr',
        txHash: 'unknown-42-8453',
        refundTxHash: null,
        amountUsd: { toString: () => '25' },
        orderId: 1n,
      },
    ]) as any;
    const restore = mock.method(
      TransactionService,
      'restoreRefundRequired',
      async () => {
        throw new Error('must not restore unknown-* TTL');
      },
    );

    const result = await TransactionService.expireStaleRefundRequired({
      olderThanMs: 1,
    });
    assert.equal(result.escalated, 1);
    assert.equal(result.restored, 0);
    assert.equal(restore.mock.callCount(), 0);
  });

  it('expireStaleRefundRequired closes when refundTxHash already set', async () => {
    const ON_CHAIN =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'tx-rr',
        txHash: ON_CHAIN,
        refundTxHash: '0xrefund',
        amountUsd: { toString: () => '25' },
        orderId: 1n,
      },
    ]) as any;
    const complete = mock.method(
      TransactionService,
      'completeRefundRequiredAfterOnChainCredit',
      async () => sampleTx({ status: 'FAILED', id: 'tx-rr' }),
    );
    const restore = mock.method(
      TransactionService,
      'restoreRefundRequired',
      async () => {
        throw new Error('must not restore when refund linked');
      },
    );

    const result = await TransactionService.expireStaleRefundRequired({
      olderThanMs: 1,
    });
    assert.equal(result.closedAfterCredit, 1);
    assert.equal(result.restored, 0);
    assert.equal(complete.mock.callCount(), 1);
    assert.equal(restore.mock.callCount(), 0);
  });
});

describe('TransactionService.getHistory — happy paths', () => {
  it('returns serialized rows ordered by createdAt desc', async () => {
    prisma.transaction.findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.userId, 'user-1');
      assert.equal(args.take, 10);
      assert.equal(args.skip, 5);
      assert.deepEqual(args.orderBy, { createdAt: 'desc' });
      assert.ok(args.select);
      assert.equal(args.select.rail, undefined);
      assert.equal(args.select.refundTxHash, undefined);
      return [sampleTx()];
    }) as any;

    const rows = await TransactionService.getHistory('user-1', 10, 5);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].orderId, '42');
    assert.equal(rows[0].amountUsd, 100.5);
  });

  it('falls back to raw SQL when Prisma select throws', async () => {
    prisma.transaction.findMany = mock.fn(async () => {
      throw new Error('column rail does not exist');
    }) as any;
    prisma.$queryRaw = mock.fn(async () => [sampleTx()]) as any;

    const rows = await TransactionService.getHistory('user-1', 10, 0);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'tx-1');
    assert.equal((prisma.$queryRaw as any).mock.callCount(), 1);
  });

  it('rethrows non-schema-drift Prisma errors without raw fallback', async () => {
    prisma.transaction.findMany = mock.fn(async () => {
      throw new Error('connection refused');
    }) as any;
    prisma.$queryRaw = mock.fn(async () => {
      throw new Error('should not be called');
    }) as any;

    await assert.rejects(
      () => TransactionService.getHistory('user-1', 10, 0),
      /connection refused/,
    );
    assert.equal((prisma.$queryRaw as any).mock.callCount(), 0);
  });

  it('preserves limit=0 instead of coercing to 20', async () => {
    prisma.transaction.findMany = mock.fn(async (args: any) => {
      assert.equal(args.take, 0);
      return [];
    }) as any;

    const rows = await TransactionService.getHistory('user-1', 0, 0);
    assert.equal(rows.length, 0);
  });
});
