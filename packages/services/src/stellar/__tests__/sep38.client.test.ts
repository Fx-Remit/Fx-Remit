import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { Sep38Client } from '../sep38.client.js';
import { clearAnchorTomlCache } from '../anchor-toml.js';
import type { AnchorConfig } from '../types.js';

const ANCHOR: AnchorConfig = {
  id: 'testanchor',
  name: 'Test Anchor',
  homeDomain: 'testanchor.example',
  corridors: ['NGN', 'KES'],
  usdcAssetCode: 'USDC',
  usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  priority: 0,
  methods: ['bank'],
};

const TOML_WITH_SEP38 = `
WEB_AUTH_ENDPOINT="https://testanchor.example/auth"
QUOTE_SERVER="https://testanchor.example/sep38/"
TRANSFER_SERVER_SEP0024="https://testanchor.example/sep24"
`;

beforeEach(() => {
  clearAnchorTomlCache();
});

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
});

describe('Sep38Client — happy paths', () => {
  it('getQuoteServer strips trailing slash', async () => {
    mock.method(axios, 'get', async () => ({ data: TOML_WITH_SEP38 }));
    const client = new Sep38Client();
    const server = await client.getQuoteServer(ANCHOR);
    assert.equal(server, 'https://testanchor.example/sep38');
  });

  it('fetchPrices prefers prices array and attaches auth when provided', async () => {
    const getMock = mock.fn(async () => ({
      data: {
        prices: [
          {
            sell_asset: 'stellar:USDC:GBBD',
            buy_asset: 'iso4217:NGN',
            price: '1500.5',
          },
        ],
      },
    }));
    mock.method(axios, 'get', getMock);

    const client = new Sep38Client();
    const prices = await client.fetchPrices(
      'https://testanchor.example/sep38',
      'stellar:USDC:GBBD',
      'tok',
    );

    assert.equal(prices.length, 1);
    assert.equal(prices[0].price, '1500.5');
    const opts = (getMock.mock.calls[0] as { arguments: unknown[] }).arguments[1] as {
      headers?: { Authorization?: string };
    };
    assert.equal(opts.headers?.Authorization, 'Bearer tok');
  });

  it('fetchPrices falls back to price array key', async () => {
    mock.method(axios, 'get', async () => ({
      data: {
        price: [
          {
            sell_asset: 'stellar:USDC:GBBD',
            buy_asset: 'iso4217:KES',
            price: '130',
          },
        ],
      },
    }));

    const client = new Sep38Client();
    const prices = await client.fetchPrices(
      'https://testanchor.example/sep38',
      'stellar:USDC:GBBD',
    );
    assert.equal(prices[0].buy_asset, 'iso4217:KES');
  });

  it('getWholesaleQuote matches NGN corridor and returns retail-ready rate', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      return {
        data: {
          prices: [
            {
              sell_asset: 'stellar:USDC:GBBD',
              buy_asset: 'iso4217:NGN',
              price: '1600',
              expires_at: '2099-01-01T00:00:00Z',
            },
          ],
        },
      };
    });

    const client = new Sep38Client();
    const quote = await client.getWholesaleQuote({
      anchor: ANCHOR,
      sellAmount: '1',
      destinationFiat: 'NGN',
    });

    assert.equal(quote.corridor, 'NGN');
    assert.equal(quote.rate, 1600);
    assert.equal(quote.anchor_id, 'testanchor');
    assert.equal(quote.source_currency, 'USDC');
    assert.equal(quote.expires_at, '2099-01-01T00:00:00Z');
  });

  it('getWholesaleQuoteForCorridor matches KES case-insensitively', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      return {
        data: {
          prices: [
            {
              sell_asset: 'stellar:USDC:GBBD',
              buy_asset: 'iso4217:kes',
              price: '129.25',
            },
          ],
        },
      };
    });

    const client = new Sep38Client();
    const quote = await client.getWholesaleQuoteForCorridor(ANCHOR, 'KES', '5');
    assert.equal(quote.corridor, 'KES');
    assert.equal(quote.rate, 129.25);
  });
});

describe('Sep38Client — unhappy paths', () => {
  it('getQuoteServer rejects when QUOTE_SERVER missing', async () => {
    mock.method(axios, 'get', async () => ({
      data: 'WEB_AUTH_ENDPOINT="https://x/auth"\n',
    }));

    const client = new Sep38Client();
    await assert.rejects(() => client.getQuoteServer(ANCHOR), /no SEP-38 quote server/);
  });

  it('getWholesaleQuote rejects when no price matches corridor', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      return {
        data: {
          prices: [
            {
              sell_asset: 'stellar:USDC:GBBD',
              buy_asset: 'iso4217:GHS',
              price: '10',
            },
          ],
        },
      };
    });

    const client = new Sep38Client();
    await assert.rejects(
      () =>
        client.getWholesaleQuote({
          anchor: ANCHOR,
          sellAmount: '1',
          destinationFiat: 'NGN',
        }),
      /No SEP-38 price/,
    );
  });

  it('getWholesaleQuote rejects empty prices list', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      return { data: { prices: [] } };
    });

    const client = new Sep38Client();
    await assert.rejects(
      () =>
        client.getWholesaleQuote({
          anchor: ANCHOR,
          sellAmount: '1',
          destinationFiat: 'KES',
        }),
      /No SEP-38 price/,
    );
  });

  it('getWholesaleQuote rejects zero or negative rates', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      return {
        data: {
          prices: [{ sell_asset: 'x', buy_asset: 'iso4217:NGN', price: '0' }],
        },
      };
    });

    const client = new Sep38Client();
    await assert.rejects(
      () =>
        client.getWholesaleQuote({
          anchor: ANCHOR,
          sellAmount: '1',
          destinationFiat: 'NGN',
        }),
      /Invalid SEP-38 price/,
    );
  });

  it('getWholesaleQuote rejects non-numeric price strings', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      return {
        data: {
          prices: [{ sell_asset: 'x', buy_asset: 'iso4217:NGN', price: 'not-a-number' }],
        },
      };
    });

    const client = new Sep38Client();
    await assert.rejects(
      () =>
        client.getWholesaleQuote({
          anchor: ANCHOR,
          sellAmount: '1',
          destinationFiat: 'NGN',
        }),
      /Invalid SEP-38 price/,
    );
  });

  it('fetchPrices returns empty array when body has neither prices nor price', async () => {
    mock.method(axios, 'get', async () => ({ data: {} }));
    const client = new Sep38Client();
    const prices = await client.fetchPrices('https://testanchor.example/sep38', 'stellar:USDC:X');
    assert.deepEqual(prices, []);
  });

  it('propagates network failures from quote server', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      throw new Error('ETIMEDOUT');
    });

    const client = new Sep38Client();
    await assert.rejects(
      () =>
        client.getWholesaleQuote({
          anchor: ANCHOR,
          sellAmount: '1',
          destinationFiat: 'NGN',
        }),
      /ETIMEDOUT/,
    );
  });
});
