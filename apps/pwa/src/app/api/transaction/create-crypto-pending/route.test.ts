process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.ABANDON_TOKEN_SECRET ??= 'test-abandon-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma, Prisma } from '@fx-remit/database';
import { ExternalIdConflictError, InsufficientBalanceError, TransactionService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

/** Prisma 7 + adapter-pg error for a duplicate (order_id, chain_id). */
function orderIdCollision() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`order_id`, `chain_id`)', {
    code: 'P2002',
    clientVersion: Prisma.prismaVersion.client,
    meta: {
      modelName: 'Transaction',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['order_id', 'chain_id'] } },
      },
    },
  });
}

function request() {
  return new Request('http://localhost/api/transaction/create-crypto-pending', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify({
      amountUsd: 25,
      destinationAddress: '0x000000000000000000000000000000000000bEEF',
      network: 'base',
      token: 'USDC',
    }),
  });
}

function stubBeforeCreate() {
  mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
  prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;
}

describe('POST /api/transaction/create-crypto-pending order id', () => {
  it('retries with a new order id after an order-id collision', async () => {
    stubBeforeCreate();
    const createPending = mock.method(TransactionService, 'createPending', async () => {
      if (createPending.mock.callCount() === 0) throw orderIdCollision();
      throw new InsufficientBalanceError('user-1', '25');
    });

    const res = await POST(request());

    assert.equal(res.status, 402);
    assert.equal(createPending.mock.callCount(), 2);
    const [first, second] = createPending.mock.calls.map((c) => (c.arguments[0] as { orderId: bigint }).orderId);
    assert.notEqual(first, second);
  });

  it('does not retry an insufficient balance', async () => {
    stubBeforeCreate();
    const createPending = mock.method(TransactionService, 'createPending', async () => {
      throw new InsufficientBalanceError('user-1', '25');
    });

    const res = await POST(request());

    assert.equal(res.status, 402);
    assert.equal(createPending.mock.callCount(), 1);
  });
});

describe('POST /api/transaction/create-crypto-pending response', () => {
  it('returns 409 when the externalId belongs to a bank payout', async () => {
    stubBeforeCreate();
    mock.method(TransactionService, 'createPending', async () => {
      throw new ExternalIdConflictError('ext-1');
    });
    const res = await POST(request());
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'EXTERNAL_ID_CONFLICT');
  });

  it('never returns server-only pricing columns', async () => {
    stubBeforeCreate();
    mock.method(TransactionService, 'createPending', async () => ({
      id: 'tx-1',
      userId: 'user-1',
      orderId: 1_790_000_000_000_001n,
      blockNumber: 1_790_000_000_000_001n,
      externalId: 'ext-1',
      status: 'PENDING',
      txHash: 'pending-ext-1',
      sourceToken: 'USDC',
      amountUsd: { toString: () => '25' },
      payoutFiat: { toString: () => '25' },
      recipientBank: 'crypto:base',
      recipientAcc: '0x000000000000000000000000000000000000bEEF',
      orderBankAmount: '24.000000',
      orderSenderFee: '1.000000',
      orderRate: '1344.94',
      createdAt: new Date(),
    }));
    const res = await POST(request());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.transaction.orderId, '1790000000000001');
    assert.equal(body.transaction.amountUsd, '25');
    for (const hidden of ['orderBankAmount', 'orderSenderFee', 'orderRate', 'userId']) {
      assert.equal(hidden in body.transaction, false, hidden);
    }
  });
});

describe('POST /api/transaction/create-crypto-pending amount precision', () => {
  function requestWithAmount(amountUsd: number) {
    return new Request('http://localhost/api/transaction/create-crypto-pending', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        amountUsd,
        destinationAddress: '0x000000000000000000000000000000000000bEEF',
        network: 'base',
        token: 'USDC',
      }),
    });
  }

  it('rejects an amount with more than 6 decimals before reserving anything', async () => {
    stubBeforeCreate();
    const createPending = mock.method(TransactionService, 'createPending', async () => {
      throw new Error('should not reserve');
    });
    for (const amount of [1.1234567, 0.1 + 0.2, 1e-13]) {
      const res = await POST(requestWithAmount(amount));
      assert.equal(res.status, 422, String(amount));
    }
    const res = await POST(requestWithAmount(1.1234567));
    assert.match((await res.json()).details[0], /at most 6 decimal places/);
    assert.equal(createPending.mock.callCount(), 0);
  });

  it('accepts exactly 6 decimals', async () => {
    stubBeforeCreate();
    const createPending = mock.method(TransactionService, 'createPending', async () => {
      throw new InsufficientBalanceError('user-1', '1.123456');
    });
    for (const amount of [1.123456, 8192.000002, 9999.999999]) {
      const res = await POST(requestWithAmount(amount));
      assert.equal(res.status, 402, String(amount));
    }
    assert.equal(createPending.mock.callCount(), 3);
  });
});
