import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateTokenBalancesUsd,
  pickHighestBalanceToken,
  tokenBalanceForChain,
  BANK_SETTLEMENT_TOKENS,
} from './token-balances';

describe('aggregateTokenBalancesUsd', () => {
  it('sums the same symbol across chains', () => {
    const totals = aggregateTokenBalancesUsd([
      {
        chainId: 8453,
        totalUsd: 10,
        tokens: [
          { symbol: 'USDC', balanceUsd: 7 },
          { symbol: 'USDT', balanceUsd: 3 },
        ],
      },
      {
        chainId: 42220,
        totalUsd: 5,
        tokens: [{ symbol: 'USDC', balanceUsd: 5 }],
      },
    ]);
    assert.equal(totals.USDC, 12);
    assert.equal(totals.USDT, 3);
  });
});

describe('pickHighestBalanceToken', () => {
  it('picks the allowlisted token with the highest balance', () => {
    const token = pickHighestBalanceToken(
      [
        {
          chainId: 8453,
          totalUsd: 20,
          tokens: [
            { symbol: 'USDC', balanceUsd: 4 },
            { symbol: 'USDT', balanceUsd: 16 },
          ],
        },
      ],
      BANK_SETTLEMENT_TOKENS,
    );
    assert.equal(token, 'USDT');
  });

  it('falls back when all balances are zero', () => {
    const token = pickHighestBalanceToken(
      [{ chainId: 8453, totalUsd: 0, tokens: [] }],
      BANK_SETTLEMENT_TOKENS,
      'USDC',
    );
    assert.equal(token, 'USDC');
  });

  it('ignores tokens outside the allowlist', () => {
    const token = pickHighestBalanceToken(
      [
        {
          chainId: 42220,
          totalUsd: 100,
          tokens: [
            { symbol: 'cUSD', balanceUsd: 90 },
            { symbol: 'USDC', balanceUsd: 1 },
          ],
        },
      ],
      BANK_SETTLEMENT_TOKENS,
    );
    assert.equal(token, 'USDC');
  });
});

describe('tokenBalanceForChain', () => {
  const perChain = [
    {
      chainId: 8453,
      totalUsd: 10,
      tokens: [{ symbol: 'USDC', balanceUsd: 7 }],
    },
    {
      chainId: 42220,
      totalUsd: 5,
      tokens: [{ symbol: 'USDC', balanceUsd: 5 }],
    },
  ];

  it('returns the balance for the specific chain, not summed across chains', () => {
    assert.equal(tokenBalanceForChain(perChain, 8453, 'USDC'), 7);
    assert.equal(tokenBalanceForChain(perChain, 42220, 'USDC'), 5);
  });

  it('is case-insensitive on the symbol', () => {
    assert.equal(tokenBalanceForChain(perChain, 8453, 'usdc'), 7);
  });

  it('returns 0 for a token not held on that chain', () => {
    assert.equal(tokenBalanceForChain(perChain, 8453, 'USDT'), 0);
  });

  it('returns 0 for an unknown chain or missing data', () => {
    assert.equal(tokenBalanceForChain(perChain, 1, 'USDC'), 0);
    assert.equal(tokenBalanceForChain(null, 8453, 'USDC'), 0);
    assert.equal(tokenBalanceForChain(undefined, 8453, 'USDC'), 0);
  });
});
