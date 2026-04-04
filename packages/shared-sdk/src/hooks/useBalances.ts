import { useState, useEffect } from "react";
import { Alchemy, Network, TokenBalanceType } from "alchemy-sdk";

const config = {
  apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  network: Network.ETH_MAINNET, // Defaulting to Ethereum for tokens; update based on ChainID in logic
};

const alchemy = new Alchemy(config);

export function useBalances(
  address: string | undefined,
  chainId: number = 8453,
) {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;

    const fetchBalances = async () => {
      setLoading(true);
      try {
        const response = await alchemy.nft.getNftsForOwner(address);

        const tokenBalances = await alchemy.core.getTokenBalances(address);
        setBalances(tokenBalances.tokenBalances);
      } catch (error) {
        console.error("[useBalances] Fetch Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, [address, chainId]);

  return { balances, loading };
}
