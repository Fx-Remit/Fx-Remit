process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.PAYCREST_API_KEY ??= 'test-paycrest-key';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { PayoutService } from '../paycrest/payout.service.js';
import { ReconciliationService } from './reconciliation.service.js';

const originals = {
  findMany: prisma.transaction.findMany,
  update: prisma.transaction.update,
  updateMany: prisma.transaction.updateMany,
  findUnique: prisma.transaction.findUnique,
  dollarTransaction: prisma.$transaction,
};

const ZERO = '0x0000000000000000000000000000000000000000';
const ON_CHAIN =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

afterEach(() => {
  prisma.transaction.findMany = originals.findMany;
  prisma.transaction.update = originals.update;
  prisma.transaction.updateMany = originals.updateMany;
  prisma.transaction.findUnique = originals.findUnique;
  prisma.$transaction = originals.dollarTransaction;
  delete process.env.SUSPENSE_WALLET_ADDRESS;
  mock.restoreAll();
});

function stuckTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stuck-1',
    userId: 'user-1',
    orderId: 99n,
    externalId: 'ext-99',
    sourceToken: 'USDC',
    amountUsd: { toString: () => '100' },
    recipientAcc: '0123456789',
    recipientName: 'Jane Doe',
    recipientBank: '058',
    status: 'VERIFIED',
    // Default: gateway-funded indexer remittance (#95)
    txHash: ON_CHAIN,
    user: { walletAddress: '0xUserWallet' },
    ...overrides,
  };
}

describe('ReconciliationService — happy paths', () => {
  it('returns zero counts when no stuck transactions', async () => {
    prisma.transaction.findMany = mock.fn(async () => []) as any;

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, restored: 0, failed: 0 });
  });

  it('claims gateway-funded VERIFIED → PROCESSING without createPaycrestOrder (#95)', async () => {
    prisma.transaction.findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.status, 'VERIFIED');
      assert.ok(args.where.updatedAt.lte instanceof Date);
      return [stuckTx()];
    }) as any;

    const claimOrder: string[] = [];
    const updateManyMock = mock.fn(async (args: any) => {
      claimOrder.push('claim');
      assert.equal(args.where.id, 'stuck-1');
      assert.equal(args.where.status, 'VERIFIED');
      assert.equal(args.data.status, 'PROCESSING');
      return { count: 1 };
    });
    prisma.transaction.updateMany = updateManyMock as any;

    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => {
      claimOrder.push('create');
      throw new Error('must not create second Paycrest order for on-chain remittance');
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 1, flagged: 0, restored: 0, failed: 0 });
    assert.deepEqual(claimOrder, ['claim']);
    assert.equal(createOrder.mock.callCount(), 0);
    assert.equal(updateManyMock.mock.callCount(), 1);
  });

  it('still creates Paycrest order for placeholder-hash VERIFIED recovery', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({ txHash: 'pending-ext-99' }),
    ]) as any;

    const claimOrder: string[] = [];
    prisma.transaction.updateMany = mock.fn(async (args: any) => {
      claimOrder.push(args.data.status === 'PROCESSING' ? 'claim' : 'other');
      assert.equal(args.where.status, 'VERIFIED');
      return { count: 1 };
    }) as any;

    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async (params: any) => {
      claimOrder.push('create');
      assert.equal(params.externalId, 'ext-99');
      assert.equal(params.refundAddress, '0xUserWallet');
      return { success: true, order: { id: 'ord_r1' } };
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 1, flagged: 0, restored: 0, failed: 0 });
    assert.deepEqual(claimOrder, ['claim', 'create']);
    assert.equal(createOrder.mock.callCount(), 1);
  });

  it('uses SUSPENSE_WALLET_ADDRESS when user wallet missing (placeholder recovery)', async () => {
    process.env.SUSPENSE_WALLET_ADDRESS = '0xSuspense';
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({ txHash: 'pending-ext-99', user: { walletAddress: null } }),
    ]) as any;

    prisma.transaction.updateMany = mock.fn(async () => ({ count: 1 })) as any;

    mock.method(PayoutService, 'createPaycrestOrder', async (params: any) => {
      assert.equal(params.refundAddress, '0xSuspense');
      return { success: true, order: { id: 'ord_r2' } };
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.equal(results.recovered, 1);
  });

  it('flags on-chain orphan txs missing recipient data as REFUND_REQUIRED (#96)', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({
        externalId: null,
        recipientAcc: null,
        recipientName: null,
        recipientBank: null,
      }),
    ]) as any;

    prisma.transaction.updateMany = mock.fn(async (args: any) => {
      assert.equal(args.where.id, 'stuck-1');
      assert.equal(args.where.status, 'VERIFIED');
      assert.equal(args.data.status, 'REFUND_REQUIRED');
      return { count: 1 };
    }) as any;
    prisma.transaction.findUnique = mock.fn(async () => ({
      id: 'stuck-1',
      status: 'REFUND_REQUIRED',
    })) as any;

    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => {
      throw new Error('should not create order');
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 1, restored: 0, failed: 0 });
    assert.equal(createOrder.mock.callCount(), 0);
  });

  it('restores ledger for placeholder orphan missing recipient data (#96)', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({
        externalId: null,
        recipientAcc: null,
        recipientName: null,
        recipientBank: null,
        txHash: 'pending-orphan-1',
        amountUsd: 40,
      }),
    ]) as any;

    const capture: { userUpdateArgs?: any; status?: string } = {};
    prisma.$transaction = mock.fn(async (cb: any) => {
      const client = {
        transaction: {
          updateMany: mock.fn(async (args: any) => {
            capture.status = args.data.status;
            assert.equal(args.where.status, 'VERIFIED');
            return { count: 1 };
          }),
          update: mock.fn(async () => ({
            id: 'stuck-1',
            status: 'FAILED',
            txHash: 'abandoned-stuck-1',
          })),
          findUnique: mock.fn(async () => ({
            id: 'stuck-1',
            status: 'FAILED',
          })),
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

    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => {
      throw new Error('should not create order');
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, restored: 1, failed: 0 });
    assert.equal(capture.status, 'FAILED');
    assert.equal(capture.userUpdateArgs.where.id, 'user-1');
    assert.equal(capture.userUpdateArgs.data.walletBalance.increment, 40);
    assert.equal(createOrder.mock.callCount(), 0);
  });
});

