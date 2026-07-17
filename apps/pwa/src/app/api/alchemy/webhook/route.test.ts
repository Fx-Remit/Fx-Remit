process.env.ALCHEMY_WEBHOOK_SECRET ??= 'alchemy-test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { AlchemyService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

function signedRequest(payload: unknown, secret = process.env.ALCHEMY_WEBHOOK_SECRET!) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return new Request('http://localhost/api/alchemy/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-alchemy-signature': signature,
    },
    body,
  });
}

describe('POST /api/alchemy/webhook — happy paths', () => {
  it('verifies signature and returns synced count', async () => {
    mock.method(AlchemyService, 'handleWebhook', async () => ({
      success: true,
      synced: 2,
    }));

    const res = await POST(signedRequest({ event: { data: { block: { logs: [] } } } }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.synced, 2);
  });
});

describe('POST /api/alchemy/webhook — unhappy paths', () => {
  it('returns 401 when signature missing', async () => {
    const res = await POST(
      new Request('http://localhost/api/alchemy/webhook', {
        method: 'POST',
        body: '{}',
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 401 when signature invalid', async () => {
    const res = await POST(
      new Request('http://localhost/api/alchemy/webhook', {
        method: 'POST',
        headers: { 'x-alchemy-signature': 'nope' },
        body: '{}',
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 500 when handleWebhook throws', async () => {
    mock.method(AlchemyService, 'handleWebhook', async () => {
      throw new Error('decode failed');
    });
    const res = await POST(signedRequest({ event: {} }));
    assert.equal(res.status, 500);
  });
});
