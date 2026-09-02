process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { DELETE } from './route';

afterEach(() => {
  mock.restoreAll();
});

describe('DELETE /api/user/recipients/[id]', () => {
  it('returns 401 without bearer token', async () => {
    const res = await DELETE(
      new Request('http://localhost/api/user/recipients/rec-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'rec-1' }) },
    );
    assert.equal(res.status, 401);
  });

  it('returns 404 when recipient is missing or owned by another user', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    const deleteMany = mock.fn(async (args: any) => {
      assert.deepEqual(args.where, { id: 'rec-other', userId: 'user-1' });
      return { count: 0 };
    });
    prisma.savedRecipient.deleteMany = deleteMany as any;

    const res = await DELETE(
      new Request('http://localhost/api/user/recipients/rec-other', {
        method: 'DELETE',
        headers: { authorization: 'Bearer test-token' },
      }),
      { params: Promise.resolve({ id: 'rec-other' }) },
    );

    assert.equal(res.status, 404);
    assert.equal(deleteMany.mock.callCount(), 1);
  });

  it('deletes when the authenticated user owns the recipient', async () => {
    mock.method(PrivyClient.prototype, 'verifyAuthToken', async () => ({
      userId: 'did:privy:user-1',
    }));
    prisma.user.findUnique = mock.fn(async () => ({ id: 'user-1' })) as any;

    const deleteMany = mock.fn(async (args: any) => {
      assert.deepEqual(args.where, { id: 'rec-1', userId: 'user-1' });
      return { count: 1 };
    });
    prisma.savedRecipient.deleteMany = deleteMany as any;

    const res = await DELETE(
      new Request('http://localhost/api/user/recipients/rec-1', {
        method: 'DELETE',
        headers: { authorization: 'Bearer test-token' },
      }),
      { params: Promise.resolve({ id: 'rec-1' }) },
    );

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(deleteMany.mock.callCount(), 1);
  });
});
