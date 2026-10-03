import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  QuoteBindService,
  QuoteExpiredError,
  QuoteUnavailableError,
} from './quote-bind.service.js';
import { PayoutService } from './payout.service.js';
import { PricingService } from './pricing.service.js';

describe('QuoteBindService', () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  it('isReservedRemittanceResume is true only for same-user PENDING/PROCESSING', () => {
    assert.equal(
      QuoteBindService.isReservedRemittanceResume(
        { userId: 'u1', type: 'REMITTANCE', status: 'PENDING' },
        'u1',
      ),
      true,
    );
    assert.equal(
      QuoteBindService.isReservedRemittanceResume(
        { userId: 'u1', type: 'REMITTANCE', status: 'PROCESSING' },
        'u1',
      ),
      true,
    );
    assert.equal(
      QuoteBindService.isReservedRemittanceResume(
        { userId: 'u1', type: 'REMITTANCE', status: 'FAILED' },
        'u1',
      ),
      false,
    );
    assert.equal(
      QuoteBindService.isReservedRemittanceResume(
        { userId: 'other', type: 'REMITTANCE', status: 'PENDING' },
        'u1',
      ),
      false,
    );
    assert.equal(QuoteBindService.isReservedRemittanceResume(null, 'u1'), false);
  });

  it('computePayoutFiat multiplies and truncates to 2dp', () => {
    assert.equal(PricingService.computePayoutFiat(10, 1588), 15880);
    assert.equal(PricingService.computePayoutFiat(1.119, 1588), 1776.97);
  });

  it('assertQuoteFresh rejects expired or invalid valid_until', () => {
    const now = 1_700_000_000_000;
    assert.throws(
      () => QuoteBindService.assertQuoteFresh(now - 1, now),
      QuoteExpiredError,
    );
    assert.throws(
      () => QuoteBindService.assertQuoteFresh(Number.NaN, now),
      QuoteExpiredError,
    );
    assert.doesNotThrow(() =>
      QuoteBindService.assertQuoteFresh(now + 30_000, now),
    );
  });

  it('resolveForCreatePending overwrites fiat from live retail quote', async () => {
    // Example values only; real fee/spread live in server env.
    process.env.PAYOUT_FEE_BPS = '100';
    process.env.PAYOUT_SPREAD_BPS = '200';
    mock.method(PayoutService, 'fetchRate', async () => ({
      success: true,
      rate: {
        source_currency: 'USDC',
        destination_currency: 'NGN',
        rate: 1600,
        fixed_fee: 0,
        variable_fee: 0,
      },
    }));

    const now = Date.now();
    const bound = await QuoteBindService.resolveForCreatePending({
      amountUsd: 10,
      sourceToken: 'USDT',
      destinationCurrency: 'NGN',
      quoteValidUntil: now + 60_000,
      nowMs: now,
    });

    // Shown rate 1600 × 0.98 = 1568. Fee 1% of $10 = $0.10.
    // User receives (10 − 0.10) × 1568 = 15523.2, which is the bank part 9.702 × 1600.
    assert.equal(bound.retailRate, 1568);
    assert.equal(bound.wholesaleRate, 1600);
    assert.equal(bound.feeBps, 100);
    assert.equal(bound.feeUsd, '0.100000');
    assert.equal(bound.bankAmount, '9.702000');
    assert.equal(bound.senderFee, '0.298000');
    assert.equal(bound.payoutFiat, 15523.2);
    assert.ok(bound.validUntil > now);
    delete process.env.PAYOUT_FEE_BPS;
    delete process.env.PAYOUT_SPREAD_BPS;
  });

  it('resolveForCreatePending fails closed on stale client quote', async () => {
    const fetch = mock.method(PayoutService, 'fetchRate', async () => {
      throw new Error('should not fetch');
    });

    await assert.rejects(
      () =>
        QuoteBindService.resolveForCreatePending({
          amountUsd: 10,
          sourceToken: 'USDC',
          quoteValidUntil: Date.now() - 1,
        }),
      QuoteExpiredError,
    );
    assert.equal(fetch.mock.callCount(), 0);
  });

  it('resolveForCreatePending fails when wholesale rate unavailable', async () => {
    mock.method(PayoutService, 'fetchRate', async () => ({
      success: false,
      error: 'provider down',
      status: 503,
    }));

    await assert.rejects(
      () =>
        QuoteBindService.resolveForCreatePending({
          amountUsd: 10,
          sourceToken: 'USDC',
          quoteValidUntil: Date.now() + 60_000,
        }),
      (err: unknown) =>
        err instanceof QuoteUnavailableError &&
        err.message.includes('provider down'),
    );
  });
});
