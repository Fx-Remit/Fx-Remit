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
      quoteValidUntil: 1_700_000_060_000,
      destinationCurrency: 'NGN',
      recipientName: 'Jane Doe',
      recipientBank: 'PalmPay',
      recipientAcc: '0123456789',
      bankCode: 'PALMNGPC',
      recipientType: 'bank',
      token: 'USDC',
      externalId: 'idem-1',
    });

    assert.deepEqual(body, {
      amountUsd: '10',
      quoteValidUntil: 1_700_000_060_000,
      destinationCurrency: 'NGN',
      recipientName: 'Jane Doe',
      recipientBank: 'PalmPay',
      recipientAcc: '0123456789',
      bankCode: 'PALMNGPC',
      recipientType: 'bank',
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

  it('prefers server quote.payoutFiat over URL estimates', () => {
    const prepared = parseCreatePendingSuccess(
      {
        success: true,
        transaction: {
          orderId: '1',
          payoutFiat: '999',
        },
        quote: {
          payoutFiat: 15880,
          retailRate: 1588,
        },
        paycrest: { receiveAddress: '0xAbc' },
      },
      'fallback-key',
    );
    assert.equal(prepared.payoutFiat, 15880);
    assert.equal(prepared.transaction.payoutFiat, '999');
  });

  it('falls back to transaction.payoutFiat when quote omitted', () => {
    const prepared = parseCreatePendingSuccess(
      {
        success: true,
        transaction: {
          orderId: '1',
          payoutFiat: '15000.5',
        },
        paycrest: { receiveAddress: '0xAbc' },
      },
      'fallback-key',
    );
    assert.equal(prepared.payoutFiat, 15000.5);
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

  it('parses abandonToken from create-pending payload', () => {
    const prepared = parseCreatePendingSuccess(
      {
        success: true,
        abandonToken: 'ext.user.exp.sig',
        transaction: { orderId: '1', externalId: 'idem-1' },
        paycrest: { receiveAddress: '0xAbc' },
      },
      'fallback',
    );
    assert.equal(prepared.abandonToken, 'ext.user.exp.sig');
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
      quoteValidUntil: Date.now() + 60_000,
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
  });

  it('does not abandon after markConsumed', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
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

    assert.equal(await session.resolveAbandonExternalId(), null);
  });

  it('review-only session: no create started → abandon returns null', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-review',
    });

    assert.equal(session.hasStartedCreate(), false);
    assert.equal(await session.resolveAbandonExternalId(), null);
    assert.equal(session.wasAbandoned(), false);
    assert.equal(session.hasStartedCreate(), false);
  });

  it('hasStartedCreate is true only after start()', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-started',
    });

    assert.equal(session.hasStartedCreate(), false);
    session.start(async () => ({
      success: true,
      transaction: { orderId: '1', externalId: 'idem-started' },
      paycrest: { receiveAddress: '0xR' },
    }));
    assert.equal(session.hasStartedCreate(), true);
    await session.awaitPrepared();
    assert.equal(session.hasStartedCreate(), true);
  });

  it('commit:false keeps session reusable after resolveAbandonExternalId', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-keep',
    });

    session.start(async () => ({
      success: true,
      transaction: { orderId: '8', externalId: 'idem-keep' },
      paycrest: { receiveAddress: '0xR' },
    }));
    await session.awaitPrepared();

    assert.equal(
      await session.resolveAbandonExternalId({ commit: false }),
      'idem-keep',
    );
    assert.equal(session.wasAbandoned(), false);
    const prepared = await session.awaitPrepared();
    assert.equal(prepared.externalId, 'idem-keep');

    session.markAbandoned();
    assert.equal(session.wasAbandoned(), true);
  });

  it('wasAbandoned is true after resolveAbandonExternalId', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-abandoned',
    });

    session.start(async () => ({
      success: true,
      transaction: { orderId: '8', externalId: 'idem-abandoned' },
      paycrest: { receiveAddress: '0xR' },
    }));
    await session.awaitPrepared();

    assert.equal(session.wasAbandoned(), false);
    assert.equal(await session.resolveAbandonExternalId(), 'idem-abandoned');
    assert.equal(session.wasAbandoned(), true);
  });

  it('resolveAbandonExternalId returns externalId when reserved and unused', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
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
    assert.equal(await session.resolveAbandonExternalId(), null);
  });

  it('allows restart after prefetch failure', async () => {
    let calls = 0;
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
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

  it('resolveAbandonExternalId still returns key when prefetch failed', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-5',
    });

    session.start(async () => {
      throw new Error('nope');
    });

    // Server may have reserved under the same idempotency key; cancel is idempotent.
    assert.equal(await session.resolveAbandonExternalId(), 'idem-5');
  });

  it('aborts in-flight fetcher before resolving abandon id', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-abort',
    });

    let sawAbort = false;
    session.start(async (_body, signal) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => resolve(), 5000);
        signal.addEventListener('abort', () => {
          sawAbort = true;
          clearTimeout(t);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
      return {
        success: true,
        transaction: { orderId: '1' },
        paycrest: { receiveAddress: '0xR' },
      };
    });

    const id = await session.resolveAbandonExternalId();
    assert.equal(id, 'idem-abort');
    assert.equal(sawAbort, true);
  });

  it('rejects stale prepared settlement so Send must re-prefetch', async () => {
    const session = new SettlementPrefetchSession(
      {
        amountUsd: 1,
        quoteValidUntil: Date.now() + 60_000,
        recipientName: 'A',
        recipientBank: 'B',
        recipientAcc: '1',
        token: 'USDC',
        externalId: 'idem-stale',
      },
      { maxAgeMs: 5 },
    );

    session.start(async () => ({
      success: true,
      transaction: { orderId: '1', externalId: 'idem-stale' },
      paycrest: { receiveAddress: '0xR' },
    }));

    await session.awaitPrepared();
    await new Promise((r) => setTimeout(r, 10));

    await assert.rejects(() => session.awaitPrepared(), /expired/i);
    assert.equal(session.isReady(), false);
  });

  it('assigns a stable externalId when caller omits one', async () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: Date.now() + 60_000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
    });

    session.start(async (body) => {
      assert.ok(body.externalId);
      return {
        success: true,
        transaction: { orderId: '1', externalId: body.externalId },
        paycrest: { receiveAddress: '0xR' },
      };
    });

    const prepared = await session.awaitPrepared();
    assert.equal(prepared.externalId, session.externalId);
  });

  it('setQuoteValidUntil refreshes TTL for Send retry without changing externalId', () => {
    const session = new SettlementPrefetchSession({
      amountUsd: 1,
      quoteValidUntil: 1_000,
      recipientName: 'A',
      recipientBank: 'B',
      recipientAcc: '1',
      token: 'USDC',
      externalId: 'idem-retry',
    });

    const before = session.getCreatePendingBody();
    assert.equal(before.quoteValidUntil, 1_000);
    assert.equal(before.externalId, 'idem-retry');

    const refreshed = Date.now() + 60_000;
    session.setQuoteValidUntil(refreshed);

    const after = session.getCreatePendingBody();
    assert.equal(after.quoteValidUntil, refreshed);
    assert.equal(after.externalId, 'idem-retry');
  });
});
