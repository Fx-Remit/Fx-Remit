/**
 * Allowlisted deposit assets — shared by DepositService and balance display.
 * Never credit tokens not listed here.
 */
export type DepositToken = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

export const DEPOSIT_TOKENS: Record<number, DepositToken[]> = {
  // Base
  8453: [
    {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
    },
    {
      address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      symbol: 'USDT',
      decimals: 6,
    },
  ],
  // Celo
  42220: [
    {
      address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
      symbol: 'USDC',
      decimals: 6,
    },
    {
      address: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
      symbol: 'cUSD',
      decimals: 18,
    },
    {
      address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
      symbol: 'USDT',
      decimals: 6,
    },
  ],
};

export const DEPOSIT_CHAIN_IDS = [8453, 42220] as const;

/** Known token decimals for remittance amount normalization (includes gas tokens). */
const EXTRA_DECIMALS: Record<string, number> = {
  // native / wrapped gas
  '0x0000000000000000000000000000000000000000': 18,
  '0x4200000000000000000000000000000000000006': 18, // Base WETH
  '0x471ece3750da237f93b8e339c536989b8978a438': 18, // Celo CELO
};

export function tokenDecimals(tokenAddress: string, chainId: number): number {
  const addr = tokenAddress.toLowerCase();
  const listed = DEPOSIT_TOKENS[chainId]?.find((t) => t.address.toLowerCase() === addr);
  if (listed) return listed.decimals;
  if (EXTRA_DECIMALS[addr] !== undefined) return EXTRA_DECIMALS[addr];
  // Stable default for unknown ERC-20 remittance outs on Base/Celo is often 6
  return chainId === 42220 ? 18 : 6;
}

export function alchemyNetworkToChainId(network?: string): number | null {
  const n = (network || '').toUpperCase();
  if (n.includes('BASE')) return 8453;
  if (n.includes('CELO')) return 42220;
  return null;
}

/**
 * Cron lookback must exceed daily gap (≥26–48h).
 * Base ~2s/block → 90k ≈ 50h; Celo ~1s/block → 180k ≈ 50h.
 */
export const DEPOSIT_RECONCILE_LOOKBACK_BLOCKS: Record<number, number> = {
  8453: 90_000,
  42220: 180_000,
};

/** Add Cash / balance sync lookback (~24–25h). */
export const DEPOSIT_SYNC_LOOKBACK_BLOCKS: Record<number, number> = {
  8453: 45_000,
  42220: 90_000,
};