describe('ReconciliationService — unhappy paths', () => {
  it('counts failed when Paycrest recovery returns success:false', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({ txHash: 'pending-ext-99' }),
    ]) as any;
    const updates: string[] = [];
    prisma.transaction.updateMany = mock.fn(async (args: any) => {
      updates.push(args.data.status);
      return { count: 1 };
    }) as any;
    mock.method(PayoutService, 'createPaycrestOrder', async () => ({
      success: false,
      error: 'Liquidity Provider Unavailable',
      status: 503,
    }));

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, restored: 0, failed: 1 });
    // Claim then revert
    assert.deepEqual(updates, ['PROCESSING', 'VERIFIED']);
  });

  it('counts failed when refund address is missing', async () => {
    delete process.env.SUSPENSE_WALLET_ADDRESS;
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({ user: { walletAddress: null } }),
    ]) as any;

    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => ({
      success: true,
    }));

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, restored: 0, failed: 1 });
    assert.equal(createOrder.mock.callCount(), 0);
  });

  it('counts failed when refund address is zero-address', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({ user: { walletAddress: ZERO } }),
    ]) as any;

    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => ({
      success: true,
    }));

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, restored: 0, failed: 1 });
    assert.equal(createOrder.mock.callCount(), 0);
  });

  it('counts failed when createPaycrestOrder throws', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({ txHash: 'pending-ext-99' }),
    ]) as any;
    prisma.transaction.updateMany = mock.fn(async () => ({ count: 1 })) as any;
    mock.method(PayoutService, 'createPaycrestOrder', async () => {
      throw new Error('boom');
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, restored: 0, failed: 1 });
  });

  it('skips create when claim loses the VERIFIED race', async () => {
    prisma.transaction.findMany = mock.fn(async () => [stuckTx()]) as any;
    prisma.transaction.updateMany = mock.fn(async () => ({ count: 0 })) as any;
    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => {
      throw new Error('should not create');
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, restored: 0, failed: 0 });
    assert.equal(createOrder.mock.callCount(), 0);
  });
});
