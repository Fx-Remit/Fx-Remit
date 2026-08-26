process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, parseUnits } from 'viem';
import { PrivyClient } from '@privy-io/node';
import { TransactionService } from '../transactions/transaction.service.js';
import { PayoutService, PAYCREST_SETTLEMENT } from '../paycrest/payout.service.js';
import {
  broadcastSettlementTransfer,
  InstantSendNotConfiguredError,
  InstantSendWalletError,
} from './instant-send.broadcast.js';
import { ERC20_TRANSFER_ABI, INSTANT_SEND_MAX_USDC_RAW } from './instant-send.policy.js';

afterEach(() => {
  mock.restoreAll();
});

const RECEIVE = '0x2222222222222222222222222222222222222222';
const WALLET = '0x1111111111111111111111111111111111111111';
const HASH =
  '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

describe('broadcastSettlementTransfer', () => {
  it('fails closed when auth key missing', async () => {
    const prev = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
    delete process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
    await assert.rejects(
      () =>
        broadcastSettlementTransfer({
          privyDid: 'did:privy:x',
          userId: 'u1',
          walletAddress: WALLET,
          orderId: 1n,
        }),
      (err: unknown) => err instanceof InstantSendNotConfiguredError,
    );
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = prev;
  });

  it('returns alreadyBroadcast when on-chain hash present', async () => {
    mock.method(
      TransactionService,
      'findPendingRemittanceForBroadcast',
      async () => ({
        id: 'tx-1',
        userId: 'u1',
        orderId: 1n,
        txHash: HASH,
        amountUsd: { toString: () => '1' },
        externalId: 'ext-1',
        type: 'REMITTANCE',
      }),
    );

    const result = await broadcastSettlementTransfer({
      privyDid: 'did:privy:x',
      userId: 'u1',
      walletAddress: WALLET,
      orderId: 1n,
    });
    assert.equal(result.alreadyBroadcast, true);
    assert.equal(result.txHash, HASH);
  });

  it('rejects when wallet is not delegated (no silent drain)', async () => {
    mock.method(
      TransactionService,
      'findPendingRemittanceForBroadcast',
      async () => ({
        id: 'tx-1',
        userId: 'u1',
        orderId: 9n,
        txHash: 'pending-pc-order-9',
        amountUsd: { toString: () => '1' },
        externalId: 'ext-9',
        type: 'REMITTANCE',
      }),
    );
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true as const,
      order: {
        id: 'pc-order-9',
        providerAccount: {
          receiveAddress: RECEIVE,
          amountToTransfer: '1',
        },
      },
      settlement: {
        network: PAYCREST_SETTLEMENT.network,
        chainId: PAYCREST_SETTLEMENT.chainId,
        token: PAYCREST_SETTLEMENT.token,
        tokenAddress: PAYCREST_SETTLEMENT.tokenAddress,
        decimals: PAYCREST_SETTLEMENT.decimals,
      },
    }));

    // Expected settlement calldata (server-bound recipient + amount).
    const expectedData = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [RECEIVE as `0x${string}`, parseUnits('1', 6)],
    });
    assert.ok(expectedData.startsWith('0xa9059cbb'));
    assert.ok(parseUnits('1', 6) <= INSTANT_SEND_MAX_USDC_RAW);

    mock.method(PrivyClient.prototype, 'users', () => ({
      _get: async () => ({
        id: 'did:privy:x',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client_type: 'privy',
            address: WALLET,
            id: 'wallet-1',
            delegated: false,
          },
        ],
      }),
      getByWalletAddress: async () => {
        throw new Error('unused');
      },
    }));

    await assert.rejects(
      () =>
        broadcastSettlementTransfer({
          privyDid: 'did:privy:x',
          userId: 'u1',
          walletAddress: WALLET,
          orderId: 9n,
        }),
      (err: unknown) =>
        err instanceof InstantSendWalletError && err.code === 'NOT_DELEGATED',
    );
  });

  it('rejects amount over Instant Send policy cap', async () => {
    mock.method(
      TransactionService,
      'findPendingRemittanceForBroadcast',
      async () => ({
        id: 'tx-1',
        userId: 'u1',
        orderId: 9n,
        txHash: 'pending-pc-order-9',
        amountUsd: { toString: () => '10001' },
        externalId: 'ext-9',
        type: 'REMITTANCE',
      }),
    );
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true as const,
      order: {
        id: 'pc-order-9',
        providerAccount: {
          receiveAddress: RECEIVE,
          amountToTransfer: '10001',
        },
      },
      settlement: {
        network: PAYCREST_SETTLEMENT.network,
        chainId: PAYCREST_SETTLEMENT.chainId,
        token: PAYCREST_SETTLEMENT.token,
        tokenAddress: PAYCREST_SETTLEMENT.tokenAddress,
        decimals: PAYCREST_SETTLEMENT.decimals,
      },
    }));

    await assert.rejects(
      () =>
        broadcastSettlementTransfer({
          privyDid: 'did:privy:x',
          userId: 'u1',
          walletAddress: WALLET,
          orderId: 9n,
        }),
      (err: unknown) =>
        err instanceof InstantSendWalletError && err.code === 'AMOUNT_CAP',
    );
  });

  it('CAS claim: concurrent second call must not sendTransaction', async () => {
    mock.method(
      TransactionService,
      'findPendingRemittanceForBroadcast',
      async () => ({
        id: 'tx-1',
        userId: 'u1',
        orderId: 9n,
        txHash: 'pending-pc-order-9',
        amountUsd: { toString: () => '1' },
        externalId: 'ext-9',
        type: 'REMITTANCE',
      }),
    );
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true as const,
      order: {
        id: 'pc-order-9',
        providerAccount: {
          receiveAddress: RECEIVE,
          amountToTransfer: '1',
        },
      },
      settlement: {
        network: PAYCREST_SETTLEMENT.network,
        chainId: PAYCREST_SETTLEMENT.chainId,
        token: PAYCREST_SETTLEMENT.token,
        tokenAddress: PAYCREST_SETTLEMENT.tokenAddress,
        decimals: PAYCREST_SETTLEMENT.decimals,
      },
    }));
    mock.method(PrivyClient.prototype, 'users', () => ({
      _get: async () => ({
        id: 'did:privy:x',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client_type: 'privy',
            address: WALLET,
            id: 'wallet-1',
            delegated: true,
          },
        ],
      }),
      getByWalletAddress: async () => {
        throw new Error('unused');
      },
    }));

    let claimCalls = 0;
    mock.method(TransactionService, 'claimBroadcastSlot', async () => {
      claimCalls += 1;
      return claimCalls === 1;
    });
    mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    mock.method(TransactionService, 'attachOnChainHash', async () => null);

    let sendCalls = 0;
    mock.method(PrivyClient.prototype, 'wallets', () => ({
      ethereum: () => ({
        sendTransaction: async () => {
          sendCalls += 1;
          return { hash: HASH };
        },
      }),
    }));

    const opts = {
      privyDid: 'did:privy:x',
      userId: 'u1',
      walletAddress: WALLET,
      orderId: 9n,
    };

    const [first, second] = await Promise.allSettled([
      broadcastSettlementTransfer(opts),
      broadcastSettlementTransfer(opts),
    ]);

    assert.equal(sendCalls, 1, 'Privy sendTransaction must run once');
    assert.equal(claimCalls, 2);

    const ok = first.status === 'fulfilled' ? first : second;
    const lost = first.status === 'rejected' ? first : second;
    assert.equal(ok.status, 'fulfilled');
    if (ok.status === 'fulfilled') {
      assert.equal(ok.value.txHash, HASH);
      assert.equal(ok.value.alreadyBroadcast, false);
    }
    assert.equal(lost.status, 'rejected');
    if (lost.status === 'rejected') {
      assert.ok(lost.reason instanceof InstantSendWalletError);
      assert.equal(lost.reason.code, 'BROADCAST_IN_PROGRESS');
    }
  });

  it('keeps claim on ambiguous Privy failure (no double-send window)', async () => {
    mock.method(
      TransactionService,
      'findPendingRemittanceForBroadcast',
      async () => ({
        id: 'tx-1',
        userId: 'u1',
        orderId: 9n,
        txHash: 'pending-pc-order-9',
        amountUsd: { toString: () => '1' },
        externalId: 'ext-9',
        type: 'REMITTANCE',
      }),
    );
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true as const,
      order: {
        id: 'pc-order-9',
        providerAccount: {
          receiveAddress: RECEIVE,
          amountToTransfer: '1',
        },
      },
      settlement: {
        network: PAYCREST_SETTLEMENT.network,
        chainId: PAYCREST_SETTLEMENT.chainId,
        token: PAYCREST_SETTLEMENT.token,
        tokenAddress: PAYCREST_SETTLEMENT.tokenAddress,
        decimals: PAYCREST_SETTLEMENT.decimals,
      },
    }));
    mock.method(PrivyClient.prototype, 'users', () => ({
      _get: async () => ({
        id: 'did:privy:x',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client_type: 'privy',
            address: WALLET,
            id: 'wallet-1',
            delegated: true,
          },
        ],
      }),
      getByWalletAddress: async () => {
        throw new Error('unused');
      },
    }));
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
        broadcastSettlementTransfer({
          privyDid: 'did:privy:x',
          userId: 'u1',
          walletAddress: WALLET,
          orderId: 9n,
        }),
      (err: unknown) =>
        err instanceof InstantSendWalletError &&
        err.code === 'BROADCAST_UNCERTAIN',
    );
    assert.equal(released, false);
  });

  it('keeps claim even on Privy policy-shaped errors (no substring release)', async () => {
    mock.method(
      TransactionService,
      'findPendingRemittanceForBroadcast',
      async () => ({
        id: 'tx-1',
        userId: 'u1',
        orderId: 9n,
        txHash: 'pending-pc-order-9',
        amountUsd: { toString: () => '1' },
        externalId: 'ext-9',
        type: 'REMITTANCE',
      }),
    );
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true as const,
      order: {
        id: 'pc-order-9',
        providerAccount: {
          receiveAddress: RECEIVE,
          amountToTransfer: '1',
        },
      },
      settlement: {
        network: PAYCREST_SETTLEMENT.network,
        chainId: PAYCREST_SETTLEMENT.chainId,
        token: PAYCREST_SETTLEMENT.token,
        tokenAddress: PAYCREST_SETTLEMENT.tokenAddress,
        decimals: PAYCREST_SETTLEMENT.decimals,
      },
    }));
    mock.method(PrivyClient.prototype, 'users', () => ({
      _get: async () => ({
        id: 'did:privy:x',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client_type: 'privy',
            address: WALLET,
            id: 'wallet-1',
            delegated: true,
          },
        ],
      }),
      getByWalletAddress: async () => {
        throw new Error('unused');
      },
    }));
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    let released = false;
    mock.method(TransactionService, 'releaseBroadcastClaim', async () => {
      released = true;
      return true;
    });
    mock.method(PrivyClient.prototype, 'wallets', () => ({
      ethereum: () => ({
        sendTransaction: async () => {
          throw new Error('Transaction denied by policy');
        },
      }),
    }));

    await assert.rejects(
      () =>
        broadcastSettlementTransfer({
          privyDid: 'did:privy:x',
          userId: 'u1',
          walletAddress: WALLET,
          orderId: 9n,
        }),
      (err: unknown) =>
        err instanceof InstantSendWalletError &&
        err.code === 'BROADCAST_UNCERTAIN',
    );
    assert.equal(released, false);
  });
});
