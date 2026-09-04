process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { PATCH } from './route';

afterEach(() => {
  mock.restoreAll();
});

function patchRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/user/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/user/profile', () => {
  it('returns 401 without bearer token', async () => {
    const res = await PATCH(patchRequest({ displayName: 'Ada' }));
    assert.equal(res.status, 401);
  });

  it('returns 404 when user row is missing', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:missing',
    }));
    prisma.user.findUnique = mock.fn(async () => null) as any;

    const res = await PATCH(
      patchRequest({ displayName: 'Ada' }, { authorization: 'Bearer test-token' }),
    );
    assert.equal(res.status, 404);
  });

  it('rejects an empty displayName', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    const res = await PATCH(
      patchRequest({ displayName: '' }, { authorization: 'Bearer test-token' }),
    );
    assert.equal(res.status, 400);
  });

  it('rejects a displayName over 60 characters', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    const res = await PATCH(
      patchRequest({ displayName: 'a'.repeat(61) }, { authorization: 'Bearer test-token' }),
    );
    assert.equal(res.status, 400);
  });

  it('returns 400 when the body has nothing to update', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    const res = await PATCH(patchRequest({}, { authorization: 'Bearer test-token' }));
    assert.equal(res.status, 400);
  });

  it('updates displayName scoped to the token-verified user id', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async (args: any) => {
      assert.equal(args.where.privyDid, 'did:privy:user-1');
      return { id: 'user-1' };
    }) as any;

    const update = mock.fn(async (args: any) => {
      assert.equal(args.where.id, 'user-1');
      assert.equal(args.data.displayName, 'Ada Lovelace');
      return { displayName: 'Ada Lovelace', avatarUrl: 'https://example.com/a.svg' };
    });
    prisma.user.update = update as any;

    const res = await PATCH(
      patchRequest(
        { displayName: 'Ada Lovelace' },
        { authorization: 'Bearer test-token' },
      ),
    );
    const json = await res.json();
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.equal(json.success, true);
    assert.equal(json.displayName, 'Ada Lovelace');
    assert.equal(update.mock.callCount(), 1);
  });
});
