process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.PAYCREST_API_KEY ??= 'test-paycrest-key';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { PaycrestClient } from './paycrest.client.js';
import { PayoutService } from './payout.service.js';

const originalUpdateMany = prisma.transaction.updateMany;
const originalFindFirst = prisma.transaction.findFirst;

afterEach(() => {
  prisma.transaction.updateMany = originalUpdateMany;
  prisma.transaction.findFirst = originalFindFirst;
  mock.restoreAll();
});

describe('PayoutService — happy paths', () => {
  it('createPaycrestOrder returns success and marks PROCESSING when externalId set', async () => {
    mock.method(PaycrestClient.prototype, 'createOrder', async () => ({
      id: 'ord_1',
      status: 'pending',
      providerAccount: { receiveAddress: '0xabc' },
    }));
    prisma.transaction.findFirst = mock.fn(async () => ({
      status: 'PENDING',
    })) as any;
    const updateMany = mock.fn(async () => ({ count: 1 }));
    prisma.transaction.updateMany = updateMany as any;

    const result = await PayoutService.createPaycrestOrder({
      amount: '100',
      sourceToken: 'USDC',
      destinationCurrency: 'NGN',
      recipient: {
        institution: '058',
        accountIdentifier: '0123456789',
        accountName: 'Jane Doe',
      },
      refundAddress: '0xrefund',
      externalId: 'ext-1',
    });

    assert.equal(result.success, true);
    assert.equal((result as any).order.id, 'ord_1');
    assert.equal((result as any).settlement.token, 'USDC');
    assert.equal((result as any).settlement.network, 'base');
    assert.equal(updateMany.mock.callCount(), 2);
    const claim = updateMany.mock.calls[0].arguments[0] as {
      where: { status: string };
      data: { status: string };
    };
    assert.equal(claim.where.status, 'PENDING');
    assert.equal(claim.data.status, 'PROCESSING');
    const args = updateMany.mock.calls[1].arguments[0] as {
      where: {
        externalId: string;
        status: { in: string[] };
        txHash: { startsWith: string };
      };
      data: { status: string; txHash: string };
    };
    assert.equal(args.where.externalId, 'ext-1');
    assert.deepEqual(args.where.status, { in: ['PENDING', 'PROCESSING'] });
    assert.equal(args.where.txHash.startsWith, 'pending-');
    assert.equal(args.data.status, 'PROCESSING');
    assert.equal(args.data.txHash, 'pending-ord_1');
  });

  it('createPaycrestOrder skips DB update when externalId omitted', async () => {
    mock.method(PaycrestClient.prototype, 'createOrder', async () => ({
      id: 'ord_2',
      status: 'pending',
    }));
    const updateMany = mock.fn(async () => ({ count: 0 }));
    prisma.transaction.updateMany = updateMany as any;

    const result = await PayoutService.createPaycrestOrder({
      amount: '50',
      sourceToken: 'USDC',
      destinationCurrency: 'KES',
      recipient: {
        institution: 'MPESA',
        accountIdentifier: '254700000000',
        accountName: 'John Doe',
      },
      refundAddress: '0xrefund',
    });

    assert.equal(result.success, true);
    assert.equal(updateMany.mock.callCount(), 0);
  });

  it('verifyBeneficiary wraps string account name', async () => {
    mock.method(PaycrestClient.prototype, 'verifyAccount', async () => 'Jane Doe');

    const result = await PayoutService.verifyBeneficiary('0123456789', '058', 'NG');
    assert.equal(result.success, true);
    assert.equal((result as any).data.account_name, 'Jane Doe');
  });

  it('fetchRate returns wholesale rate payload', async () => {
    mock.method(PaycrestClient.prototype, 'getRate', async () => ({
      source_currency: 'USDC',
      destination_currency: 'NGN',
      rate: 1600,
      fixed_fee: 0,
      variable_fee: 0,
    }));

    const result = await PayoutService.fetchRate('base', 'USDC', 'NGN', '100');
    assert.equal(result.success, true);
    assert.equal((result as any).rate.rate, 1600);
  });

  it('getInstitutions returns institution list', async () => {
    mock.method(PaycrestClient.prototype, 'getInstitutions', async () => [
      { id: '1', name: 'GTBank', code: '058', type: 'bank' },
    ]);

    const result = await PayoutService.getInstitutions('NG');
    assert.equal(result.success, true);
    assert.equal((result as any).data[0].code, '058');
  });
});

describe('PayoutService — unhappy paths', () => {
  it('createPaycrestOrder returns success:false with provider status', async () => {
    mock.method(PaycrestClient.prototype, 'createOrder', async () => {
      const err: any = new Error('Liquidity Provider Unavailable');
      err.status = 503;
      throw err;
    });
    prisma.transaction.findFirst = mock.fn(async () => ({
      status: 'PENDING',
    })) as any;
    prisma.transaction.updateMany = mock.fn(async () => ({ count: 1 })) as any;

    const result = await PayoutService.createPaycrestOrder({
      amount: '100',
      sourceToken: 'USDC',
      destinationCurrency: 'NGN',
      recipient: {
        institution: '058',
        accountIdentifier: '0123456789',
        accountName: 'Jane Doe',
      },
      refundAddress: '0xrefund',
      externalId: 'ext-fail',
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /Liquidity Provider Unavailable/);
    assert.equal(result.status, 503);
  });

  it('createPaycrestOrder does not call Paycrest after cancel won the reserve', async () => {
    const createOrder = mock.method(PaycrestClient.prototype, 'createOrder', async () => {
      throw new Error('should not create order');
    });
    prisma.transaction.findFirst = mock.fn(async () => ({
      status: 'FAILED',
    })) as any;

    const result = await PayoutService.createPaycrestOrder({
      amount: '100',
      sourceToken: 'USDC',
      destinationCurrency: 'NGN',
      recipient: {
        institution: '058',
        accountIdentifier: '0123456789',
        accountName: 'Jane Doe',
      },
      refundAddress: '0xrefund',
      externalId: 'ext-gone',
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 409);
    assert.equal((result as { code?: string }).code, 'RESERVE_GONE');
    assert.equal(createOrder.mock.callCount(), 0);
  });

  it('verifyBeneficiary returns failure payload on provider error', async () => {
    mock.method(PaycrestClient.prototype, 'verifyAccount', async () => {
      const err: any = new Error('Account not found');
      err.status = 404;
      throw err;
    });

    const result = await PayoutService.verifyBeneficiary('000', '058', 'NG');
    assert.equal(result.success, false);
    assert.equal(result.error, 'Account not found');
    assert.equal(result.status, 404);
  });

  it('fetchRate returns failure payload on provider error', async () => {
    mock.method(PaycrestClient.prototype, 'getRate', async () => {
      const err: any = new Error('Rate limit exceeded');
      err.status = 429;
      throw err;
    });

    const result = await PayoutService.fetchRate('base', 'USDC', 'NGN');
    assert.equal(result.success, false);
    assert.equal(result.status, 429);
  });

  it('getInstitutions returns failure payload on provider error', async () => {
    mock.method(PaycrestClient.prototype, 'getInstitutions', async () => {
      throw new Error('network down');
    });

    const result = await PayoutService.getInstitutions('NG');
    assert.equal(result.success, false);
    assert.equal(result.error, 'network down');
    assert.equal(result.status, 500);
  });
});
