import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { IdentityService } from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
});

function privyRequest(headers: Record<string, string>, body = '{}') {
  return new Request('http://localhost/api/privy/webhook', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /api/privy/webhook — happy paths', () => {
  it('verifies svix headers then syncs user', async () => {
    const event = {
      type: 'user.authenticated',
      data: { id: 'did:privy:1', linked_accounts: [] },
    };
    const verify = mock.method(IdentityService, 'verifyWebhook', async () => event);
    const sync = mock.method(IdentityService, 'syncUser', async () => ({ id: 'user-1' }));

    const res = await POST(
      privyRequest(
        {
          'svix-id': 'msg_1',
          'svix-timestamp': '123',
          'svix-signature': 'v1,sig',
        },
        JSON.stringify(event),
      ),
    );

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(verify.mock.callCount(), 1);
    assert.equal(sync.mock.callCount(), 1);
    assert.deepEqual(sync.mock.calls[0].arguments[0], event);
  });
});

describe('POST /api/privy/webhook — unhappy paths', () => {
  it('returns 401 when svix headers missing', async () => {
    const res = await POST(privyRequest({}, '{}'));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Missing signature headers/);
  });

  it('returns 401 when verification fails', async () => {
    mock.method(IdentityService, 'verifyWebhook', async () => {
      throw new Error('bad signature');
    });

    const res = await POST(
      privyRequest({
        'svix-id': 'msg_1',
        'svix-timestamp': '123',
        'svix-signature': 'v1,bad',
      }),
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Identity verification failed');
  });
});
