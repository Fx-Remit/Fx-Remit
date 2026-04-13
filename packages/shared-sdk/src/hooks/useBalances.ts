"use client";

import { useQuery } from "@tanstack/react-query";
import { Alchemy, Network } from "alchemy-sdk";

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

// Network Mapper for Alchemy SDK
const getAlchemyNetwork = (chainId: number): Network => {
  switch (chainId) {
    case 8453: return Network.BASE_MAINNET;
    case 42220: return Network.CELO_MAINNET;
    case 42161: return Network.ARB_MAINNET;
    default: return Network.BASE_MAINNET;
  }
};

export function useBalances(
  address: string | undefined,
  chainId: number = 8453,
) {
  return useQuery({
    queryKey: ["token-balances", address, chainId],
    queryFn: async () => {
      if (!address || !ALCHEMY_KEY) return [];

      const config = {
        apiKey: ALCHEMY_KEY,
        network: getAlchemyNetwork(chainId),
      };

      const alchemy = new Alchemy(config);

      const response = await alchemy.core.getTokenBalances(address);
      return response.tokenBalances;
    },
    enabled: !!address && !!ALCHEMY_KEY,
    refetchInterval: 15000, // 15s refresh for performance/bank-grade accuracy
    staleTime: 5000,
  });
}
