process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'cm00000000000000000000001';
process.env.PRIVY_APP_SECRET ??= 'privy_app_secret_placeholder_0000000000000000000000';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@fx-remit/database';
import { IdentityService } from '../identity.service.js';
import { AlchemyNotifyService } from '../alchemy-notify.service.js';

const originalUpsert = prisma.user.upsert;
const originalFindUnique = prisma.user.findUnique;

afterEach(() => {
  prisma.user.upsert = originalUpsert;
  prisma.user.findUnique = originalFindUnique;
  mock.restoreAll();
});

describe('IdentityService.syncUser — happy paths', () => {
  it('upserts email + wallet from linked_accounts', async () => {
    prisma.user.findUnique = mock.fn(async () => null) as any;
    mock.method(AlchemyNotifyService, 'syncWalletChange', async () => undefined);

    const upsertMock = mock.fn(async (args: any) => {
      assert.equal(args.where.privyDid, 'did:privy:abc');
      assert.equal(args.update.email, 'a@example.com');
      assert.equal(args.update.walletAddress, '0xabc');
      assert.equal(args.create.privyDid, 'did:privy:abc');
      assert.equal(args.create.email, 'a@example.com');
      assert.equal(args.create.walletAddress, '0xabc');
      assert.equal(args.create.displayName, 'Ada');
      return { id: 'user-1', privyDid: 'did:privy:abc' };
    });
    prisma.user.upsert = upsertMock as any;

    const result = await IdentityService.syncUser({
      type: 'user.authenticated',
      data: {
        id: 'did:privy:abc',
        displayName: 'Ada',
        linked_accounts: [
          { type: 'email', address: 'a@example.com' },
          { type: 'wallet', address: '0xabc' },
        ],
      },
    });

    assert.equal(result.id, 'user-1');
    assert.equal(upsertMock.mock.callCount(), 1);
  });

  it('accepts smart_wallet as wallet address', async () => {
    prisma.user.findUnique = mock.fn(async () => null) as any;
    mock.method(AlchemyNotifyService, 'syncWalletChange', async () => undefined);

    const upsertMock = mock.fn(async (args: any) => {
      assert.equal(args.update.walletAddress, '0xsmart');
      return { id: 'user-2' };
    });
    prisma.user.upsert = upsertMock as any;

    await IdentityService.syncUser({
      type: 'user.created',
      data: {
        id: 'did:privy:smart',
        linked_accounts: [{ type: 'smart_wallet', address: '0xsmart' }],
      },
    });

    assert.equal(upsertMock.mock.callCount(), 1);
  });

  it('deregisters previous wallet when address changes', async () => {
    prisma.user.findUnique = mock.fn(async () => ({
      walletAddress: '0xold',
    })) as any;

    const notify = mock.method(
      AlchemyNotifyService,
      'syncWalletChange',
      async (args: { previousAddress?: string | null; nextAddress?: string | null }) => {
        assert.equal(args.previousAddress, '0xold');
        assert.equal(args.nextAddress, '0xnew');
      },
    );

    prisma.user.upsert = mock.fn(async () => ({ id: 'user-4' })) as any;

    await IdentityService.syncUser({
      type: 'user.authenticated',
      data: {
        id: 'did:privy:rotate',
        linked_accounts: [{ type: 'wallet', address: '0xnew' }],
      },
    });

    assert.equal(notify.mock.callCount(), 1);
  });
});

describe('IdentityService.syncUser — edge paths', () => {
  it('creates with empty email/wallet when linked accounts missing', async () => {
    prisma.user.findUnique = mock.fn(async () => null) as any;
    mock.method(AlchemyNotifyService, 'syncWalletChange', async () => undefined);

    const upsertMock = mock.fn(async (args: any) => {
      assert.equal(args.create.email, '');
      assert.equal(args.create.walletAddress, '');
      assert.equal(args.create.displayName, 'New User');
      assert.equal(args.update.email, undefined);
      assert.equal(args.update.walletAddress, undefined);
      return { id: 'user-3' };
    });
    prisma.user.upsert = upsertMock as any;

    await IdentityService.syncUser({
      type: 'user.created',
      data: {
        id: 'did:privy:empty',
        linked_accounts: [],
      },
    });

    assert.equal(upsertMock.mock.callCount(), 1);
  });
});
