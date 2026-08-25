import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFreshQuoteValidUntil } from './fetch-retail-quote';

describe('fetchFreshQuoteValidUntil', () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  it('returns valid_until from a successful quote response', async () => {
    const validUntil = Date.now() + 60_000;
    mock.method(globalThis, 'fetch', async () => ({
      json: async () => ({
        success: true,
        quote: { valid_until: validUntil },
      }),
    }));

    const result = await fetchFreshQuoteValidUntil({
      sourceToken: 'USDC',
      destinationCurrency: 'NGN',
    });
    assert.equal(result, validUntil);
  });

  it('rejects when quote is already expired', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      json: async () => ({
        success: true,
        quote: { valid_until: Date.now() - 1 },
      }),
    }));

    await assert.rejects(
      () =>
        fetchFreshQuoteValidUntil({
          sourceToken: 'USDC',
          destinationCurrency: 'NGN',
        }),
      /Quote expired/,
    );
  });

  it('rejects when quote API fails', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      json: async () => ({
        success: false,
        error: 'provider down',
      }),
    }));

    await assert.rejects(
      () =>
        fetchFreshQuoteValidUntil({
          sourceToken: 'USDC',
          destinationCurrency: 'NGN',
        }),
      /provider down/,
    );
  });
});
