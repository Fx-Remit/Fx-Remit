import { NextRequest, NextResponse } from 'next/server';
import {
  Sep10Client,
  Sep24Client,
  fetchAnchorToml,
  getDefaultAnchor,
  keypairFromSecret,
  STELLAR_NETWORK_PASSPHRASE,
  getStellarNetwork,
  type StellarCorridor,
} from '@fx-remit/services';

export const dynamic = 'force-dynamic';

const CORRIDORS: StellarCorridor[] = ['NGN', 'KES'];

/**
 * Start SEP-24 interactive withdraw (sandbox/dev).
 * Not wired to production cash-out confirm yet.
 *
 * POST { corridor, amount, account? }
 * Server signs with STELLAR_TEST_SECRET when account omitted (dev only).
 */
export async function POST(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_STELLAR_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Stellar rail disabled' }, { status: 404 });
  }

  let body: { corridor?: string; amount?: string; account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const corridor = body.corridor?.toUpperCase() as StellarCorridor;
  const amount = body.amount ?? '1';

  if (!corridor || !CORRIDORS.includes(corridor)) {
    return NextResponse.json(
      { error: 'corridor required (NGN or KES)' },
      { status: 400 },
    );
  }

  const secret = process.env.STELLAR_TEST_SECRET;
  if (!secret && !body.account) {
    return NextResponse.json(
      { error: 'STELLAR_TEST_SECRET or account required for withdraw start' },
      { status: 400 },
    );
  }

  try {
    const network = getStellarNetwork();
    const passphrase = STELLAR_NETWORK_PASSPHRASE[network];
    const anchor = getDefaultAnchor(corridor, network);
    const toml = await fetchAnchorToml(anchor.homeDomain);

    if (!toml.webAuthEndpoint) {
      throw new Error(`Anchor ${anchor.id} missing WEB_AUTH_ENDPOINT`);
    }

    const keypair = secret ? keypairFromSecret(secret) : null;
    const account = body.account ?? keypair?.publicKey();

    if (!account || !keypair) {
      return NextResponse.json({ error: 'Unable to resolve Stellar account' }, { status: 400 });
    }

    const sep10 = new Sep10Client(toml.webAuthEndpoint, passphrase);
    const { token } = await sep10.authenticate(account, anchor.homeDomain, keypair);

    const sep24 = new Sep24Client();
    const withdraw = await sep24.startWithdrawInteractive({
      anchor,
      authToken: token,
      account,
      assetCode: anchor.usdcAssetCode,
      assetIssuer: anchor.usdcIssuer,
      amount,
      destinationAsset: sep24.corridorToDestinationAsset(corridor),
    });

    return NextResponse.json({
      success: true,
      rail: 'STELLAR',
      anchor_id: anchor.id,
      transaction_id: withdraw.id,
      interactive_url: withdraw.url,
      type: withdraw.type,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Withdraw start failed';
    console.error('[Stellar Withdraw Start]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
