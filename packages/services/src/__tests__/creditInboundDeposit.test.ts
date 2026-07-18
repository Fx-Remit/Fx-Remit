process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { TransactionService } from '../transaction.service.js';

const originals = {
  userFindFirst: prisma.user.findFirst,
  txFindUnique: prisma.transaction.findUnique,
  dollarTransaction: prisma.$transaction,
};

afterEach(() => {
  prisma.user.findFirst = originals.userFindFirst;
  prisma.transaction.findUnique = originals.txFindUnique;
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

  it('treats P2002 race as idempotent success', async () => {
    prisma.user.findFirst = mock.fn(async () => ({
      id: 'u1',
      walletAddress: '0xabc',
    })) as any;
    let finds = 0;
    prisma.transaction.findUnique = mock.fn(async () => {
      finds += 1;
      // First two lookups miss; after P2002 the race lookup hits
      if (finds <= 2) return null;
      return { id: 'raced', txHash: '0xhash', logIndex: 1 };
    }) as any;
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
    let balanceIncrements = 0;
    prisma.$transaction = mock.fn(async (cb: any) => {
      // Simulate losing the race: create would throw P2002 before increment.
      // Interactive txn never commits prove catch path does not increment.
      const err: any = new Error('Unique constraint');
      err.code = 'P2002';
      throw err;
    }) as any;
    const userUpdate = mock.fn(async () => {
      balanceIncrements += 1;
    });
    // Ensure no stray user.update on prisma root either
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
