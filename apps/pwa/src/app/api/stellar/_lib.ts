import {
  fetchAnchorToml,
  getDefaultAnchor,
  getStellarNetwork,
  STELLAR_NETWORK_PASSPHRASE,
  type StellarCorridor,
} from '@fx-remit/services';

export const STELLAR_CORRIDORS: StellarCorridor[] = ['NGN', 'KES'];

export function isStellarApiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STELLAR_ENABLED === 'true';
}

export function parseCorridor(raw: string | undefined): StellarCorridor | null {
  const corridor = raw?.toUpperCase() as StellarCorridor;
  if (!corridor || !STELLAR_CORRIDORS.includes(corridor)) {
    return null;
  }
  return corridor;
}

/** Resolve corridor → default anchor + SEP-10 web auth endpoint. */
export async function resolveAnchorWebAuth(corridor: StellarCorridor) {
  const network = getStellarNetwork();
  const passphrase = STELLAR_NETWORK_PASSPHRASE[network];
  const anchor = getDefaultAnchor(corridor, network);
  const toml = await fetchAnchorToml(anchor.homeDomain);

  if (!toml.webAuthEndpoint) {
    throw new Error(`Anchor ${anchor.id} missing WEB_AUTH_ENDPOINT`);
  }

  return {
    network,
    passphrase,
    anchor,
    toml,
    webAuthEndpoint: toml.webAuthEndpoint,
  };
}
