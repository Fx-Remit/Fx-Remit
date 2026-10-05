import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, pad, type Hex } from 'viem';
import { settlementProofDeps, verifySettlementHash } from './settlement-proof.js';

afterEach(() => {
  mock.restoreAll();
});

const HASH = `0x${'ab'.repeat(32)}` as Hex;
const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const DEST = '0x3333333333333333333333333333333333333333';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CELO_USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function transferLog(token: string, from: string, to: string, value: bigint) {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, pad(from as Hex), pad(to as Hex)],
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
  };
}

function receipt(logs: unknown[], status: 'success' | 'reverted' = 'success') {
  return { status, logs } as any;
}

const bankRow = { recipientBank: 'OPay', recipientAcc: '0000000000', sourceToken: 'USDC', amountUsd: { toString: () => '50' } };
const cryptoRow = { recipientBank: 'crypto:celo', recipientAcc: DEST, sourceToken: 'USDC', amountUsd: { toString: () => '12.5' } };

describe('verifySettlementHash', () => {
  it('verifies a bank payout that moved the reserved USDC out of the wallet on Base', async () => {
    const getReceipt = mock.method(settlementProofDeps, 'getReceipt', async () =>
      receipt([transferLog(BASE_USDC, WALLET, OTHER, 50_000_000n)]),
    );
    assert.equal(await verifySettlementHash({ row: bankRow, walletAddress: WALLET, txHash: HASH }), 'VERIFIED');
    assert.equal(getReceipt.mock.calls[0].arguments[0], 8453);
  });

  it('verifies a crypto cash-out only to the saved address on its own network', async () => {
    const getReceipt = mock.method(settlementProofDeps, 'getReceipt', async () =>
      receipt([transferLog(CELO_USDC, WALLET, DEST, 12_500_000n)]),
    );
    assert.equal(await verifySettlementHash({ row: cryptoRow, walletAddress: WALLET, txHash: HASH }), 'VERIFIED');
    assert.equal(getReceipt.mock.calls[0].arguments[0], 42220);
  });

  it('verifies a crypto cash-out that went through the forwarder (wallet → forwarder → destination)', async () => {
    const FORWARDER = '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83';
    mock.method(settlementProofDeps, 'getReceipt', async () =>
      receipt([transferLog(CELO_USDC, WALLET, FORWARDER, 12_500_000n), transferLog(CELO_USDC, FORWARDER, DEST, 12_500_000n)]),
    );
    assert.equal(await verifySettlementHash({ row: cryptoRow, walletAddress: WALLET, txHash: HASH }), 'VERIFIED');
  });

  it('rejects two legs that do not both match the reserved amount', async () => {
    const FORWARDER = '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83';
    mock.method(settlementProofDeps, 'getReceipt', async () =>
      receipt([transferLog(CELO_USDC, WALLET, FORWARDER, 12_500_000n), transferLog(CELO_USDC, FORWARDER, DEST, 1_000_000n)]),
    );
    assert.equal(await verifySettlementHash({ row: cryptoRow, walletAddress: WALLET, txHash: HASH }), 'MISMATCH');
  });

  it('rejects a crypto transfer to a different address', async () => {
    mock.method(settlementProofDeps, 'getReceipt', async () => receipt([transferLog(CELO_USDC, WALLET, OTHER, 12_500_000n)]));
    assert.equal(await verifySettlementHash({ row: cryptoRow, walletAddress: WALLET, txHash: HASH }), 'MISMATCH');
  });

  it('rejects a transfer from someone else, a wrong amount, or a wrong token', async () => {
    for (const log of [
      transferLog(BASE_USDC, OTHER, DEST, 50_000_000n),
      transferLog(BASE_USDC, WALLET, DEST, 49_000_000n),
      transferLog('0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', WALLET, DEST, 50_000_000n),
    ]) {
      mock.method(settlementProofDeps, 'getReceipt', async () => receipt([log]));
      assert.equal(await verifySettlementHash({ row: bankRow, walletAddress: WALLET, txHash: HASH }), 'MISMATCH');
      mock.restoreAll();
    }
  });

  it('rejects a reverted transaction', async () => {
    mock.method(settlementProofDeps, 'getReceipt', async () =>
      receipt([transferLog(BASE_USDC, WALLET, OTHER, 50_000_000n)], 'reverted'),
    );
    assert.equal(await verifySettlementHash({ row: bankRow, walletAddress: WALLET, txHash: HASH }), 'MISMATCH');
  });

  it('reports PENDING when there is no receipt yet', async () => {
    mock.method(settlementProofDeps, 'getReceipt', async () => {
      const err = new Error('Transaction receipt could not be found');
      err.name = 'TransactionReceiptNotFoundError';
      throw err;
    });
    assert.equal(await verifySettlementHash({ row: bankRow, walletAddress: WALLET, txHash: HASH }), 'PENDING');
  });

  it('throws other RPC errors so the caller fails closed', async () => {
    mock.method(settlementProofDeps, 'getReceipt', async () => {
      throw new Error('fetch failed');
    });
    await assert.rejects(verifySettlementHash({ row: bankRow, walletAddress: WALLET, txHash: HASH }), /fetch failed/);
  });

  it('rejects an unknown crypto network without an RPC call', async () => {
    const getReceipt = mock.method(settlementProofDeps, 'getReceipt', async () => receipt([]));
    const row = { ...cryptoRow, recipientBank: 'crypto:solana' };
    assert.equal(await verifySettlementHash({ row, walletAddress: WALLET, txHash: HASH }), 'MISMATCH');
    assert.equal(getReceipt.mock.callCount(), 0);
  });
});
