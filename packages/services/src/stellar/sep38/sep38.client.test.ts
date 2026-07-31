import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {
  Sep38Client,
  resolveSep38BuyAsset,
  indicativeRateToFiatPerUsdc,
  buyAssetMatchesCode,
  listPriceToFiatPerUsdc,
} from './sep38.client.js';
import { clearAnchorTomlCache } from '../config/anchor-toml.js';
import type { AnchorConfig } from '../types/types.js';

/** Production-style anchor — uses corridor fiat via GET /prices */
const LINK_ANCHOR: AnchorConfig = {
  id: 'link',
  name: 'Link',
  homeDomain: 'link.example',
  corridors: ['NGN', 'KES'],
  usdcAssetCode: 'USDC',
  usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  priority: 1,
  methods: ['bank'],
};

/** SDF testanchor — USD stand-in + GET /price fallback */
const TEST_ANCHOR: AnchorConfig = {
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
WEB_AUTH_ENDPOINT="https://anchor.example/auth"
QUOTE_SERVER="https://anchor.example/sep38/"
TRANSFER_SERVER_SEP0024="https://anchor.example/sep24"
`;

beforeEach(() => {
  clearAnchorTomlCache();
});

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
});

describe('resolveSep38BuyAsset / indicativeRateToFiatPerUsdc', () => {
  it('maps testanchor corridors to USD demo fiat', () => {
    const buy = resolveSep38BuyAsset(TEST_ANCHOR, 'NGN');
    assert.equal(buy.buyAssetCode, 'USD');
    assert.equal(buy.buyAsset, 'iso4217:USD');
    assert.equal(buy.isDemoFiat, true);
    assert.match(buy.demoNote ?? '', /USD/);
  });

  it('keeps corridor fiat for non-test anchors', () => {
    const buy = resolveSep38BuyAsset(LINK_ANCHOR, 'KES');
    assert.equal(buy.buyAssetCode, 'KES');
    assert.equal(buy.buyAsset, 'iso4217:KES');
    assert.equal(buy.isDemoFiat, false);
  });

  it('prefers buy_amount/sell_amount for fiat-per-USDC', () => {
    assert.equal(
      indicativeRateToFiatPerUsdc({
        price: '1.05',
        sell_amount: '10',
        buy_amount: '8.5714',
      }),
      0.85714,
    );
  });

  it('falls back to 1/price when amounts missing', () => {
    assert.equal(indicativeRateToFiatPerUsdc({ price: '2' }), 0.5);
  });

  it('buyAssetMatchesCode does not treat USDT/USDC as USD', () => {
    assert.equal(buyAssetMatchesCode('iso4217:USD', 'USD'), true);
    assert.equal(buyAssetMatchesCode('iso4217:usd', 'USD'), true);
    assert.equal(buyAssetMatchesCode('USD', 'USD'), true);
    assert.equal(buyAssetMatchesCode('iso4217:USDT', 'USD'), false);
    assert.equal(buyAssetMatchesCode('stellar:USDC:GBBD', 'USD'), false);
    assert.equal(buyAssetMatchesCode('iso4217:KES', 'KES'), true);
  });

  it('listPriceToFiatPerUsdc uses amounts when present else raw price', () => {
    assert.equal(
      listPriceToFiatPerUsdc({
        sell_asset: 'x',
        buy_asset: 'iso4217:NGN',
        price: '1.05',
        sell_amount: '10',
        buy_amount: '8.5714',
      }),
      0.85714,
    );
    assert.equal(
      listPriceToFiatPerUsdc({
        sell_asset: 'x',
        buy_asset: 'iso4217:NGN',
        price: '1600',
      }),
      1600,
    );
  });
});

describe('Sep38Client — happy paths', () => {
  it('getQuoteServer strips trailing slash', async () => {
    mock.method(axios, 'get', async () => ({ data: TOML_WITH_SEP38 }));
    const client = new Sep38Client();
    const server = await client.getQuoteServer(LINK_ANCHOR);
    assert.equal(server, 'https://anchor.example/sep38');
  });

  it('fetchPrices passes sell_amount and attaches auth when provided', async () => {
    const getMock = mock.fn(async (url: string) => {
      assert.match(String(url), /sell_amount=10/);
      assert.match(String(url), /sell_asset=/);
      return {
        data: {
          prices: [
            {
              sell_asset: 'stellar:USDC:GBBD',
              buy_asset: 'iso4217:NGN',
              price: '1500.5',
            },
          ],
        },
      };
    });
    mock.method(axios, 'get', getMock);

    const client = new Sep38Client();
    const prices = await client.fetchPrices(
      'https://anchor.example/sep38',
      'stellar:USDC:GBBD',
      '10',
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
      'https://anchor.example/sep38',
      'stellar:USDC:GBBD',
      '1',
    );
    assert.equal(prices[0].buy_asset, 'iso4217:KES');
  });

  it('getWholesaleQuote matches NGN corridor via /prices for production-style anchors', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      assert.match(String(url), /\/prices/);
      assert.match(String(url), /sell_amount=1/);
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
      anchor: LINK_ANCHOR,
      sellAmount: '1',
      destinationFiat: 'NGN',
    });

    assert.equal(quote.corridor, 'NGN');
    assert.equal(quote.destination_currency, 'NGN');
    assert.equal(quote.rate, 1600);
    assert.equal(quote.demo_fiat, undefined);
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
    const quote = await client.getWholesaleQuoteForCorridor(LINK_ANCHOR, 'KES', '5');
    assert.equal(quote.corridor, 'KES');
    assert.equal(quote.destination_currency, 'KES');
    assert.equal(quote.rate, 129.25);
  });

  it('testanchor skips GET /prices and uses GET /price with USD demo fiat', async () => {
    const getMock = mock.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      if (u.includes('/prices')) {
        throw new Error('GET /prices must not be called for testanchor demo quotes');
      }
      if (u.includes('/price')) {
        assert.match(u, /buy_asset=iso4217%3AUSD|buy_asset=iso4217:USD/);
        assert.match(u, /context=sep6/);
        assert.match(u, /sell_amount=10/);
        return {
          data: {
            price: '1.05',
            sell_amount: '10',
            buy_amount: '8.5714',
          },
        };
      }
      throw new Error(`unexpected url ${u}`);
    });
    mock.method(axios, 'get', getMock);

    const client = new Sep38Client();
    const quote = await client.getWholesaleQuote({
      anchor: TEST_ANCHOR,
      sellAmount: '10',
      destinationFiat: 'NGN',
    });

    assert.equal(quote.corridor, 'NGN');
    assert.equal(quote.destination_currency, 'USD');
    assert.equal(quote.demo_fiat, 'USD');
    assert.equal(quote.rate, 0.85714);
    assert.match(quote.demo_note ?? '', /not NGN\/KES/);
  });

  it('testanchor uses indicative /price rate even if /prices would return raw SEP-38 price', async () => {
    mock.method(axios, 'get', async (url: string) => {
      const u = String(url);
      if (u.includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      if (u.includes('/prices')) {
        throw new Error('GET /prices must not be called for testanchor demo quotes');
      }
      if (u.includes('/price')) {
        return {
          data: {
            price: '2',
            sell_amount: '4',
            buy_amount: '2',
          },
        };
      }
      throw new Error(`unexpected url ${u}`);
    });

    const client = new Sep38Client();
    const quote = await client.getWholesaleQuote({
      anchor: TEST_ANCHOR,
      sellAmount: '4',
      destinationFiat: 'KES',
    });

    assert.equal(quote.destination_currency, 'USD');
    assert.equal(quote.rate, 0.5);
  });
});

describe('Sep38Client — unhappy paths', () => {
  it('getQuoteServer rejects when QUOTE_SERVER missing', async () => {
    mock.method(axios, 'get', async () => ({
      data: 'WEB_AUTH_ENDPOINT="https://x/auth"\n',
    }));

    const client = new Sep38Client();
    await assert.rejects(() => client.getQuoteServer(LINK_ANCHOR), /no SEP-38 quote server/);
  });

  it('getWholesaleQuote rejects when /prices miss and /price also fails', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP38 };
      }
      if (String(url).includes('/prices')) {
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
      }
      throw new Error('Request failed with status code 400');
    });

    const client = new Sep38Client();
    await assert.rejects(
      () =>
        client.getWholesaleQuote({
          anchor: LINK_ANCHOR,
          sellAmount: '1',
          destinationFiat: 'NGN',
        }),
      /SEP-38 \/price failed/,
    );
  });

  it('getWholesaleQuote rejects zero rates from /prices', async () => {
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
          anchor: LINK_ANCHOR,
          sellAmount: '1',
          destinationFiat: 'NGN',
        }),
      /Invalid SEP-38 list price/,
    );
  });

  it('getWholesaleQuote rejects non-numeric price strings from /prices', async () => {
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
          anchor: LINK_ANCHOR,
          sellAmount: '1',
          destinationFiat: 'NGN',
        }),
      /Invalid SEP-38 list price/,
    );
  });

  it('fetchPrices returns empty array when body has neither prices nor price', async () => {
    mock.method(axios, 'get', async () => ({ data: {} }));
    const client = new Sep38Client();
    const prices = await client.fetchPrices(
      'https://anchor.example/sep38',
      'stellar:USDC:X',
      '1',
    );
    assert.deepEqual(prices, []);
  });
});
