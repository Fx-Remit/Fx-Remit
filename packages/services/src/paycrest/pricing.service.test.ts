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
  it('calculateRetailRate applies default 75 bps markup', () => {
    // 1600 * (1 - 0.0075) = 1588
    assert.equal(PricingService.calculateRetailRate(1600), 1588);
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

  it('generateQuote attaches retail_rate, markup_bps, and valid_until', () => {
    const before = Date.now();
    const quote = PricingService.generateQuote(WHOLESALE);
    const after = Date.now();

    assert.equal(quote.source_currency, 'USDC');
    assert.equal(quote.destination_currency, 'NGN');
    assert.equal(quote.rate, 1600);
    assert.equal(quote.retail_rate, 1588);
    assert.equal(quote.markup_bps, 75);
    assert.ok(quote.valid_until >= before + 60_000);
    assert.ok(quote.valid_until <= after + 60_000);
  });

  it('calculateSurplus returns wholesale minus retail proceeds', () => {
    // 100 * 1600 - 100 * 1588 = 1200
    assert.equal(PricingService.calculateSurplus(100, 1600, 1588), 1200);
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
    assert.equal(PricingService.calculateRetailRate(0), 0);
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
