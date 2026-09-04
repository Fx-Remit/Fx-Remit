import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEPOSIT_RECONCILE_LOOKBACK_BLOCKS,
  DEPOSIT_SYNC_LOOKBACK_BLOCKS,
  tokenDecimals,
  alchemyNetworkToChainId,
} from './deposit.tokens.js';

describe('deposit.tokens lookback + decimals', () => {
  it('reconcile lookback exceeds ~26h on Base (~2s) and Celo (~1s)', () => {
    const baseHours = (DEPOSIT_RECONCILE_LOOKBACK_BLOCKS[8453]! * 2) / 3600;
    const celoHours = (DEPOSIT_RECONCILE_LOOKBACK_BLOCKS[42220]! * 1) / 3600;
    assert.ok(baseHours >= 26, `Base lookback ${baseHours}h`);
    assert.ok(celoHours >= 26, `Celo lookback ${celoHours}h`);
  });

  it('sync lookback is at least ~12h on both chains', () => {
    const baseHours = (DEPOSIT_SYNC_LOOKBACK_BLOCKS[8453]! * 2) / 3600;
    const celoHours = (DEPOSIT_SYNC_LOOKBACK_BLOCKS[42220]! * 1) / 3600;
    assert.ok(baseHours >= 12);
    assert.ok(celoHours >= 12);
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

  it('alchemyNetworkToChainId maps BASE and CELO', () => {
    assert.equal(alchemyNetworkToChainId('BASE_MAINNET'), 8453);
    assert.equal(alchemyNetworkToChainId('CELO_MAINNET'), 42220);
    assert.equal(alchemyNetworkToChainId('UNKNOWN'), null);
  });
});
