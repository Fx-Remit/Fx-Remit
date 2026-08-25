process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.PAYCREST_API_KEY ??= 'test-paycrest-key';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PayoutService, PricingService } from '@fx-remit/services';
import { GET } from './route';

afterEach(() => {
  mock.restoreAll();
});

function quoteReq(query: string) {
  return new NextRequest(`http://localhost/api/quote?${query}`);
}

describe('GET /api/quote — happy paths', () => {
  it('returns retail quote using settlement USDC even when UI asks USDT', async () => {
    const fetchRate = mock.method(PayoutService, 'fetchRate', async (
      network: string,
      source: string,
      destination: string,
      amount: string,
    ) => {
      assert.equal(network, 'base');
      assert.equal(source, 'USDC');
      assert.equal(destination, 'UGX');
      assert.equal(amount, '1');
      return {
        success: true,
        rate: {
          source_currency: 'USDC',
          destination_currency: 'UGX',
          rate: 3600,
          fixed_fee: 0,
          variable_fee: 0,
        },
      };
    });

    const res = await GET(quoteReq('source=USDT&destination=UGX&amount=0.50'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.quote.settlement_token, 'USDC');
    assert.equal(body.quote.source_currency, 'USDT');
    assert.equal(body.quote.destination_currency, 'UGX');
    assert.equal(fetchRate.mock.callCount(), 1);
  });

  it('returns retail quote using stable reference amount of 1', async () => {
    const fetchRate = mock.method(PayoutService, 'fetchRate', async (
      network: string,
      source: string,
      destination: string,
      amount: string,
    ) => {
      assert.equal(network, 'base');
      assert.equal(source, 'USDC');
      assert.equal(destination, 'NGN');
      assert.equal(amount, '1');
      return {
        success: true,
        rate: {
          source_currency: 'USDC',
          destination_currency: 'NGN',
          rate: 1600,
          fixed_fee: 0,
          variable_fee: 0,
        },
      };
    });

    const res = await GET(quoteReq('source=USDC&destination=NGN&amount=100'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.quote.wholesale_rate, 1600);
    assert.equal(body.quote.retail_rate, PricingService.calculateRetailRate(1600));
    assert.equal(body.quote.spread_bps, 75);
    assert.equal(fetchRate.mock.callCount(), 1);
  });
});

describe('GET /api/quote — unhappy paths', () => {
  it('returns 400 when source or destination missing', async () => {
    const res = await GET(quoteReq('source=USDC'));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Source and destination/);
  });

  it('propagates provider failure status from fetchRate', async () => {
    mock.method(PayoutService, 'fetchRate', async () => ({
      success: false,
      error: 'Liquidity Provider Unavailable',
      status: 503,
    }));

    const res = await GET(quoteReq('source=USDC&destination=NGN'));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /Liquidity Provider Unavailable/);
  });

  it('returns 500 on unexpected throw', async () => {
    mock.method(PayoutService, 'fetchRate', async () => {
      throw new Error('boom');
    });

    const res = await GET(quoteReq('source=USDC&destination=NGN'));
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Internal pricing error');
  });
});
