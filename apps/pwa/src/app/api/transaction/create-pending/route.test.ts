process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.ABANDON_TOKEN_SECRET ??= 'test-abandon-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma, Prisma } from '@fx-remit/database';
import { ExternalIdConflictError, InsufficientBalanceError, PayoutService, QuoteBindService, TransactionService, forwarderDeps } from '@fx-remit/services';
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

describe('POST /api/transaction/create-pending order pricing', () => {
  // Example values only; real fee/spread live in server env.
  const BOUND = {
    payoutFiat: 66408.93,
    wholesaleRate: 1344.94,
    retailRate: 1334.85295,
    markupBps: 75,
    feeBps: 50,
    feeUsd: '0.250000',
    bankAmount: '49.376875',
    senderFee: '0.623125',
    validUntil: Date.now() + 60_000,
  };

  function row(split: { orderBankAmount: string | null; orderSenderFee: string | null; orderRate: string | null }) {
    return {
      id: 'tx-1',
      status: 'PENDING',
      externalId: 'ext-1',
      txHash: 'pending-ext-1',
      orderId: 1_790_000_000_000_001n,
      blockNumber: 1_790_000_000_000_001n,
      amountUsd: { toString: () => '50' },
      payoutFiat: { toString: () => '66408.93' },
      updatedAt: new Date(),
      ...split,
    };
  }

  function stub(existingRow?: ReturnType<typeof row>) {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1', walletAddress: '0xabc' })) as any;
    mock.method(QuoteBindService, 'resolveForCreatePending', async () => BOUND);
    const createPending = mock.method(TransactionService, 'createPending', async (data: any) =>
      existingRow ??
      row({
        orderBankAmount: data.orderPricing?.bankAmount ?? null,
        orderSenderFee: data.orderPricing?.senderFee ?? null,
        orderRate: data.orderPricing?.rate ?? null,
      }),
    );
    // Stop right after capturing the order: a 5xx leaves the reserve untouched.
    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => ({ success: false, error: 'stop', status: 503 }));
    return { createPending, createOrder };
  }

  type OrderArgs = { amount: string; senderFee?: string; rate?: string };

  it('saves the bound split on the row and prices the order from it', async () => {
    const { createPending, createOrder } = stub();
    await POST(request());
    assert.deepEqual((createPending.mock.calls[0].arguments[0] as { orderPricing: unknown }).orderPricing, {
      bankAmount: '49.376875',
      senderFee: '0.623125',
      rate: '1344.94',
      feeUsd: '0.250000',
    });
    const args = createOrder.mock.calls[0].arguments[0] as OrderArgs;
    assert.deepEqual([args.amount, args.senderFee, args.rate], ['49.376875', '0.623125', '1344.94']);
    assert.equal(Number(args.amount) + Number(args.senderFee!), 50);
  });

  it("uses the row's saved split, not this request's quote, when the row already exists", async () => {
    const { createOrder } = stub(row({ orderBankAmount: '49.370000', orderSenderFee: '0.630000', orderRate: '1345.10' }));
    await POST(request());
    const args = createOrder.mock.calls[0].arguments[0] as OrderArgs;
    assert.deepEqual([args.amount, args.senderFee, args.rate], ['49.370000', '0.630000', '1345.10']);
  });

  it('sends a zero sender fee for rows reserved before the split existed', async () => {
    const { createOrder } = stub(row({ orderBankAmount: null, orderSenderFee: null, orderRate: null }));
    await POST(request());
    const args = createOrder.mock.calls[0].arguments[0] as OrderArgs;
    assert.equal(args.amount, '50');
    assert.equal(args.senderFee, '0');
    assert.equal(args.rate, undefined);
  });

  it('lets Paycrest price at market when the saved rate is stale, keeping the exact split', async () => {
    const stale = { ...row({ orderBankAmount: '49.376875', orderSenderFee: '0.623125', orderRate: '1344.94' }), updatedAt: new Date(Date.now() - 10 * 60_000) };
    const { createOrder } = stub(stale);
    await POST(request());
    const args = createOrder.mock.calls[0].arguments[0] as OrderArgs;
    assert.deepEqual([args.amount, args.senderFee, args.rate], ['49.376875', '0.623125', undefined]);
  });

  it('rejects an amount with more than 6 decimals before reserving anything', async () => {
    const { createPending } = stub();
    const res = await POST(
      new Request('http://localhost/api/transaction/create-pending', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
        body: JSON.stringify({
          amountUsd: 10.1234567,
          quoteValidUntil: Date.now() + 60_000,
          recipientName: 'Test User',
          recipientBank: 'OPay',
          recipientAcc: '0000000000',
          token: 'USDC',
        }),
      }),
    );
    assert.equal(res.status, 422);
    assert.equal(createPending.mock.callCount(), 0);
  });
});

describe('POST /api/transaction/create-pending cash-out kind', () => {
  it('returns 409 when the externalId belongs to a crypto cash-out', async () => {
    stubBeforeCreate();
    mock.method(TransactionService, 'createPending', async () => {
      throw new ExternalIdConflictError('crypto_123');
    });
    const res = await POST(request());
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'EXTERNAL_ID_CONFLICT');
  });

  it('rejects a crypto: recipientBank before reserving anything', async () => {
    stubBeforeCreate();
    const createPending = mock.method(TransactionService, 'createPending', async () => {
      throw new Error('should not reserve');
    });
    const res = await POST(
      new Request('http://localhost/api/transaction/create-pending', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
        body: JSON.stringify({
          amountUsd: 50,
          quoteValidUntil: Date.now() + 60_000,
          recipientName: 'Test User',
          recipientBank: 'Crypto:base',
          recipientAcc: '0x000000000000000000000000000000000000bEEF',
          token: 'USDC',
          externalId: 'crypto_123',
        }),
      }),
    );
    assert.equal(res.status, 422);
    assert.equal(createPending.mock.callCount(), 0);
  });
});

