process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.ABANDON_TOKEN_SECRET ??= 'test-abandon-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma, Prisma } from '@fx-remit/database';
import { InsufficientBalanceError, QuoteBindService, TransactionService } from '@fx-remit/services';
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
  return new Request('http://localhost/api/transaction/create-pending', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify({
      amountUsd: 50,
      quoteValidUntil: Date.now() + 60_000,
      destinationCurrency: 'NGN',
      recipientName: 'Test User',
      recipientBank: 'OPay',
      recipientAcc: '0000000000',
      token: 'USDC',
      bankCode: 'OPAYNGPC',
    }),
  });
}

function stubBeforeCreate() {
  mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
  prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1', walletAddress: '0xabc' })) as any;
  mock.method(QuoteBindService, 'resolveForCreatePending', async () => ({
    payoutFiat: 66_000,
    wholesaleRate: 1340,
    retailRate: 1320,
    markupBps: 75,
    validUntil: Date.now() + 60_000,
  }));
}

describe('POST /api/transaction/create-pending order id', () => {
  it('retries with a new order id after an order-id collision', async () => {
    stubBeforeCreate();
    const createPending = mock.method(TransactionService, 'createPending', async () => {
      // First attempt collides; the second stops at the balance check so no Paycrest call follows.
      if (createPending.mock.callCount() === 0) throw orderIdCollision();
      throw new InsufficientBalanceError('user-1', '50');
    });

    const res = await POST(request());

    assert.equal(res.status, 402);
    assert.equal(createPending.mock.callCount(), 2);
    const [first, second] = createPending.mock.calls.map((c) => (c.arguments[0] as { orderId: bigint }).orderId);
    assert.notEqual(first, second);
    assert.ok(second <= BigInt(Number.MAX_SAFE_INTEGER));
  });

  it('does not retry an insufficient balance', async () => {
    stubBeforeCreate();
    const createPending = mock.method(TransactionService, 'createPending', async () => {
      throw new InsufficientBalanceError('user-1', '50');
    });

    const res = await POST(request());

    assert.equal(res.status, 402);
    assert.equal(createPending.mock.callCount(), 1);
  });
});
