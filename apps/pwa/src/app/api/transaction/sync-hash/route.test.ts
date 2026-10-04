process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { TransactionService, settlementProofDeps } from '@fx-remit/services';
import { encodeAbiParameters, pad, type Hex } from 'viem';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

const HASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const WALLET = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function transferLog(from: string, value: bigint) {
  return {
    address: BASE_USDC,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      pad(from as Hex),
      pad('0x2222222222222222222222222222222222222222'),
    ],
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
  };
}

function authRequest(body: unknown) {
  return new Request('http://localhost/api/transaction/sync-hash', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/transaction/sync-hash', () => {
  it('attaches hash for the authenticated owner', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1', walletAddress: WALLET })) as any;
    // Server broadcast already attached this hash: no proof needed.
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => ({ id: 'tx-1', txHash: HASH }));

    const attach = mock.method(
      TransactionService,
      'attachOnChainHash',
      async (params: { userId: string; orderId: bigint; txHash: string }) => {
        assert.equal(params.userId, 'user-1');
        assert.equal(params.orderId, 99n);
        assert.equal(params.txHash, HASH);
        return {
          id: 'tx-1',
          userId: 'user-1',
          orderId: 99n,
          txHash: HASH,
          chainId: 0,
          blockNumber: 0n,
          logIndex: 0,
          sourceToken: 'USDC',
          amountUsd: 10,
          payoutFiat: 10,
          status: 'PROCESSING',
          type: 'REMITTANCE',
          externalId: 'idem-1',
          recipientName: null,
          recipientBank: null,
          recipientAcc: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    );

    mock.method(TransactionService, 'serialize', (tx: { id: string }) => ({
      id: tx.id,
      txHash: HASH,
    }));

    mock.method(
      TransactionService,
      'syncPaycrestStatusForRemittance',
      async () => ({
        id: 'tx-1',
        userId: 'user-1',
        orderId: 99n,
        txHash: HASH,
        chainId: 8453,
        blockNumber: 0n,
        logIndex: 0,
        sourceToken: 'USDC',
        amountUsd: 10,
        payoutFiat: 10,
        status: 'COMPLETED',
        type: 'REMITTANCE',
        externalId: 'idem-1',
        recipientName: null,
        recipientBank: null,
        recipientAcc: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(attach.mock.callCount(), 1);
  });

  it('returns 404 when attachOnChainHash finds no owned row', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:attacker',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'attacker', walletAddress: WALLET })) as any;
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => null);
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => null);

    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 404);
    assert.equal(attach.mock.callCount(), 0);
  });

  it('returns 401 without Bearer token', async () => {
    const res = await POST(
      new Request('http://localhost/api/transaction/sync-hash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: '99', txHash: HASH }),
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 422 for invalid txHash', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));

    const res = await POST(authRequest({ orderId: '99', txHash: 'not-a-hash' }));
    assert.equal(res.status, 422);
  });
});

describe('POST /api/transaction/sync-hash on a placeholder row (#102)', () => {
  const placeholder = {
    id: 'tx-1',
    txHash: 'pending-ext-1',
    recipientBank: 'OPay',
    recipientAcc: '0000000000',
    sourceToken: 'USDC',
    amountUsd: { toString: () => '50' },
  };

  function stub(receipt: () => Promise<unknown>, opts: { reused?: boolean } = {}) {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({ userId: 'did:privy:user-1' }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1', walletAddress: WALLET })) as any;
    prisma.transaction.findFirst = mock.fn(async () => (opts.reused ? { id: 'tx-other' } : null)) as any;
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => placeholder);
    mock.method(settlementProofDeps, 'getReceipt', receipt as any);
    mock.method(TransactionService, 'syncPaycrestStatusForRemittance', async () => null);
    mock.method(TransactionService, 'serialize', (tx: { id: string }) => ({ id: tx.id }));
    return mock.method(TransactionService, 'attachOnChainHash', async () => ({ id: 'tx-1' }));
  }

  it('attaches a hash the receipt proves', async () => {
    const attach = stub(async () => ({ status: 'success', logs: [transferLog(WALLET, 50_000_000n)] }));
    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 200);
    assert.equal(attach.mock.callCount(), 1);
  });

  it('rejects a hash that does not fund the payout', async () => {
    const attach = stub(async () => ({ status: 'success', logs: [transferLog(WALLET, 1_000_000n)] }));
    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 422);
    assert.equal(attach.mock.callCount(), 0);
  });

  it('asks to retry when the transaction is not mined yet', async () => {
    const attach = stub(async () => {
      const err = new Error('not found');
      err.name = 'TransactionReceiptNotFoundError';
      throw err;
    });
    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 409);
    assert.equal(attach.mock.callCount(), 0);
  });

  it('fails closed when the RPC errors', async () => {
    const attach = stub(async () => {
      throw new Error('fetch failed');
    });
    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 503);
    assert.equal(attach.mock.callCount(), 0);
  });

  it('rejects a hash already used by another transaction', async () => {
    const attach = stub(async () => ({ status: 'success', logs: [transferLog(WALLET, 50_000_000n)] }), { reused: true });
    const res = await POST(authRequest({ orderId: '99', txHash: HASH }));
    assert.equal(res.status, 409);
    assert.equal(attach.mock.callCount(), 0);
  });
});
