process.env.NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID = 'test-quorum';
process.env.NEXT_PUBLIC_PRIVY_POLICY_ID = 'test-policy';
process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO = 'test-crypto-policy';
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
  payoutPolicyStatus,
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

  it('refuses to send more than the ledger reserved (sender fee added on top)', async () => {
    mock.method(TransactionService, 'findPendingRemittanceForBroadcast', async () => ({
      id: 'tx-1',
      userId: 'u1',
      orderId: 9n,
      txHash: 'pending-pc-order-9',
      amountUsd: { toString: () => '50' },
      externalId: 'ext-9',
      type: 'REMITTANCE',
    }));
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true as const,
      order: { id: 'pc-order-9', providerAccount: { receiveAddress: RECEIVE, amountToTransfer: '50.25' } },
      settlement: {
        network: PAYCREST_SETTLEMENT.network,
        chainId: PAYCREST_SETTLEMENT.chainId,
        token: PAYCREST_SETTLEMENT.token,
        tokenAddress: PAYCREST_SETTLEMENT.tokenAddress,
        decimals: PAYCREST_SETTLEMENT.decimals,
      },
    }));
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => true);

    await assert.rejects(
      () => broadcastSettlementTransfer({ privyDid: 'did:privy:x', userId: 'u1', walletAddress: WALLET, orderId: 9n }),
      (err: unknown) => err instanceof InstantSendWalletError && err.code === 'AMOUNT_MISMATCH',
    );
    assert.equal(claim.mock.callCount(), 0);
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
      get: async () => ({ additional_signers: [{ signer_id: 'test-quorum', override_policy_ids: ['test-policy', 'test-crypto-policy'] }] }),
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
      get: async () => ({ additional_signers: [{ signer_id: 'test-quorum', override_policy_ids: ['test-policy', 'test-crypto-policy'] }] }),
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
      get: async () => ({ additional_signers: [{ signer_id: 'test-quorum', override_policy_ids: ['test-policy', 'test-crypto-policy'] }] }),
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

describe('broadcastSettlementTransfer source network (#196)', () => {
  it('refuses a payout funded from Celo: the direct send only pays Base USDC', async () => {
    mock.method(TransactionService, 'findPendingRemittanceForBroadcast', async () => ({
      id: 'tx-celo',
      userId: 'u1',
      orderId: 7n,
      txHash: 'pending-pc-7',
      amountUsd: { toString: () => '5' },
      type: 'REMITTANCE',
      sourceNetwork: 'celo',
    }) as never);
    await assert.rejects(
      broadcastSettlementTransfer({ privyDid: 'did:privy:u1', userId: 'u1', walletAddress: '0x1111111111111111111111111111111111111111', orderId: 7n }),
      (err: unknown) => err instanceof InstantSendWalletError && err.code === 'FUNDING_PATH_MISMATCH',
    );
  });
});

describe('payoutPolicyStatus (#192)', () => {
  const withIds = async (fn: () => Promise<void>) => {
    const saved = [process.env.NEXT_PUBLIC_PRIVY_POLICY_ID, process.env.NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID];
    process.env.NEXT_PUBLIC_PRIVY_POLICY_ID = 'payout-policy';
    process.env.NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID = 'our-quorum';
    try {
      await fn();
    } finally {
      process.env.NEXT_PUBLIC_PRIVY_POLICY_ID = saved[0];
      process.env.NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID = saved[1];
    }
  };
  const signers = (list: unknown[]) =>
    mock.method(PrivyClient.prototype, 'wallets', () => ({ get: async () => ({ additional_signers: list }) }) as any);

  it('is ok when our signer carries the payout policy', async () => {
    await withIds(async () => {
      signers([{ signer_id: 'our-quorum', override_policy_ids: ['payout-policy'] }]);
      assert.equal(await payoutPolicyStatus('w1'), 'ok');
    });
  });

  it('is missing when our signer has only another policy, or is absent', async () => {
    await withIds(async () => {
      signers([{ signer_id: 'our-quorum', override_policy_ids: ['crypto-policy'] }]);
      assert.equal(await payoutPolicyStatus('w1'), 'missing');
      mock.restoreAll();
      signers([]);
      assert.equal(await payoutPolicyStatus('w1'), 'missing');
    });
  });

  it('is unknown when ids are not configured or Privy cannot be read', async () => {
    const savedQuorum = process.env.NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID;
    delete process.env.NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID;
    assert.equal(await payoutPolicyStatus('w1'), 'unknown');
    process.env.NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID = savedQuorum;
    await withIds(async () => {
      mock.method(PrivyClient.prototype, 'wallets', () => ({ get: async () => { throw new Error('down'); } }) as any);
      assert.equal(await payoutPolicyStatus('w1'), 'unknown');
    });
  });
});

describe('broadcastSettlementTransfer payout permission (#192)', () => {
  const row = {
    id: 'tx-p',
    userId: 'u1',
    orderId: 9n,
    txHash: 'pending-pc-9',
    amountUsd: { toString: () => '5' },
    type: 'REMITTANCE',
    sourceNetwork: null,
  };
  function stub(signers: unknown) {
    mock.method(TransactionService, 'findPendingRemittanceForBroadcast', async () => row as never);
    mock.method(PayoutService, 'getSettlementOrder', async () => ({
      success: true,
      order: { providerAccount: { receiveAddress: '0x2222222222222222222222222222222222222222', amountToTransfer: '5' } },
      settlement: { tokenAddress: PAYCREST_SETTLEMENT.tokenAddress, decimals: 6 },
    }) as never);
    mock.method(PrivyClient.prototype, 'users', () => ({
      _get: async () => ({ id: 'did:privy:u1', linked_accounts: [{ type: 'wallet', wallet_client_type: 'privy', address: '0x1111111111111111111111111111111111111111', id: 'w1', delegated: true }] }),
    }) as any);
    mock.method(PrivyClient.prototype, 'wallets', () => ({ get: typeof signers === 'function' ? signers : async () => signers }) as any);
    return mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
  }
  const send = () =>
    broadcastSettlementTransfer({ privyDid: 'did:privy:u1', userId: 'u1', walletAddress: '0x1111111111111111111111111111111111111111', orderId: 9n });

  it('asks for a permission update before claiming when the payout policy is missing', async () => {
    const claim = stub({ additional_signers: [{ signer_id: 'test-quorum', override_policy_ids: ['test-crypto-policy'] }] });
    await assert.rejects(send(), (err: unknown) => err instanceof InstantSendWalletError && err.code === 'PERMISSION_UPDATE_REQUIRED');
    assert.equal(claim.mock.callCount(), 0);
  });

  it('refuses to claim when the permission cannot be confirmed', async () => {
    const claim = stub(async () => {
      throw new Error('privy down');
    });
    await assert.rejects(send(), (err: unknown) => err instanceof InstantSendWalletError && err.code === 'PERMISSION_CHECK_FAILED');
    assert.equal(claim.mock.callCount(), 0);
  });
});
