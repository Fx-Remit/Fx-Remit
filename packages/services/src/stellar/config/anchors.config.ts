import type { AnchorConfig, StellarCorridor, StellarNetwork } from '../types/types.js';

/** Circle USDC on Stellar mainnet */
export const USDC_MAINNET_ISSUER =
  'GA5ZSEJYB37JRC5AVAAWEQVKGE4GMLFRMDTOWNZTFJX5YGNH55SXRR5';

/**
 * Classic Circle USDC issuer on Stellar testnet (ecosystem default).
 * Not the same asset as SDF testanchor's published USDC — keep for reference only.
 */
export const CIRCLE_USDC_TESTNET_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCN7DABMYZ4PKCFXLJ2J4G5UO7K4R6WXXZ3VY';

/**
 * USDC issuer from SDF testanchor `stellar.toml` `[[CURRENCIES]]` (code = USDC).
 * Re-check if https://testanchor.stellar.org/.well-known/stellar.toml changes.
 * SEP-24/38 and Freighter balance for this rail must use this issuer.
 */
export const USDC_TESTNET_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export const STELLAR_NETWORK_PASSPHRASE: Record<StellarNetwork, string> = {
  public: 'Public Global Stellar Network ; September 2015',
  testnet: 'Test SDF Network ; September 2015',
};

export const HORIZON_URL: Record<StellarNetwork, string> = {
  public: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

/**
 * Production anchor stubs — verify stellar.toml + SEP support before mainnet.
 * @see https://anchors.stellar.org/
 */
export const PRODUCTION_ANCHORS: AnchorConfig[] = [
  {
    id: 'link',
    name: 'Link',
    homeDomain: 'link.wallet',
    corridors: ['NGN'],
    usdcAssetCode: 'USDC',
    usdcIssuer: USDC_MAINNET_ISSUER,
    priority: 1,
    methods: ['bank'],
  },
  {
    id: 'flutterwave',
    name: 'Flutterwave',
    homeDomain: 'flutterwave.com',
    corridors: ['NGN', 'KES'],
    usdcAssetCode: 'USDC',
    usdcIssuer: USDC_MAINNET_ISSUER,
    priority: 2,
    methods: ['bank', 'mobile_money'],
  },
  {
    id: 'clickpesa',
    name: 'ClickPesa',
    homeDomain: 'clickpesa.com',
    corridors: ['KES'],
    usdcAssetCode: 'USDC',
    usdcIssuer: USDC_MAINNET_ISSUER,
    priority: 1,
    methods: ['bank', 'mobile_money'],
  },
  {
    id: 'impalapay',
    name: 'ImpalaPay',
    homeDomain: 'impalapay.com',
    corridors: ['KES'],
    usdcAssetCode: 'USDC',
    usdcIssuer: USDC_MAINNET_ISSUER,
    priority: 2,
    methods: ['bank', 'mobile_money'],
  },
];

/** SDF test anchor for SEP development */
export const TEST_ANCHOR: AnchorConfig = {
  id: 'testanchor',
  name: 'Stellar Test Anchor',
  homeDomain: 'testanchor.stellar.org',
  corridors: ['NGN', 'KES'],
  usdcAssetCode: 'USDC',
  usdcIssuer: USDC_TESTNET_ISSUER,
  priority: 0,
  methods: ['bank'],
};

export function getStellarNetwork(): StellarNetwork {
  return process.env.STELLAR_NETWORK === 'public' ? 'public' : 'testnet';
}

export function getAnchorsForCorridor(
  corridor: StellarCorridor,
  network: StellarNetwork = getStellarNetwork(),
): AnchorConfig[] {
  const pool = network === 'testnet' ? [TEST_ANCHOR, ...PRODUCTION_ANCHORS] : PRODUCTION_ANCHORS;
  return pool
    .filter((a) => a.corridors.includes(corridor))
    .sort((a, b) => a.priority - b.priority);
}

export function getDefaultAnchor(
  corridor: StellarCorridor,
  network: StellarNetwork = getStellarNetwork(),
): AnchorConfig {
  const anchors = getAnchorsForCorridor(corridor, network);
  if (anchors.length === 0) {
    throw new Error(`No anchor configured for corridor ${corridor}`);
  }
  return network === 'testnet' ? TEST_ANCHOR : anchors[0];
}
