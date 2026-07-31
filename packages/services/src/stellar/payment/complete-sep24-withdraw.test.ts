process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@stellar/stellar-sdk';
import { prisma } from '@fx-remit/database';
import { Sep24Client } from '../sep24/sep24.client.js';
import { completeSep24WithdrawPayment } from './complete-sep24-withdraw.js';
import type { AnchorConfig } from '../types/types.js';

const ANCHOR: AnchorConfig = {
  id: 'testanchor',
  name: 'Test',
  homeDomain: 'testanchor.example',
  corridors: ['NGN'],
  usdcAssetCode: 'USDC',
  usdcIssuer: 'GISSUER',
  priority: 0,
  methods: ['bank'],
};

const prismaOriginals = {
  txFindFirst: prisma.transaction.findFirst,
};

afterEach(() => {
  mock.restoreAll();
  prisma.transaction.findFirst = prismaOriginals.txFindFirst;
});

describe('completeSep24WithdrawPayment', () => {
  it('polls → pays → optional terminal + skips missing remittance', async () => {
    const kp = Keypair.random();
    const client = new Sep24Client();
    mock.method(client, 'getTransferServer', async () => 'https://anchor.example/sep24');
    mock.method(client, 'pollUntilTransferReady', async () => ({
      id: 'tx-1',
      status: 'pending_user_transfer_start',
      withdraw_anchor_account: 'GANCHOR',
      withdraw_memo: 'm1',
      amount_in: '1',
    }));
    mock.method(client, 'pollUntilTerminal', async () => ({
      tx: {
        id: 'tx-1',
        status: 'completed',
        stellar_transaction_id: 'payhash',
      },
      timedOut: false,
    }));
    prisma.transaction.findFirst = (async () => null) as typeof prisma.transaction.findFirst;

    const result = await completeSep24WithdrawPayment({
      anchor: ANCHOR,
      network: 'testnet',
      authToken: 'tok',
      transactionId: 'tx-1',
      keypair: kp,
      terminalTimeoutMs: 10_000,
      persistPaymentHash: true,
      sep24Client: client,
      submitPayment: async () => ({
        hash: 'payhash',
        amount: '1',
        destination: 'GANCHOR',
        memo: 'm1',
        memoType: 'text',
      }),
    });

    assert.equal(result.payment.hash, 'payhash');
    assert.equal(result.finalStatus?.status, 'completed');
    assert.equal(result.terminalTimedOut, false);
    assert.equal(result.remittanceId, undefined);
  });

  it('returns payment hash when terminal poll times out', async () => {
    const kp = Keypair.random();
    const client = new Sep24Client();
    mock.method(client, 'getTransferServer', async () => 'https://anchor.example/sep24');
    mock.method(client, 'pollUntilTransferReady', async () => ({
      id: 'tx-1',
      status: 'pending_user_transfer_start',
      withdraw_anchor_account: 'GANCHOR',
      withdraw_memo: 'm1',
      amount_in: '1',
    }));
    mock.method(client, 'pollUntilTerminal', async () => ({
      tx: {
        id: 'tx-1',
        status: 'pending_anchor',
        withdraw_anchor_account: 'GANCHOR',
        withdraw_memo: 'm1',
      },
      timedOut: true,
    }));

    const result = await completeSep24WithdrawPayment({
      anchor: ANCHOR,
      network: 'testnet',
      authToken: 'tok',
      transactionId: 'tx-1',
      keypair: kp,
      terminalTimeoutMs: 1_000,
      persistPaymentHash: false,
      sep24Client: client,
      submitPayment: async () => ({
        hash: 'payhash-onchain',
        amount: '1',
        destination: 'GANCHOR',
        memo: 'm1',
        memoType: 'text',
      }),
    });

    assert.equal(result.payment.hash, 'payhash-onchain');
    assert.equal(result.terminalTimedOut, true);
    assert.equal(result.finalStatus?.status, 'pending_anchor');
  });
});
