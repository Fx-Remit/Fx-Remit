import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEPOSIT_RECONCILE_LOOKBACK_BLOCKS,
  DEPOSIT_SYNC_LOOKBACK_BLOCKS,
  tokenDecimals,
  alchemyNetworkToChainId,
} from './deposit.tokens.js';

describe('deposit.tokens lookback + decimals', () => {
  it('reconcile lookback exceeds ~26h on Base (~2s), Celo (~1s), and Arbitrum (~0.25s)', () => {
    const baseHours = (DEPOSIT_RECONCILE_LOOKBACK_BLOCKS[8453]! * 2) / 3600;
    const celoHours = (DEPOSIT_RECONCILE_LOOKBACK_BLOCKS[42220]! * 1) / 3600;
    const arbHours = (DEPOSIT_RECONCILE_LOOKBACK_BLOCKS[42161]! * 0.25) / 3600;
    assert.ok(baseHours >= 26, `Base lookback ${baseHours}h`);
    assert.ok(celoHours >= 26, `Celo lookback ${celoHours}h`);
    assert.ok(arbHours >= 26, `Arbitrum lookback ${arbHours}h`);
  });

  it('sync lookback is at least ~12h on all three chains', () => {
    const baseHours = (DEPOSIT_SYNC_LOOKBACK_BLOCKS[8453]! * 2) / 3600;
    const celoHours = (DEPOSIT_SYNC_LOOKBACK_BLOCKS[42220]! * 1) / 3600;
    const arbHours = (DEPOSIT_SYNC_LOOKBACK_BLOCKS[42161]! * 0.25) / 3600;
    assert.ok(baseHours >= 12);
    assert.ok(celoHours >= 12);
    assert.ok(arbHours >= 12);
  });

  it('tokenDecimals falls back to 18 for an unlisted Celo address (e.g. former cUSD) and 6 for Base USDC', () => {
    assert.equal(
      tokenDecimals('0x765DE816845861e75A25fCA122bb6898B8B1282a', 42220),
      18,
    );
    assert.equal(
      tokenDecimals('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 8453),
      6,
    );
  });

  it('tokenDecimals resolves 6 for Arbitrum USDC and USDT, and 18 for Arbitrum WETH via EXTRA_DECIMALS', () => {
    assert.equal(
      tokenDecimals('0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161),
      6,
    );
    assert.equal(
      tokenDecimals('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 42161),
      6,
    );
    assert.equal(
      tokenDecimals('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 42161),
      18,
    );
  });

  it('alchemyNetworkToChainId maps BASE, CELO, and ARB', () => {
    assert.equal(alchemyNetworkToChainId('BASE_MAINNET'), 8453);
    assert.equal(alchemyNetworkToChainId('CELO_MAINNET'), 42220);
    assert.equal(alchemyNetworkToChainId('ARB_MAINNET'), 42161);
    assert.equal(alchemyNetworkToChainId('UNKNOWN'), null);
  });
});
