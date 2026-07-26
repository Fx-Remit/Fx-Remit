import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SettlementPrefetchSession,
  buildCreatePendingBody,
  parseCreatePendingSuccess,
} from './settlement-prefetch';

describe('buildCreatePendingBody', () => {
  it('passes through cash-out fields for create-pending', () => {
    const body = buildCreatePendingBody({
      amountUsd: '10',
      payoutFiat: 15000,
      recipientName: 'Jane Doe',
      recipientBank: 'PalmPay',
      recipientAcc: '0123456789',
      bankCode: 'PALMNGPC',
      token: 'USDC',
      externalId: 'idem-1',
    });

    assert.deepEqual(body, {
      amountUsd: '10',
      payoutFiat: 15000,
      recipientName: 'Jane Doe',
      recipientBank: 'PalmPay',
      recipientAcc: '0123456789',
      bankCode: 'PALMNGPC',
      token: 'USDC',
      externalId: 'idem-1',
    });
  });
});

describe('parseCreatePendingSuccess', () => {
  it('parses a successful create-pending payload', () => {
    const prepared = parseCreatePendingSuccess(
      {
        success: true,
        resumed: false,
        transaction: {
          id: 'tx-1',
          orderId: '99',
          externalId: 'idem-1',
          status: 'PROCESSING',
        },
        paycrest: {
          receiveAddress: '0xReceive',
          token: 'USDC',
          tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          decimals: 6,
          network: 'base',
          chainId: 8453,
        },
      },
      'fallback',
    );

    assert.equal(prepared.externalId, 'idem-1');
    assert.equal(prepared.resumed, false);
    assert.equal(prepared.transaction.orderId, '99');
    assert.equal(prepared.paycrest.receiveAddress, '0xReceive');
    assert.equal(prepared.paycrest.decimals, 6);
  });

  it('uses fallback externalId when transaction omits it', () => {
    const prepared = parseCreatePendingSuccess(
      {
        success: true,
        transaction: { orderId: '1' },
        paycrest: { receiveAddress: '0xAbc' },
      },
      'fallback-key',
    );
    assert.equal(prepared.externalId, 'fallback-key');
  });

  it('rejects missing receiveAddress', () => {
    assert.throws(
      () =>
        parseCreatePendingSuccess(
          {
            success: true,
            transaction: { orderId: '1' },
            paycrest: {},
          },
          'x',
        ),
      /receive address/i,
    );
  });

  it('rejects success:false with error message', () => {
    assert.throws(
      () =>
        parseCreatePendingSuccess(
          { success: false, error: 'Insufficient balance' },
          'x',
        ),
      /Insufficient balance/,
    );
  });
});

describe('SettlementPrefetchSession', () => {
  it('prefetches once and serves cached result to awaitPrepared', async () => {
    let calls = 0;
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      payoutFiat: 1000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-prefetch',
    });

    session.start(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        success: true,
        transaction: { orderId: '42', externalId: 'idem-prefetch' },
        paycrest: { receiveAddress: '0xRecv', decimals: 6, token: 'USDC' },
      };
    });

    const a = await session.awaitPrepared();
    const b = await session.awaitPrepared();

    assert.equal(calls, 1);
    assert.equal(a.paycrest.receiveAddress, '0xRecv');
    assert.equal(b.transaction.orderId, '42');
    assert.equal(session.isReady(), true);
    assert.equal(session.needsAbandonCancel(), true);
  });

  it('does not abandon after markConsumed', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      payoutFiat: 1000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-2',
    });

    session.start(async () => ({
      success: true,
      transaction: { orderId: '7', externalId: 'idem-2' },
      paycrest: { receiveAddress: '0xR' },
    }));

    await session.awaitPrepared();
    session.markConsumed();

    assert.equal(session.needsAbandonCancel(), false);
    assert.equal(await session.resolveAbandonExternalId(), null);
  });

  it('resolveAbandonExternalId returns externalId when reserved and unused', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      payoutFiat: 1000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-3',
    });

    session.start(async () => ({
      success: true,
      transaction: { orderId: '8', externalId: 'idem-3' },
      paycrest: { receiveAddress: '0xR' },
    }));

    const id = await session.resolveAbandonExternalId();
    assert.equal(id, 'idem-3');
    // second take is empty
    assert.equal(await session.resolveAbandonExternalId(), null);
  });

  it('allows restart after prefetch failure', async () => {
    let calls = 0;
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      payoutFiat: 1000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-4',
    });

    session.start(async () => {
      calls += 1;
      throw new Error('boom');
    });

    await assert.rejects(() => session.awaitPrepared(), /boom/);

    session.start(async () => {
      calls += 1;
      return {
        success: true,
        transaction: { orderId: '9', externalId: 'idem-4' },
        paycrest: { receiveAddress: '0xOk' },
      };
    });

    const prepared = await session.awaitPrepared();
    assert.equal(prepared.paycrest.receiveAddress, '0xOk');
    assert.equal(calls, 2);
  });

  it('resolveAbandonExternalId is null when prefetch failed', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      payoutFiat: 1000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-5',
    });

    session.start(async () => {
      throw new Error('nope');
    });

    assert.equal(await session.resolveAbandonExternalId(), null);
  });
});
