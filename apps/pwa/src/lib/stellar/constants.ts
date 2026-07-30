/** Stellar constants — dual-rail alongside EVM (Celo/Base). */

export type StellarNetwork = 'public' | 'testnet';

export const USDC_MAINNET_ISSUER =
  'GA5ZSEJYB37JRC5AVAAWEQVKGE4GMLFRMDTOWNZTFJX5YGNH55SXRR5';

/**
 * Must match `USDC_TESTNET_ISSUER` in `@fx-remit/services` anchors.config
 * (SDF testanchor toml USDC, not classic Circle testnet USDC).
 */
export const USDC_TESTNET_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export const HORIZON_URL: Record<StellarNetwork, string> = {
  public: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

export function isStellarEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STELLAR_ENABLED === 'true';
}

export function getClientStellarNetwork(): StellarNetwork {
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'public' ? 'public' : 'testnet';
}

export function getUsdcIssuer(): string {
  return getClientStellarNetwork() === 'public' ? USDC_MAINNET_ISSUER : USDC_TESTNET_ISSUER;
}
