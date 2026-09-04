process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';
process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO ??= 'test-crypto-policy';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrivyClient } from '@privy-io/node';
import { TransactionService } from '../transactions/transaction.service.js';
import { CryptoAddressService } from '../crypto-addresses/crypto-address.service.js';
import { broadcastCryptoTransfer } from './crypto-instant-send.broadcast.js';
import { InstantSendNotConfiguredError, InstantSendWalletError } from './instant-send.broadcast.js';

afterEach(() => {
  mock.restoreAll();
});

const WALLET = '0x1111111111111111111111111111111111111111';
const DEST = '0x3333333333333333333333333333333333333333';
const HASH = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

function delegatedWalletUsers(delegated: boolean) {
  return () => ({
    _get: async () => ({
      id: 'did:privy:x',
      linked_accounts: [
        {
          type: 'wallet',
          wallet_client_type: 'privy',
          address: WALLET,
          id: 'wallet-1',
          delegated,
        },
      ],
    }),
    getByWalletAddress: async () => {
      throw new Error('unused');
    },
  });
}

function pendingRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'tx-1',
    userId: 'u1',
    orderId: 9n,
    txHash: 'pending-crypto_9',
    amountUsd: { toString: () => '1' },
    sourceToken: 'USDC',
    recipientBank: 'crypto:base',
    recipientAcc: DEST,
    externalId: 'crypto_9',
    type: 'REMITTANCE',
    ...overrides,
  };
}

function trustedAddressRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'addr-1',
    network: 'base',
    address: DEST,
    label: null,
    lastUsedAt: new Date().toISOString(),
    firstConfirmedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    fastPathEligible: true,
    eligibleAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe('broadcastCryptoTransfer', () => {
  it('fails closed when server signing is not configured', async () => {
    const prev = process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO;
    process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO = '';
    await assert.rejects(
      () =>
        broadcastCryptoTransfer({ privyDid: 'did:privy:x', userId: 'u1', walletAddress: WALLET, orderId: 1n }),
      (err: unknown) => err instanceof InstantSendNotConfiguredError,
    );
    process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO = prev;
  });

  it('returns alreadyBroadcast when an on-chain hash is already present', async () => {
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => pendingRow({ txHash: HASH }));

    const result = await broadcastCryptoTransfer({
      privyDid: 'did:privy:x',
      userId: 'u1',
      walletAddress: WALLET,
      orderId: 9n,
    });
    assert.equal(result.alreadyBroadcast, true);
    assert.equal(result.txHash, HASH);
  });

  it('rejects an address that has never confirmed a send (no fast path for brand-new destinations)', async () => {
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => pendingRow());
    mock.method(CryptoAddressService, 'listForUser', async () => [
      trustedAddressRow({ firstConfirmedAt: null, fastPathEligible: false, eligibleAt: null }),
    ]);

    await assert.rejects(
      () =>
        broadcastCryptoTransfer({ privyDid: 'did:privy:x', userId: 'u1', walletAddress: WALLET, orderId: 9n }),
      (err: unknown) => err instanceof InstantSendWalletError && err.code === 'ADDRESS_NOT_TRUSTED',
    );
  });

  it('rejects an address confirmed but still inside its cooldown window', async () => {
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => pendingRow());
    mock.method(CryptoAddressService, 'listForUser', async () => [
      trustedAddressRow({
        firstConfirmedAt: new Date(Date.now() - 1000).toISOString(),
        fastPathEligible: false,
      }),
    ]);

    await assert.rejects(
      () =>
        broadcastCryptoTransfer({ privyDid: 'did:privy:x', userId: 'u1', walletAddress: WALLET, orderId: 9n }),
      (err: unknown) => err instanceof InstantSendWalletError && err.code === 'ADDRESS_NOT_TRUSTED',
    );
  });

  it('rejects when wallet is not delegated for the crypto policy', async () => {
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => pendingRow());
    mock.method(CryptoAddressService, 'listForUser', async () => [trustedAddressRow()]);
    mock.method(PrivyClient.prototype, 'users', delegatedWalletUsers(false));

    await assert.rejects(
      () =>
        broadcastCryptoTransfer({ privyDid: 'did:privy:x', userId: 'u1', walletAddress: WALLET, orderId: 9n }),
      (err: unknown) => err instanceof InstantSendWalletError && err.code === 'NOT_DELEGATED',
    );
  });

  it('rejects amount over the crypto Instant Send policy cap', async () => {
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () =>
      pendingRow({ amountUsd: { toString: () => '1001' } }),
    );
    mock.method(CryptoAddressService, 'listForUser', async () => [trustedAddressRow()]);

    await assert.rejects(
      () =>
        broadcastCryptoTransfer({ privyDid: 'did:privy:x', userId: 'u1', walletAddress: WALLET, orderId: 9n }),
      (err: unknown) => err instanceof InstantSendWalletError && err.code === 'AMOUNT_CAP',
    );
  });

  it('never builds calldata from client input — recipient always comes from the pending row', async () => {
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => pendingRow());
    mock.method(CryptoAddressService, 'listForUser', async () => [trustedAddressRow()]);
    mock.method(PrivyClient.prototype, 'users', delegatedWalletUsers(true));
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    mock.method(TransactionService, 'attachOnChainHash', async () => null);
    const markFirstConfirmed = mock.method(CryptoAddressService, 'markFirstConfirmed', async () => undefined);

    let sentTo: string | undefined;
    mock.method(PrivyClient.prototype, 'wallets', () => ({
      ethereum: () => ({
        sendTransaction: async (_walletId: string, args: any) => {
          sentTo = args.params.transaction.to;
          return { hash: HASH };
        },
      }),
    }));

    const result = await broadcastCryptoTransfer({
      privyDid: 'did:privy:x',
      userId: 'u1',
      walletAddress: WALLET,
      orderId: 9n,
    });

    assert.equal(result.txHash, HASH);
    // `to` is the USDC token contract (ERC20 transfer target), not the recipient —
    // the recipient is encoded in calldata, built only from the trusted, saved address.
    assert.notEqual(sentTo?.toLowerCase(), DEST.toLowerCase());
    assert.equal(markFirstConfirmed.mock.callCount(), 1);
    assert.deepEqual(markFirstConfirmed.mock.calls[0].arguments, ['u1', 'base', DEST.toLowerCase()]);
  });

  it('CAS claim: concurrent second call must not sendTransaction', async () => {
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => pendingRow());
    mock.method(CryptoAddressService, 'listForUser', async () => [trustedAddressRow()]);
    mock.method(PrivyClient.prototype, 'users', delegatedWalletUsers(true));
    mock.method(TransactionService, 'attachOnChainHash', async () => null);
    mock.method(CryptoAddressService, 'markFirstConfirmed', async () => undefined);

    let claimCalls = 0;
    mock.method(TransactionService, 'claimBroadcastSlot', async () => {
      claimCalls += 1;
      return claimCalls === 1;
    });

    let sendCalls = 0;
    mock.method(PrivyClient.prototype, 'wallets', () => ({
      ethereum: () => ({
        sendTransaction: async () => {
          sendCalls += 1;
          return { hash: HASH };
        },
      }),
    }));

    const opts = { privyDid: 'did:privy:x', userId: 'u1', walletAddress: WALLET, orderId: 9n };
    const [first, second] = await Promise.allSettled([
      broadcastCryptoTransfer(opts),
      broadcastCryptoTransfer(opts),
    ]);

    assert.equal(sendCalls, 1, 'Privy sendTransaction must run once');
    const ok = first.status === 'fulfilled' ? first : second;
    const lost = first.status === 'rejected' ? first : second;
    assert.equal(ok.status, 'fulfilled');
    assert.equal(lost.status, 'rejected');
    if (lost.status === 'rejected') {
      assert.ok(lost.reason instanceof InstantSendWalletError);
      assert.equal(lost.reason.code, 'BROADCAST_IN_PROGRESS');
    }
  });

  it('keeps claim on ambiguous Privy failure (no double-send window)', async () => {
    mock.method(TransactionService, 'findRemittanceForBroadcast', async () => pendingRow());
    mock.method(CryptoAddressService, 'listForUser', async () => [trustedAddressRow()]);
    mock.method(PrivyClient.prototype, 'users', delegatedWalletUsers(true));
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    let released = false;
    mock.method(TransactionService, 'releaseBroadcastClaim', async () => {
      released = true;
      return true;
    });
    mock.method(PrivyClient.prototype, 'wallets', () => ({
      ethereum: () => ({
        sendTransaction: async () => {
          throw new Error('timeout / 502');
        },
      }),
    }));

    await assert.rejects(
      () =>
        broadcastCryptoTransfer({ privyDid: 'did:privy:x', userId: 'u1', walletAddress: WALLET, orderId: 9n }),
      (err: unknown) => err instanceof InstantSendWalletError && err.code === 'BROADCAST_UNCERTAIN',
    );
    assert.equal(released, false);
  });
});
