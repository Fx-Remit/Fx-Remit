process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.CONFIRMATION_THRESHOLD ??= '5';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { RpcClient } from '../rpc.client.js';
import { TransactionService } from '../transaction.service.js';

const originals = {
  userFindMany: prisma.user.findMany,
  txFindUnique: prisma.transaction.findUnique,
  txFindFirst: prisma.transaction.findFirst,
  dollarTransaction: prisma.$transaction,
};

afterEach(() => {
  prisma.user.findMany = originals.userFindMany;
  prisma.transaction.findUnique = originals.txFindUnique;
  prisma.transaction.findFirst = originals.txFindFirst;
  prisma.$transaction = originals.dollarTransaction;
  mock.restoreAll();
});

const INDEXER = {
  orderId: 77n,
  txHash: '0xdeadbeef',
  chainId: 8453,
  blockNumber: 1000n,
  logIndex: 2,
  sender: '0xSender',
  fromToken: 'USDC',
  amountUsd: 50,
};

function mockUsers(users: Array<{ id: string; walletAddress: string | null }>) {
  prisma.user.findMany = mock.fn(async () => users) as any;
}

function mockLookups(existingByHash: any, existingByOrder: any = null) {
  prisma.transaction.findFirst = mock.fn(async (args: any) => {
    if (args.where?.txHash) return existingByHash;
    return null;
  }) as any;
  prisma.transaction.findUnique = mock.fn(async (args: any) => {
    if (args.where?.orderId_chainId) return existingByOrder;
    return null;
  }) as any;
}

function mockAtomic(capture: {
  upsertArgs?: any;
  userUpdateArgs?: any;
  result?: any;
}) {
  prisma.$transaction = mock.fn(async (cb: any) => {
    const tx = {
      transaction: {
        upsert: mock.fn(async (args: any) => {
          capture.upsertArgs = args;
          return capture.result ?? { id: 'db-tx', ...args.create, ...args.update };
        }),
      },
      user: {
        update: mock.fn(async (args: any) => {
          capture.userUpdateArgs = args;
          return { id: args.where.id };
        }),
      },
    };
    return cb(tx);
  }) as any;
}

describe('TransactionService.updateFromIndexer — happy paths', () => {
  it('creates remittance when sender matches user and confirmations met', async () => {
    mockUsers([{ id: 'user-1', walletAddress: '0xSender' }]);
    mockLookups(null, null);
    mock.method(RpcClient, 'getBlockNumber', async () => 1010n); // 10 confs >= 5

    const capture: any = { result: { id: 'new-tx', status: 'VERIFIED', type: 'REMITTANCE' } };
    mockAtomic(capture);

    const result = await TransactionService.updateFromIndexer(INDEXER);

    assert.equal(result?.id, 'new-tx');
    assert.equal(capture.upsertArgs.create.type, 'REMITTANCE');
    assert.equal(capture.upsertArgs.create.status, 'VERIFIED');
    assert.equal(capture.upsertArgs.create.userId, 'user-1');
    assert.equal(capture.upsertArgs.create.sourceToken, 'USDC');
    assert.ok(capture.userUpdateArgs);
    assert.equal(capture.userUpdateArgs.where.id, 'user-1');
    assert.equal(capture.userUpdateArgs.data.transactionCount.increment, 1);
    assert.equal(capture.userUpdateArgs.data.totalSentUsd.increment.toString(), '50');
    assert.equal(capture.userUpdateArgs.data.walletBalance.decrement.toString(), '50');
  });

  it('classifies deposit when recipient is the user and no recipientAcc yet', async () => {
    mockUsers([{ id: 'user-1', walletAddress: '0xUser' }]);
    mockLookups(null, null);
    mock.method(RpcClient, 'getBlockNumber', async () => 1010n);

    const capture: any = {};
    mockAtomic(capture);

    await TransactionService.updateFromIndexer({
      ...INDEXER,
      sender: '0xOther',
      recipient: '0xUser',
    });

    assert.equal(capture.upsertArgs.create.type, 'DEPOSIT');
    assert.equal(capture.userUpdateArgs.data.walletBalance.increment.toString(), '50');
    assert.equal(capture.userUpdateArgs.data.totalSentUsd.increment.toString(), '0');
  });

  it('updates PENDING to VERIFIED when confirmations reach threshold', async () => {
    mockUsers([{ id: 'user-1', walletAddress: '0xsender' }]); // case-insensitive match
    mockLookups({
      id: 'existing',
      status: 'PENDING',
      recipientAcc: '0123',
    });
    mock.method(RpcClient, 'getBlockNumber', async () => 1005n); // exactly 5

    const capture: any = {};
    mockAtomic(capture);

    await TransactionService.updateFromIndexer(INDEXER);

    assert.equal(capture.upsertArgs.update.status, 'VERIFIED');
    assert.equal(capture.upsertArgs.update.type, 'REMITTANCE');
    // Ledger already reserved in createPending no second debit on verify
    assert.equal(capture.userUpdateArgs, undefined);
  });

  it('prefers lookup by txHash before orderId_chainId', async () => {
    mockUsers([{ id: 'user-1', walletAddress: '0xSender' }]);
    const findFirst = mock.fn(async (args: any) => {
      if (args.where?.txHash === INDEXER.txHash) {
        return { id: 'by-hash', status: 'PENDING', recipientAcc: '1' };
      }
      return null;
    });
    const findUnique = mock.fn(async () => {
      throw new Error('should not fall through to orderId lookup');
    });
    prisma.transaction.findFirst = findFirst as any;
    prisma.transaction.findUnique = findUnique as any;
    mock.method(RpcClient, 'getBlockNumber', async () => 1010n);
    mockAtomic({});

    await TransactionService.updateFromIndexer(INDEXER);
    assert.equal(findFirst.mock.callCount(), 1);
    assert.equal(findUnique.mock.callCount(), 0);
  });
});