describe('POST /api/transaction/create-pending source network (#196)', () => {
  const WALLET = '0x1111111111111111111111111111111111111111';
  const BOUND = {
    payoutFiat: 66408.93, wholesaleRate: 1344.94, retailRate: 1334.85295, markupBps: 75, feeBps: 50,
    feeUsd: '0.250000', bankAmount: '49.376875', senderFee: '0.623125', validUntil: Date.now() + 60_000,
  };

  function withEnv(env: Record<string, string | undefined>) {
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return () => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    };
  }

  const CELO_ON = {
    PAYOUT_FORWARDER_ENABLED: 'true',
    PAYOUT_FORWARDER_ADDRESS: '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83',
    RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    PRIVY_AUTHORIZATION_PRIVATE_KEY: 'test-auth-key',
    BASE_RPC_URL: 'http://127.0.0.1:8545',
    CELO_RPC_URL: 'http://127.0.0.1:8546',
    PAYOUT_FORWARDER_CHAINS: '8453,42220',
  };

  function stub(opts: { onChainRaw: bigint; reserved?: string; sourceOnRow?: string }) {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1', walletAddress: WALLET })) as any;
    const chains: number[] = [];
    mock.method(forwarderDeps, 'publicClient', (chainId: number = 8453) => {
      chains.push(chainId);
      return { readContract: async () => opts.onChainRaw } as any;
    });
    mock.method(TransactionService, 'reservedOnNetwork', async () => new Prisma.Decimal(opts.reserved ?? '0'));
    mock.method(QuoteBindService, 'resolveForCreatePending', async () => BOUND);
    const createPending = mock.method(TransactionService, 'createPending', async (data: any) => ({
      id: 'tx-1', status: 'PENDING', externalId: 'ext-1', txHash: 'pending-ext-1',
      orderId: 1_790_000_000_000_001n, blockNumber: 1_790_000_000_000_001n,
      amountUsd: { toString: () => '50' }, payoutFiat: { toString: () => '66408.93' }, updatedAt: new Date(),
      orderBankAmount: '49.376875', orderSenderFee: '0.623125', orderRate: '1344.94',
      sourceNetwork: opts.sourceOnRow ?? data.sourceNetwork,
    }));
    const createOrder = mock.method(PayoutService, 'createPaycrestOrder', async () => ({ success: false, error: 'stop', status: 503 }));
    return { createPending, createOrder, chains };
  }

  function requestFrom(sourceNetwork?: string) {
    return new Request('http://localhost/api/transaction/create-pending', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        amountUsd: 50, quoteValidUntil: Date.now() + 60_000, destinationCurrency: 'NGN',
        recipientName: 'Test User', recipientBank: 'OPay', recipientAcc: '0000000000', token: 'USDC', bankCode: 'OPAYNGPC',
        ...(sourceNetwork ? { sourceNetwork } : {}),
      }),
    });
  }

  it('refuses Celo while the forwarder is not switched on for it', async () => {
    const restore = withEnv({ PAYOUT_FORWARDER_ENABLED: 'false' });
    try {
      const { createPending } = stub({ onChainRaw: 100_000_000n });
      const res = await POST(requestFrom('celo'));
      assert.equal(res.status, 503);
      assert.equal((await res.json()).code, 'NETWORK_UNAVAILABLE');
      assert.equal(createPending.mock.callCount(), 0);
    } finally {
      restore();
    }
  });

  it("refuses an amount above the network's balance minus what's reserved there, before reserving", async () => {
    const { createPending, chains } = stub({ onChainRaw: 60_000_000n, reserved: '20' });
    const res = await POST(requestFrom('base'));
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.code, 'INSUFFICIENT_NETWORK_BALANCE');
    assert.equal(body.availableUsd, '40.000000');
    assert.match(body.error, /up to \$40\.00/);
    assert.deepEqual(chains, [8453]);
    assert.equal(createPending.mock.callCount(), 0);
  });

  it('defaults to Base, saves the source on the row and creates the order there', async () => {
    const { createPending, createOrder } = stub({ onChainRaw: 100_000_000n });
    await POST(requestFrom());
    assert.equal((createPending.mock.calls[0].arguments[0] as any).sourceNetwork, 'base');
    assert.equal((createOrder.mock.calls[0].arguments[0] as any).network, 'base');
  });

  it('pays from Celo when chosen and switched on: checks Celo, saves it, orders on Celo', async () => {
    const restore = withEnv(CELO_ON);
    try {
      const { createPending, createOrder, chains } = stub({ onChainRaw: 100_000_000n });
      await POST(requestFrom('celo'));
      assert.deepEqual(chains, [42220]);
      assert.equal((createPending.mock.calls[0].arguments[0] as any).sourceNetwork, 'celo');
      assert.equal((createOrder.mock.calls[0].arguments[0] as any).network, 'celo');
    } finally {
      restore();
    }
  });

  it("creates the order on the row's network on resume, not this request's", async () => {
    const { createOrder } = stub({ onChainRaw: 100_000_000n, sourceOnRow: 'celo' });
    await POST(requestFrom('base'));
    assert.equal((createOrder.mock.calls[0].arguments[0] as any).network, 'celo');
  });
});
