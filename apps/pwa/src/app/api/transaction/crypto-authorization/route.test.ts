process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';
process.env.PAYOUT_FORWARDER_ADDRESS = '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83';
process.env.RELAYER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
process.env.BASE_RPC_URL ??= 'http://127.0.0.1:8545';
process.env.PAYOUT_FORWARDER_CHAINS = '8453';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { domainSeparator, type Address } from 'viem';
import { prisma } from '@fx-remit/database';
import { forwarderDeps, TransactionService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

const WALLET = '0x1111111111111111111111111111111111111111';
const DEST = '0x3333333333333333333333333333333333333333';

function request(body: unknown, auth = true) {
  return new Request('http://localhost/api/transaction/crypto-authorization', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer t' } : {}) },
    body: JSON.stringify(body),
  });
}

function stub(row: Record<string, unknown> | null) {
  mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
  prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1', walletAddress: WALLET })) as any;
  const find = mock.method(TransactionService, 'findRemittanceForBroadcast', async () =>
    row ? { type: 'REMITTANCE', userId: 'user-1', sourceToken: 'USDC', amountUsd: { toString: () => '5' }, ...row } : null,
  );
  mock.method(forwarderDeps, 'publicClient', () => ({
    readContract: async (a: { functionName: string; address: Address }) =>
      a.functionName === 'name'
        ? 'USD Coin'
        : a.functionName === 'DOMAIN_SEPARATOR'
          ? domainSeparator({ domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: a.address } })
          : '2',
  }) as any);
  return find;
}

describe('POST /api/transaction/crypto-authorization', () => {
  it('returns 401 without a bearer token', async () => {
    assert.equal((await POST(request({ orderId: '1' }, false))).status, 401);
  });

  it("returns the typed data for the caller's own pending row", async () => {
    const find = stub({ txHash: 'pending-crypto_1', recipientBank: 'crypto:base', recipientAcc: DEST });
    const res = await POST(request({ orderId: '42' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.typedData.primaryType, 'ReceiveWithAuthorization');
    assert.equal(body.typedData.domain.chainId, 8453);
    assert.equal(body.typedData.message.from.toLowerCase(), WALLET);
    assert.match(body.validBefore, /^\d+$/);
    // Looked up by the authenticated user, never by a client-supplied user id.
    assert.deepEqual((find.mock.calls[0].arguments as any[])[0], { userId: 'user-1', orderId: 42n });
  });

  it('returns 404 when the order is not the caller’s', async () => {
    stub(null);
    assert.equal((await POST(request({ orderId: '42' }))).status, 404);
  });

  it('refuses a row that is no longer pending', async () => {
    stub({ txHash: 'broadcasting-crypto_1', recipientBank: 'crypto:base', recipientAcc: DEST });
    const res = await POST(request({ orderId: '42' }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'NOT_PENDING');
  });

  it('returns 503 on a chain the forwarder is not switched on for', async () => {
    stub({ txHash: 'pending-crypto_1', recipientBank: 'crypto:celo', recipientAcc: DEST });
    const res = await POST(request({ orderId: '42' }));
    assert.equal(res.status, 503);
  });
});
