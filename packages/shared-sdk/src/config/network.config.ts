/**
 * FX Remit network registry — supported EVM chains: Base and Celo only.
 */

export interface NetworkConfig {
  chainId: number;
  name: string;
  gatewayAddress: `0x${string}`;
  uniswapRouter: `0x${string}`;
  weth: `0x${string}`;
  usdc: `0x${string}`;
  rpcUrl?: string;
  /** FXRemitV3Router */
  routerAddress?: `0x${string}`;
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
    routerAddress: '0x785a7A71642b68A87deBeEdBF2151C51501Fe408',
  },
  // Celo Mainnet
  42220: {
    chainId: 42220,
    name: 'Celo',
    gatewayAddress: '0xF418217E3f81092eF44b81C5C8336e6A6fDB0E4b',
    uniswapRouter: '0x777A8255cA72412f0d706dc03C9D1987306B4CaD', // Mento Broker
    weth: '0x471EcE3750Da237f93B8E339c536989b8978a438', // Native CELO
    usdc: '0x765DE816845861e75A25fCA122bb6898B8B1282a', // cUSD
    routerAddress: '0x767B35703C98f63e71aB61d68a406931ADdb3FeB',
  },
};

export const getNetworkConfig = (chainId: number): NetworkConfig => {
  const config = NETWORKS[chainId];
  if (!config) {
    throw new Error(
      `Unsupported network chainId ${chainId}. FX Remit EVM supports Base (8453) and Celo (42220) only.`,
    );
  }
  return config;
};

export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export const SUPPORTED_EVM_CHAIN_IDS = [8453, 42220] as const;
