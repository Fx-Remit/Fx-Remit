process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { TransactionService } from '../transactions/transaction.service.js';

const originals = {
  userFindFirst: prisma.user.findFirst,
  txFindUnique: prisma.transaction.findUnique,
  txFindFirst: prisma.transaction.findFirst,
  txFindMany: prisma.transaction.findMany,
  dollarTransaction: prisma.$transaction,
};

afterEach(() => {
  prisma.user.findFirst = originals.userFindFirst;
  prisma.transaction.findUnique = originals.txFindUnique;
  prisma.transaction.findFirst = originals.txFindFirst;
  prisma.transaction.findMany = originals.txFindMany;
  prisma.$transaction = originals.dollarTransaction;
  mock.restoreAll();
});

describe('TransactionService.creditInboundDeposit', () => {
  it('returns existing row on (txHash, logIndex) without double-credit', async () => {
    prisma.user.findFirst = mock.fn(async () => ({
      id: 'u1',
      walletAddress: '0xabc',
    })) as any;
    prisma.transaction.findUnique = mock.fn(async (args: any) => {
      if (args.where?.chainId_blockNumber_logIndex) return null;
      if (args.where?.txHash_logIndex) {
        return { id: 'existing-dep', txHash: '0xhash', logIndex: 3 };
      }
      return null;
    }) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not create');
    });
    prisma.$transaction = dollar as any;

    const result = await TransactionService.creditInboundDeposit({
      walletAddress: '0xAbC',
      txHash: '0xhash',
      chainId: 8453,
      blockNumber: 100n,
      logIndex: 3,
      sourceToken: 'USDC',
      amountUsd: '1.2',
    });

    assert.equal(result.created, false);
    assert.equal(result.transaction.id, 'existing-dep');
    assert.equal(dollar.mock.callCount(), 0);
  });

  it('skips credit when refundTxHash already linked on a remittance (#90)', async () => {
    prisma.user.findFirst = mock.fn(async () => ({
      id: 'u1',
      walletAddress: '0xabc',
    })) as any;
    prisma.transaction.findUnique = mock.fn(async (args: any) => {
      if (args.where?.refundTxHash === '0xrefund') {
        return {
          id: 'remit-1',
          type: 'REMITTANCE',
          refundTxHash: '0xrefund',
          status: 'FAILED',
        };
      }
      return null;
    }) as any;
    const dollar = mock.fn(async () => {
      throw new Error('should not create');
    });
    prisma.$transaction = dollar as any;

    const result = await TransactionService.creditInboundDeposit({
      walletAddress: '0xabc',
      txHash: '0xrefund',
      chainId: 8453,
      blockNumber: 50n,
      logIndex: 1,
      sourceToken: 'USDC',
      amountUsd: '25',
    });

    assert.equal(result.created, false);
    assert.equal(result.transaction.id, 'remit-1');
    assert.equal(dollar.mock.callCount(), 0);
  });

  it('links funded FAILED remittance and credits once on matching refund deposit (#90)', async () => {
    prisma.user.findFirst = mock.fn(async () => ({
      id: 'u1',
      walletAddress: '0xabc',
    })) as any;
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'remit-1',
        externalId: 'ext-1',
        type: 'REMITTANCE',
        status: 'FAILED',
        txHash: '0xsettlement',
        amountUsd: 25,
        refundTxHash: null,
      },
    ]) as any;

    const capture: {
      updateManyArgs?: any;
      createArgs?: any;
      userUpdateArgs?: any;
    } = {};

    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          findUnique: mock.fn(async () => null),
          updateMany: mock.fn(async (args: any) => {
            capture.updateManyArgs = args;
            return { count: 1 };
          }),
          create: mock.fn(async (args: any) => {
            capture.createArgs = args;
            return { id: 'dep-1', ...args.data };
          }),
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

    const result = await TransactionService.creditInboundDeposit({
      walletAddress: '0xabc',
      txHash: '0xrefund',
      chainId: 8453,
      blockNumber: 50n,
      logIndex: 1,
      sourceToken: 'USDC',
      amountUsd: '25',
    });

    assert.equal(result.created, true);
    assert.equal(result.transaction.id, 'dep-1');
    assert.equal(capture.updateManyArgs.where.id, 'remit-1');
    assert.equal(capture.updateManyArgs.data.refundTxHash, '0xrefund');
    assert.equal(capture.userUpdateArgs.data.walletBalance.increment.toString(), '25');
    assert.match(capture.createArgs.data.recipientName, /Paycrest refund/);
  });

  it('does not credit when concurrent refund CAS loses and hash is already linked (#90)', async () => {
    prisma.user.findFirst = mock.fn(async () => ({
      id: 'u1',
      walletAddress: '0xabc',
    })) as any;
    prisma.transaction.findUnique = mock.fn(async () => null) as any;
    prisma.transaction.findMany = mock.fn(async () => [
      {
        id: 'remit-1',
        externalId: 'ext-1',
        type: 'REMITTANCE',
        status: 'FAILED',
        txHash: '0xsettlement',
        amountUsd: 25,
        refundTxHash: null,
      },
    ]) as any;

    let createCalls = 0;
    let balanceIncrements = 0;

    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          findUnique: mock.fn(async (args: any) => {
            if (args.where?.refundTxHash === '0xrefund') {
              return {
                id: 'remit-1',
                type: 'REMITTANCE',
                refundTxHash: '0xrefund',
              };
            }
            return null;
          }),
          updateMany: mock.fn(async () => ({ count: 0 })),
          create: mock.fn(async () => {
            createCalls += 1;
            return { id: 'should-not-create' };
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

    const result = await TransactionService.creditInboundDeposit({
      walletAddress: '0xabc',
      txHash: '0xrefund',
      chainId: 8453,
      blockNumber: 50n,
      logIndex: 2,
      sourceToken: 'USDC',
      amountUsd: '25',
    });

    assert.equal(result.created, false);
    assert.equal(result.transaction.id, 'remit-1');
    assert.equal(createCalls, 0);
    assert.equal(balanceIncrements, 0);
  });

  it('treats P2002 race as idempotent success', async () => {
    prisma.user.findFirst = mock.fn(async () => ({
      id: 'u1',
      walletAddress: '0xabc',
    })) as any;
    let finds = 0;
    prisma.transaction.findUnique = mock.fn(async () => {
      finds += 1;
      // Pre-txn lookups miss; after P2002 the race lookup hits
      if (finds <= 2) return null;
      return { id: 'raced', txHash: '0xhash', logIndex: 1 };
    }) as any;
    prisma.transaction.findFirst = mock.fn(async () => null) as any;
    prisma.transaction.findMany = mock.fn(async () => []) as any;
    prisma.$transaction = mock.fn(async () => {
      const err: any = new Error('Unique constraint');
      err.code = 'P2002';
      throw err;
    }) as any;

    const result = await TransactionService.creditInboundDeposit({
      walletAddress: '0xabc',
      txHash: '0xhash',
      chainId: 8453,
      blockNumber: 50n,
      logIndex: 1,
      sourceToken: 'USDC',
      amountUsd: '5',
    });

    assert.equal(result.created, false);
    assert.equal(result.transaction.id, 'raced');
  });

  it('does not credit balance on P2002 when raced row is returned', async () => {
    prisma.user.findFirst = mock.fn(async () => ({
      id: 'u1',
      walletAddress: '0xabc',
    })) as any;
    let finds = 0;
    prisma.transaction.findUnique = mock.fn(async () => {
      finds += 1;
      if (finds <= 2) return null;
      return { id: 'raced', txHash: '0xhash', logIndex: 1 };
    }) as any;
    prisma.transaction.findFirst = mock.fn(async () => null) as any;
    prisma.transaction.findMany = mock.fn(async () => []) as any;
    let balanceIncrements = 0;
    prisma.$transaction = mock.fn(async () => {
      const err: any = new Error('Unique constraint');
      err.code = 'P2002';
      throw err;
    }) as any;
    const userUpdate = mock.fn(async () => {
      balanceIncrements += 1;
    });
    (prisma as any).user.update = userUpdate;

    const result = await TransactionService.creditInboundDeposit({
      walletAddress: '0xabc',
      txHash: '0xhash',
      chainId: 8453,
      blockNumber: 50n,
      logIndex: 1,
      sourceToken: 'USDC',
      amountUsd: '5',
    });

    assert.equal(result.created, false);
    assert.equal(balanceIncrements, 0);
    assert.equal(userUpdate.mock.callCount(), 0);
  });
});
