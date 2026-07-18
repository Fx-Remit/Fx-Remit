"use client";

import { useQuery } from "@tanstack/react-query";
import { Alchemy, Network } from "alchemy-sdk";

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

const ALLOWLIST: Record<number, string[]> = {
  8453: [
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "0xfde4C96c8593536E31F787dA9eA5d40bB7C2F4FF",
  ],
  42220: [
    "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  ],
};

const getAlchemyNetwork = (chainId: number): Network => {
  switch (chainId) {
    case 8453:
      return Network.BASE_MAINNET;
    case 42220:
      return Network.CELO_MAINNET;
    default:
      throw new Error(
        `Unsupported chainId ${chainId}. FX Remit EVM supports Base (8453) and Celo (42220) only.`,
      );
  }
};

/**
 * Live allowlisted token balances for a single chain.
 * Prefer `/api/deposit/balance` for the aggregated home display.
 */
export function useBalances(
  address: string | undefined,
  chainId: number = 8453,
) {
  return useQuery({
    queryKey: ["token-balances", address, chainId],
    queryFn: async () => {
      if (!address || !ALCHEMY_KEY) return [];

      const alchemy = new Alchemy({
        apiKey: ALCHEMY_KEY,
        network: getAlchemyNetwork(chainId),
      });

      const contracts = ALLOWLIST[chainId] ?? [];
      const response = await alchemy.core.getTokenBalances(address, contracts);
      return response.tokenBalances;
    },
    enabled: !!address && !!ALCHEMY_KEY,
    refetchInterval: 15000,
    staleTime: 5000,
  });
}
