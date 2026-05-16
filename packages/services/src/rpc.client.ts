import { createPublicClient, http } from 'viem';
import { celo, base, mainnet } from 'viem/chains';

const RPC_URLS: Record<number, string> = {
  42220: process.env.CELO_RPC_URL || 'https://forno.celo.org',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  1: process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com',
};

const CHAINS: Record<number, any> = {
  42220: celo,
  8453: base,
  1: mainnet,
};

export class RpcClient {
  private static clients: Record<number, any> = {};

  static getClient(chainId: number) {
    if (!this.clients[chainId]) {
      this.clients[chainId] = createPublicClient({
        chain: CHAINS[chainId] || celo,
        transport: http(RPC_URLS[chainId]),
      });
    }
    return this.clients[chainId];
  }

  /**
   * Returns the current block height for a specific chain.
   */
  static async getBlockNumber(chainId: number): Promise<bigint> {
    const client = this.getClient(chainId);
    return await client.getBlockNumber();
  }
}
