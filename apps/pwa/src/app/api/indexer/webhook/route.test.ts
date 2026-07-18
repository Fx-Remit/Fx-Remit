process.env.GOLDSKY_WEBHOOK_SECRET ??= 'goldsky-test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { TransactionService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

function signedRequest(payload: unknown, secret = process.env.GOLDSKY_WEBHOOK_SECRET!) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return new NextRequest('http://localhost/api/indexer/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goldsky-signature': signature,
    },
    body,
  });
}

const INDEX_DATA = {
  order_id: '42',
  tx_hash: '0xabc',
  chain_id: '8453',
  block_number: '1000',
  log_index: '1',
  sender: '0xSender',
  recipient: '0xRecipient',
  fromToken: 'USDC',
  amountUsd: '25',
};

describe('POST /api/indexer/webhook — happy paths', () => {
  it('forwards INSERT payloads to updateFromIndexer', async () => {
    const update = mock.method(TransactionService, 'updateFromIndexer', async (args: any) => {
      assert.equal(args.orderId, 42n);
      assert.equal(args.txHash, '0xabc');
      assert.equal(args.chainId, 8453);
      assert.equal(args.blockNumber, 1000n);
      assert.equal(args.logIndex, 1);
      assert.equal(args.sender, '0xSender');
      assert.equal(args.amountUsd, 25);
      return { id: 'tx-1' };
    });

    const res = await POST(signedRequest({ op: 'INSERT', data: INDEX_DATA }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'success' });
    assert.equal(update.mock.callCount(), 1);
  });

  it('forwards UPDATE payloads to updateFromIndexer', async () => {
    const update = mock.method(TransactionService, 'updateFromIndexer', async () => null);
    const res = await POST(signedRequest({ op: 'UPDATE', data: INDEX_DATA }));
    assert.equal(res.status, 200);
    assert.equal(update.mock.callCount(), 1);
  });

  it('ignores non INSERT/UPDATE ops', async () => {
    const update = mock.method(TransactionService, 'updateFromIndexer', async () => {
      throw new Error('should not update');
    });
    const res = await POST(signedRequest({ op: 'DELETE', data: INDEX_DATA }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ignored' });
    assert.equal(update.mock.callCount(), 0);
  });
});

describe('POST /api/indexer/webhook — unhappy paths', () => {
  it('returns 401 when signature missing', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/indexer/webhook', {
        method: 'POST',
        body: JSON.stringify({ op: 'INSERT', data: INDEX_DATA }),
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 401 when signature invalid', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/indexer/webhook', {
        method: 'POST',
        headers: { 'x-goldsky-signature': 'bad' },
        body: JSON.stringify({ op: 'INSERT', data: INDEX_DATA }),
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 500 when updateFromIndexer throws', async () => {
    mock.method(TransactionService, 'updateFromIndexer', async () => {
      throw new Error('db down');
    });
    const res = await POST(signedRequest({ op: 'INSERT', data: INDEX_DATA }));
    assert.equal(res.status, 500);
  });

  it('accepts static Authorization Bearer secret (Goldsky httpauth)', async () => {
    mock.method(TransactionService, 'updateFromIndexer', async () => ({ id: 'tx-1' }));
    const body = JSON.stringify({ op: 'INSERT', data: INDEX_DATA });
    const res = await POST(
      new NextRequest('http://localhost/api/indexer/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.GOLDSKY_WEBHOOK_SECRET}`,
        },
        body,
      }),
    );
    assert.equal(res.status, 200);
  });
});
