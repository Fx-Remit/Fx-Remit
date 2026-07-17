process.env.PAYCREST_SECRET_KEY ??= 'paycrest-test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { TransactionService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

function signedRequest(payload: unknown, secret = process.env.PAYCREST_SECRET_KEY!) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return new NextRequest('http://localhost/api/paycrest/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-paycrest-signature': signature,
    },
    body,
  });
}

describe('POST /api/paycrest/webhook — happy paths', () => {
  it('maps payment_order.settled to COMPLETED', async () => {
    const update = mock.method(TransactionService, 'updateFromPaycrest', async () => ({
      id: 'tx-1',
      status: 'COMPLETED',
    }));

    const res = await POST(
      signedRequest({
        event: 'payment_order.settled',
        data: { id: 'ord_1' },
      }),
    );

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });
    assert.equal(update.mock.calls[0].arguments[0], 'ord_1');
    assert.equal(update.mock.calls[0].arguments[1], 'COMPLETED');
  });

  it('maps payment_order.failed to FAILED', async () => {
    const update = mock.method(TransactionService, 'updateFromPaycrest', async () => null);
    await POST(
      signedRequest({
        event: 'payment_order.failed',
        data: { id: 'ord_2' },
      }),
    );
    assert.equal(update.mock.calls[0].arguments[1], 'FAILED');
  });

  it('maps refunding/refunded to REFUNDING', async () => {
    const update = mock.method(TransactionService, 'updateFromPaycrest', async () => null);
    await POST(
      signedRequest({
        event: 'payment_order.refunding',
        data: { id: 'ord_3' },
      }),
    );
    assert.equal(update.mock.calls[0].arguments[1], 'REFUNDING');
  });

  it('acknowledges unrecognized events without updating', async () => {
    const update = mock.method(TransactionService, 'updateFromPaycrest', async () => {
      throw new Error('should not update');
    });
    const res = await POST(
      signedRequest({
        event: 'payment_order.created',
        data: { id: 'ord_4' },
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(update.mock.callCount(), 0);
  });
});

describe('POST /api/paycrest/webhook — unhappy paths', () => {
  it('returns 401 when signature header missing', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/paycrest/webhook', {
        method: 'POST',
        body: JSON.stringify({ event: 'payment_order.settled', data: { id: 'x' } }),
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 401 when signature is invalid', async () => {
    const body = JSON.stringify({ event: 'payment_order.settled', data: { id: 'x' } });
    const res = await POST(
      new NextRequest('http://localhost/api/paycrest/webhook', {
        method: 'POST',
        headers: { 'x-paycrest-signature': 'deadbeef' },
        body,
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 500 when PAYCREST_SECRET_KEY missing', async () => {
    const prev = process.env.PAYCREST_SECRET_KEY;
    delete process.env.PAYCREST_SECRET_KEY;
    try {
      const res = await POST(signedRequest({ event: 'x', data: {} }, 'unused'));
      assert.equal(res.status, 500);
    } finally {
      process.env.PAYCREST_SECRET_KEY = prev;
    }
  });
});