describe('TransactionService.updateFromIndexer — unhappy / edge paths', () => {
  it('returns null when no user matches sender or recipient', async () => {
    mockUsers([{ id: 'user-1', walletAddress: '0xSomeoneElse' }]);
    const dollarTx = mock.fn(async () => {
      throw new Error('should not open transaction');
    });
    prisma.$transaction = dollarTx as any;

    const result = await TransactionService.updateFromIndexer(INDEXER);
    assert.equal(result, null);
    assert.equal(dollarTx.mock.callCount(), 0);
  });

  it('keeps PENDING when confirmations are below threshold', async () => {
    mockUsers([{ id: 'user-1', walletAddress: '0xSender' }]);
    mockLookups({ id: 'existing', status: 'PENDING', recipientAcc: '1' });
    mock.method(RpcClient, 'getBlockNumber', async () => 1002n); // 2 < 5

    const capture: any = {};
    mockAtomic(capture);

    await TransactionService.updateFromIndexer(INDEXER);
    assert.equal(capture.upsertArgs.update.status, 'PENDING');
  });

  it('does not downgrade terminal COMPLETED status', async () => {
    mockUsers([{ id: 'user-1', walletAddress: '0xSender' }]);
    mockLookups({ id: 'existing', status: 'COMPLETED', recipientAcc: '1' });
    mock.method(RpcClient, 'getBlockNumber', async () => 1010n);

    const capture: any = {};
    mockAtomic(capture);

    await TransactionService.updateFromIndexer(INDEXER);
    assert.equal(capture.upsertArgs.update.status, 'COMPLETED');
    // Stats only bump for PENDING / new — COMPLETED should skip user update
    assert.equal(capture.userUpdateArgs, undefined);
  });

  it('classifies as remittance when existing already has recipientAcc even if incoming', async () => {
    mockUsers([{ id: 'user-1', walletAddress: '0xUser' }]);
    mockLookups({
      id: 'existing',
      status: 'PENDING',
      recipientAcc: '0123456789',
    });
    mock.method(RpcClient, 'getBlockNumber', async () => 1010n);

    const capture: any = {};
    mockAtomic(capture);

    await TransactionService.updateFromIndexer({
      ...INDEXER,
      sender: '0xOther',
      recipient: '0xUser',
    });

    assert.equal(capture.upsertArgs.update.type, 'REMITTANCE');
  });
});
