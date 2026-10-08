process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';
process.env.PAYOUT_FORWARDER_ADDRESS = '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83';
process.env.PAYOUT_FORWARDER_V2_ADDRESS = '0x6575f142Ab3a557DF60F5a9B4d5cf0BD5f3732D5';
process.env.RELAYER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
process.env.BASE_RPC_URL ??= 'http://127.0.0.1:8545';
process.env.PAYOUT_FORWARDER_CHAINS = '8453';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { maxUint256 } from 'viem';
import { prisma } from '@fx-remit/database';
import { forwarderDeps, TransactionService } from '@fx-remit/services';
import { POST } from './route';

const drips = { findUnique: prisma.relayerDrip.findUnique, count: prisma.relayerDrip.count };
afterEach(() => {
  mock.restoreAll();
  Object.assign(prisma.relayerDrip, drips);
});

const WALLET = '0x1111111111111111111111111111111111111111';
const DEST = '0x3333333333333333333333333333333333333333';

function request(body: unknown, auth = true) {
  return new Request('http://localhost/api/transaction/forwarder-approval', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer t' } : {}) },
    body: JSON.stringify(body),
  });
}

/** A reserved Base USDT cash-out owned by user-1, and a chain with the given allowance and fees. */
function stub(opts: { row?: Record<string, unknown> | null; user?: unknown; allowance?: bigint; maxFee?: bigint } = {}) {
  mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
  prisma.user.findUnique = mock.fn(async () => (opts.user === undefined ? { id: 'user-1', walletAddress: WALLET } : opts.user)) as any;
  const find = mock.method(TransactionService, 'findRemittanceForBroadcast', async () =>
    opts.row === null
      ? null
      : {
          type: 'REMITTANCE',
          userId: 'user-1',
          status: 'PENDING',
          txHash: 'pending-crypto_1',
          sourceToken: 'USDT',
          recipientBank: 'crypto:base',
          recipientAcc: DEST,
          amountUsd: { toString: () => '5' },
          ...opts.row,
        },
  );
  mock.method(forwarderDeps, 'publicClient', () => ({
    readContract: async (a: { functionName: string }) => (a.functionName === 'allowance' ? (opts.allowance ?? maxUint256) : '2'),
    getBalance: async () => 0n,
    getGasPrice: async () => 5_000_000n,
    estimateFeesPerGas: async () => ({ maxFeePerGas: opts.maxFee ?? 10_000_000n }),
    estimateGas: async () => 46_000n,
  }) as any);
  prisma.relayerDrip.findUnique = mock.fn(async () => null) as any;
  prisma.relayerDrip.count = mock.fn(async () => 0) as any;
  return find;
}

describe('POST /api/transaction/forwarder-approval (#191)', () => {
  it('returns 401 without a bearer token', async () => {
    assert.equal((await POST(request({ orderId: '1' }, false))).status, 401);
  });

  it('returns 404 when the caller has no user row', async () => {
    stub({ user: null });
    assert.equal((await POST(request({ orderId: '1' }))).status, 404);
  });

  it("only looks up the caller's own order, and 404s when it isn't theirs", async () => {
    const find = stub({ row: null });
    const res = await POST(request({ orderId: '42' }));
    assert.equal(res.status, 404);
    assert.deepEqual(find.mock.calls[0].arguments[0], { userId: 'user-1', orderId: 42n });
  });

  it('answers approved once the wallet already allows the forwarder', async () => {
    stub();
    const res = await POST(request({ orderId: '42' }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'approved' });
  });

  it('maps a fee spike to 503, so the client retries later instead of giving up', async () => {
    stub({ allowance: 0n, maxFee: 1_000_000_000_000n });
    const res = await POST(request({ orderId: '42' }));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'GAS_TOO_HIGH');
  });
});
