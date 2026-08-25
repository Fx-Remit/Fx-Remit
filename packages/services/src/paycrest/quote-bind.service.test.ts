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

    // 1600 * (1 - 0.0075) = 1588 retail
    assert.equal(bound.retailRate, 1588);
    assert.equal(bound.wholesaleRate, 1600);
    assert.equal(bound.payoutFiat, 15880);
    assert.equal(bound.markupBps, 75);
    assert.ok(bound.validUntil > now);
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
