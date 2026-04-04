/**
 * FX Remit Sovereign Network Registry
 * Centralized mapping of blockchain constants for Base, Arbitrum, and Celo.
 */

export interface NetworkConfig {
  chainId: number;
  name: string;
  gatewayAddress: `0x${string}`;
  uniswapRouter: `0x${string}`;
  weth: `0x${string}`;
  usdc: `0x${string}`;
  rpcUrl?: string;
}

export const NETWORKS: Record<number, NetworkConfig> = {
  // Base Mainnet
  8453: {
    chainId: 8453,
    name: 'Base',
    gatewayAddress: '0x30F6A8457F8E42371E204a9c103f2Bd42341dD0F',
    uniswapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
    weth: '0x4200000000000000000000000000000000000006',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  // Arbitrum One
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    gatewayAddress: '0xE8bc3B607CfE68F47000E3d200310D49041148Fc',
    uniswapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  // Celo Mainnet
  42220: {
    chainId: 42220,
    name: 'Celo',
    gatewayAddress: '0xF418217E3f81092eF44b81C5C8336e6A6fDB0E4b',
    uniswapRouter: '0x777A8255cA72412f0d706dc03C9D1987306B4CaD', // Mento Broker on Celo
    weth: '0x471EcE3750Da237f93B8E339c536989b8978a438', // Native CELO
    usdc: '0x765DE816845861e75A25fCA122bb6898B8B1282a', // cUSD
  },
};

/**
 * Returns the network config for a given chainId.
 */
export const getNetworkConfig = (chainId: number): NetworkConfig => {
  const config = NETWORKS[chainId];
  if (!config) {
    throw new Error(`Unsupported network with chainId: ${chainId}`);
  }
  return config;
};

/**
 * Common Constants
 */
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
