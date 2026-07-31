process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@stellar/stellar-sdk';
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

const READY = {
  id: 'tx-1',
  status: 'pending_user_transfer_start',
  withdraw_anchor_account: 'GANCHOR',
  withdraw_memo: 'm1',
  withdraw_memo_type: 'text',
  amount_in: '1',
};

afterEach(() => {
  mock.restoreAll();
});

describe('completeSep24WithdrawPayment', () => {
  it('polls → rechecks → pays → optional terminal', async () => {
    const kp = Keypair.random();
    const client = new Sep24Client();
    mock.method(client, 'getTransferServer', async () => 'https://anchor.example/sep24');
    mock.method(client, 'pollUntilTransferReady', async () => ({ ...READY }));
    mock.method(client, 'getTransactionReliable', async () => ({ ...READY }));
    mock.method(client, 'pollUntilTerminal', async () => ({
      tx: {
        id: 'tx-1',
        status: 'completed',
        stellar_transaction_id: 'payhash',
      },
      timedOut: false,
    }));

    const result = await completeSep24WithdrawPayment({
      anchor: ANCHOR,
      network: 'testnet',
      authToken: 'tok',
      transactionId: 'tx-1',
      keypair: kp,
      terminalTimeoutMs: 10_000,
      persistPaymentHash: false,
      sep24Client: client,
      findRemittance: async () => null,
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
    assert.equal(result.paymentReused, undefined);
  });

  it('returns payment hash when terminal poll times out', async () => {
    const kp = Keypair.random();
    const client = new Sep24Client();
    mock.method(client, 'getTransferServer', async () => 'https://anchor.example/sep24');
    mock.method(client, 'pollUntilTransferReady', async () => ({ ...READY }));
    mock.method(client, 'getTransactionReliable', async () => ({ ...READY }));
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
      transactionId: 'tx-timeout',
      keypair: kp,
      terminalTimeoutMs: 1_000,
      persistPaymentHash: false,
      sep24Client: client,
      findRemittance: async () => null,
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

  it('skips Horizon submit when remittance already has payment hash', async () => {
    const kp = Keypair.random();
    const client = new Sep24Client();
    mock.method(client, 'getTransferServer', async () => 'https://anchor.example/sep24');
    mock.method(client, 'pollUntilTransferReady', async () => ({ ...READY }));
    let submitCount = 0;

    const result = await completeSep24WithdrawPayment({
      anchor: ANCHOR,
      network: 'testnet',
      authToken: 'tok',
      transactionId: 'tx-reuse',
      keypair: kp,
      terminalTimeoutMs: 0,
      persistPaymentHash: false,
      sep24Client: client,
      findRemittance: async () => ({
        id: 'rem-1',
        stellarPaymentHash: 'existing-hash',
      }),
      submitPayment: async () => {
        submitCount += 1;
        return {
          hash: 'should-not-run',
          amount: '1',
          destination: 'GANCHOR',
          memo: 'm1',
          memoType: 'text',
        };
      },
    });

    assert.equal(submitCount, 0);
    assert.equal(result.payment.hash, 'existing-hash');
    assert.equal(result.paymentReused, true);
    assert.equal(result.remittanceId, 'rem-1');
  });

  it('fails before submit when status moved past user transfer', async () => {
    const kp = Keypair.random();
    const client = new Sep24Client();
    mock.method(client, 'getTransferServer', async () => 'https://anchor.example/sep24');
    mock.method(client, 'pollUntilTransferReady', async () => ({ ...READY }));
    mock.method(client, 'getTransactionReliable', async () => ({
      id: 'tx-1',
      status: 'pending_anchor',
      withdraw_anchor_account: 'GANCHOR',
      withdraw_memo: 'm1',
    }));

    await assert.rejects(
      () =>
        completeSep24WithdrawPayment({
          anchor: ANCHOR,
          network: 'testnet',
          authToken: 'tok',
          transactionId: 'tx-past',
          keypair: kp,
          terminalTimeoutMs: 0,
          persistPaymentHash: false,
          sep24Client: client,
          findRemittance: async () => null,
          submitPayment: async () => {
            throw new Error('should not submit');
          },
        }),
      /no longer awaiting user transfer/,
    );
  });

  it('serializes concurrent pays for the same transaction id', async () => {
    const kp = Keypair.random();
    const client = new Sep24Client();
    mock.method(client, 'getTransferServer', async () => 'https://anchor.example/sep24');
    mock.method(client, 'pollUntilTransferReady', async () => ({ ...READY }));
    mock.method(client, 'getTransactionReliable', async () => ({ ...READY }));

    let inFlight = 0;
    let maxInFlight = 0;
    let call = 0;
    const hashes: string[] = [];

    const run = () =>
      completeSep24WithdrawPayment({
        anchor: ANCHOR,
        network: 'testnet',
        authToken: 'tok',
        transactionId: 'tx-lock',
        keypair: kp,
        terminalTimeoutMs: 0,
        persistPaymentHash: false,
        sep24Client: client,
        findRemittance: async () => {
          if (hashes.length > 0) {
            return {
              id: 'rem-lock',
              stellarPaymentHash: hashes[0]!,
            };
          }
          return null;
        },
        submitPayment: async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 30));
          inFlight -= 1;
          call += 1;
          const hash = `hash-${call}`;
          hashes.push(hash);
          return {
            hash,
            amount: '1',
            destination: 'GANCHOR',
            memo: 'm1',
            memoType: 'text',
          };
        },
      });

    const [a, b] = await Promise.all([run(), run()]);
    assert.equal(maxInFlight, 1);
    assert.equal(a.payment.hash, 'hash-1');
    assert.equal(b.payment.hash, 'hash-1');
    assert.equal(b.paymentReused, true);
  });
});
