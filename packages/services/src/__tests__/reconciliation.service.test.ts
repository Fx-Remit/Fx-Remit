process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.PAYCREST_API_KEY ??= 'test-paycrest-key';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { PayoutService } from '../payout.service.js';
import { ReconciliationService } from '../reconciliation.service.js';

const originals = {
  findMany: prisma.transaction.findMany,
  update: prisma.transaction.update,
};

const ZERO = '0x0000000000000000000000000000000000000000';

afterEach(() => {
  prisma.transaction.findMany = originals.findMany;
  prisma.transaction.update = originals.update;
  delete process.env.SUSPENSE_WALLET_ADDRESS;
  mock.restoreAll();
});

function stuckTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stuck-1',
    orderId: 99n,
    externalId: 'ext-99',
    sourceToken: 'USDC',
    amountUsd: { toString: () => '100' },
    recipientAcc: '0123456789',
    recipientName: 'Jane Doe',
    recipientBank: '058',
    status: 'VERIFIED',
    user: { walletAddress: '0xUserWallet' },
    ...overrides,
  };
}

describe('ReconciliationService — happy paths', () => {
  it('returns zero counts when no stuck transactions', async () => {
    prisma.transaction.findMany = mock.fn(async () => []) as any;

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, failed: 0 });
  });

  it('recovers when recipient data and refund wallet exist', async () => {
    prisma.transaction.findMany = mock.fn(async (args: any) => {
      assert.equal(args.where.status, 'VERIFIED');
      assert.ok(args.where.updatedAt.lte instanceof Date);
      return [stuckTx()];
    }) as any;

    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async (params: any) => {
      assert.equal(params.externalId, 'ext-99');
      assert.equal(params.refundAddress, '0xUserWallet');
      assert.equal(params.destinationCurrency, 'NGN');
      assert.equal(params.recipient.accountIdentifier, '0123456789');
      return { success: true, order: { id: 'ord_r1' } };
    });

    const updateMock = mock.fn(async (args: any) => {
      assert.equal(args.where.id, 'stuck-1');
      assert.equal(args.data.status, 'PROCESSING');
      return { id: 'stuck-1', status: 'PROCESSING' };
    });
    prisma.transaction.update = updateMock as any;

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 1, flagged: 0, failed: 0 });
    assert.equal(createOrder.mock.callCount(), 1);
    assert.equal(updateMock.mock.callCount(), 1);
  });

  it('uses SUSPENSE_WALLET_ADDRESS when user wallet missing', async () => {
    process.env.SUSPENSE_WALLET_ADDRESS = '0xSuspense';
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({ user: { walletAddress: null } }),
    ]) as any;

    mock.method(PayoutService, 'createPaycrestOrder', async (params: any) => {
      assert.equal(params.refundAddress, '0xSuspense');
      return { success: true, order: { id: 'ord_r2' } };
    });
    prisma.transaction.update = mock.fn(async () => ({
      id: 'stuck-1',
      status: 'PROCESSING',
    })) as any;

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.equal(results.recovered, 1);
  });

  it('flags orphan txs missing recipient data as REFUND_REQUIRED', async () => {
    prisma.transaction.findMany = mock.fn(async () => [
      stuckTx({
        externalId: null,
        recipientAcc: null,
        recipientName: null,
        recipientBank: null,
      }),
    ]) as any;

    const updateMock = mock.fn(async (args: any) => {
      assert.equal(args.where.id, 'stuck-1');
      assert.equal(args.data.status, 'REFUND_REQUIRED');
      return { id: 'stuck-1', status: 'REFUND_REQUIRED' };
    });
    prisma.transaction.update = updateMock as any;

    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => {
      throw new Error('should not create order');
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 1, failed: 0 });
    assert.equal(updateMock.mock.callCount(), 1);
    assert.equal(createOrder.mock.callCount(), 0);
  });
});

describe('ReconciliationService — unhappy paths', () => {
  it('counts failed when Paycrest recovery returns success:false', async () => {
    prisma.transaction.findMany = mock.fn(async () => [stuckTx()]) as any;
    mock.method(PayoutService, 'createPaycrestOrder', async () => ({
      success: false,
      error: 'Liquidity Provider Unavailable',
      status: 503,
    }));

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, failed: 1 });
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
    assert.deepEqual(results, { recovered: 0, flagged: 0, failed: 1 });
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
    assert.deepEqual(results, { recovered: 0, flagged: 0, failed: 1 });
    assert.equal(createOrder.mock.callCount(), 0);
  });

  it('counts failed when createPaycrestOrder throws', async () => {
    prisma.transaction.findMany = mock.fn(async () => [stuckTx()]) as any;
    mock.method(PayoutService, 'createPaycrestOrder', async () => {
      throw new Error('boom');
    });

    const results = await ReconciliationService.reconcileStuckTransactions();
    assert.deepEqual(results, { recovered: 0, flagged: 0, failed: 1 });
  });
});
