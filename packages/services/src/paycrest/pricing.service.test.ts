import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PricingService } from './pricing.service.js';
import type { PaycrestRate } from './paycrest.client.js';

const WHOLESALE: PaycrestRate = {
  source_currency: 'USDC',
  destination_currency: 'NGN',
  rate: 1600,
  fixed_fee: 0,
  variable_fee: 0,
};

describe('PricingService — happy paths', () => {
  it('calculateRetailRate defaults to the spread in PAYOUT_SPREAD_BPS', () => {
    process.env.PAYOUT_SPREAD_BPS = '75';
    // 1600 * (1 - 0.0075) = 1588
    assert.equal(PricingService.calculateRetailRate(1600), 1588);
    delete process.env.PAYOUT_SPREAD_BPS;
  });

  it('fee and spread are 0 when their env vars are unset (no number lives in code)', () => {
    delete process.env.PAYOUT_FEE_BPS;
    delete process.env.PAYOUT_SPREAD_BPS;
    assert.equal(PricingService.feeBps(), 0);
    assert.equal(PricingService.spreadBps(), 0);
    assert.equal(PricingService.calculateRetailRate(1600), 1600);
  });

  it('rejects an out-of-range or non-integer bps setting', () => {
    process.env.PAYOUT_FEE_BPS = '2.5';
    assert.throws(() => PricingService.feeBps());
    process.env.PAYOUT_FEE_BPS = '5000';
    assert.throws(() => PricingService.feeBps());
    delete process.env.PAYOUT_FEE_BPS;
  });

  it('splitPayout: what the user sees equals what the bank pays, and the order sums to what was sent', () => {
    // $50 sent, 0.5% fee, 0.75% spread, wholesale 1344.94 (example values).
    const split = PricingService.splitPayout(50, 1344.94, { feeBps: 50, spreadBps: 75 });
    assert.equal(split.amountUsd, '50.000000');
    assert.equal(split.feeUsd, '0.250000');
    assert.equal(split.bankAmount, '49.376875');
    assert.equal(split.senderFee, '0.623125');
    assert.equal(split.payoutFiat, 66408.93);
    // Shown: (50 − 0.25) × shown rate.
    const shown = PricingService.computePayoutFiat(49.75, PricingService.calculateRetailRate(1344.94, 75));
    assert.equal(shown, split.payoutFiat);
    // Paycrest asks for amount + senderFee = exactly what the ledger reserves.
    assert.equal(Number(split.bankAmount) + Number(split.senderFee), 50);
  });

  it('splitPayout with no fee and no spread sends everything to the bank', () => {
    const split = PricingService.splitPayout('12.34', 1600, { feeBps: 0, spreadBps: 0 });
    assert.equal(split.bankAmount, '12.340000');
    assert.equal(split.senderFee, '0.000000');
    assert.equal(split.payoutFiat, 19744);
  });

  it('splitPayout rounds in the user\'s favour on the fee and never over-pays the bank', () => {
    const split = PricingService.splitPayout('1.000001', 1000, { feeBps: 33, spreadBps: 33 });
    // fee = 0.00330000033 → 0.003300 (down); bank rounds down too.
    assert.equal(split.feeUsd, '0.003300');
    assert.ok(Number(split.bankAmount) <= (1.000001 - 0.0033) * (1 - 0.0033));
  });

  it('calculateRetailRate applies custom markup bps', () => {
    // 1600 * (1 - 0.005) = 1592
    assert.equal(PricingService.calculateRetailRate(1600, 50), 1592);
  });

  it('calculateRetailRate truncates to 8 decimals (ROUND_DOWN)', () => {
    // 1.234567899 * 0.9925 = 1.2253086397575 → 1.22530863
    const retail = PricingService.calculateRetailRate(1.234567899, 75);
    assert.equal(retail, 1.22530863);
  });

  it('toContractRate scales retail rate to 8-decimal bigint', () => {
    assert.equal(PricingService.toContractRate(1588), 158800000000n);
    assert.equal(PricingService.toContractRate(1.5, 8), 150000000n);
  });

  it('toContractRate truncates fractional dust (ROUND_DOWN)', () => {
    assert.equal(PricingService.toContractRate(1.234567899), 123456789n);
  });

  it('generateQuote attaches retail_rate, fee_bps, markup_bps, and valid_until', () => {
    const before = Date.now();
    const quote = PricingService.generateQuote(WHOLESALE, 75, 50);
    const after = Date.now();

    assert.equal(quote.source_currency, 'USDC');
    assert.equal(quote.destination_currency, 'NGN');
    assert.equal(quote.rate, 1600);
    assert.equal(quote.retail_rate, 1588);
    assert.equal(quote.markup_bps, 75);
    assert.equal(quote.fee_bps, 50);
    assert.ok(quote.valid_until >= before + 60_000);
    assert.ok(quote.valid_until <= after + 60_000);
  });

  it('calculateSurplus returns wholesale minus retail proceeds', () => {
    // 100 * 1600 - 100 * 1588 = 1200
    assert.equal(PricingService.calculateSurplus(100, 1600, 1588), 1200);
  });

  it('computePayoutFiat multiplies amount by retail rate (2dp ROUND_DOWN)', () => {
    assert.equal(PricingService.computePayoutFiat(10, 1588), 15880);
    assert.equal(PricingService.computePayoutFiat(1.119, 1588), 1776.97);
  });
});

describe('PricingService — unhappy / edge paths', () => {
  it('calculateRetailRate with 0 markup returns wholesale unchanged', () => {
    assert.equal(PricingService.calculateRetailRate(1600, 0), 1600);
  });

  it('calculateRetailRate with 100% markup (10000 bps) returns 0', () => {
    assert.equal(PricingService.calculateRetailRate(1600, 10000), 0);
  });

  it('calculateRetailRate with zero wholesale rate returns 0', () => {
    assert.equal(PricingService.calculateRetailRate(0, 75), 0);
  });

  it('toContractRate with zero rate returns 0n', () => {
    assert.equal(PricingService.toContractRate(0), 0n);
  });

  it('calculateSurplus is 0 when rates match', () => {
    assert.equal(PricingService.calculateSurplus(50, 1500, 1500), 0);
  });

  it('generateQuote with custom markup overrides default', () => {
    const quote = PricingService.generateQuote(WHOLESALE, 100);
    assert.equal(quote.markup_bps, 100);
    // 1600 * 0.99 = 1584
    assert.equal(quote.retail_rate, 1584);
  });
});
