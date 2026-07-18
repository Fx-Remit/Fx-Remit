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
      address: '0xfde4C96c8593536E31F787dA9eA5d40bB7C2F4FF',
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
