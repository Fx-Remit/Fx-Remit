import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import {
  fetchAnchorToml,
  getDefaultAnchor,
  getStellarNetwork,
  STELLAR_NETWORK_PASSPHRASE,
  type StellarCorridor,
} from '@fx-remit/services';

export const STELLAR_CORRIDORS: StellarCorridor[] = ['NGN', 'KES'];

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

export function isStellarApiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STELLAR_ENABLED === 'true';
}

/**
 * Privy JWT required on Stellar mutate routes (#92).
 * Prevents unauthenticated callers from driving STELLAR_TEST_SECRET payments.
 */
export async function requirePrivyAuth(
  req: Request,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const claims = await privy.verifyAuthToken(authHeader.slice(7));
    return { userId: claims.userId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Stellar API] Privy verifyAuthToken failed:', message);
    return NextResponse.json(
      { error: 'Invalid authentication token' },
      { status: 401 },
    );
  }
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
