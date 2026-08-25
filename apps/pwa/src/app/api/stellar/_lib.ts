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

/** Comma-separated Privy DIDs allowed to use STELLAR_TEST_SECRET on HTTP routes. */
export function stellarTestOperatorPrivyDids(): string[] {
  return (process.env.STELLAR_TEST_OPERATOR_PRIVY_DIDS ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

/**
 * STELLAR_TEST_SECRET must only be used by allowlisted Privy DIDs.
 * Open Privy signup alone must not spend the shared sandbox hot wallet.
 */
export function requireStellarTestSecretOperator(
  privyUserId: string,
): NextResponse | null {
  const allowed = stellarTestOperatorPrivyDids();
  if (allowed.length === 0) {
    return NextResponse.json(
      {
        error:
          'STELLAR_TEST_SECRET payments require STELLAR_TEST_OPERATOR_PRIVY_DIDS (comma-separated Privy DIDs)',
      },
      { status: 403 },
    );
  }
  if (!allowed.includes(privyUserId)) {
    return NextResponse.json(
      { error: 'Not authorized to use STELLAR_TEST_SECRET' },
      { status: 403 },
    );
  }
  return null;
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
  if (!toml.signingKey) {
    throw new Error(`Anchor ${anchor.id} missing SIGNING_KEY`);
  }

  return {
    network,
    passphrase,
    anchor,
    toml,
    webAuthEndpoint: toml.webAuthEndpoint,
    signingKey: toml.signingKey,
  };
}
