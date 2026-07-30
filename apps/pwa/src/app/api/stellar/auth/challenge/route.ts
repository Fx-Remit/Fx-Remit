import { NextRequest, NextResponse } from 'next/server';
import { Sep10Client, isValidPublicKey } from '@fx-remit/services';
import { isStellarApiEnabled, parseCorridor, resolveAnchorWebAuth } from '../../_lib';

export const dynamic = 'force-dynamic';

/**
 * Fetch a SEP-10 challenge for a Freighter (or other) account.
 * Client signs the returned XDR, then POSTs to /api/stellar/auth/token.
 *
 * POST { account, corridor }
 */
export async function POST(req: NextRequest) {
  if (!isStellarApiEnabled()) {
    return NextResponse.json({ error: 'Stellar rail disabled' }, { status: 404 });
  }

  let body: { account?: string; corridor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const corridor = parseCorridor(body.corridor);
  if (!corridor) {
    return NextResponse.json(
      { error: 'corridor required (NGN or KES)' },
      { status: 400 },
    );
  }

  const account = body.account?.trim();
  if (!account || !isValidPublicKey(account)) {
    return NextResponse.json({ error: 'Valid Stellar account (G…) required' }, { status: 400 });
  }

  try {
    const { passphrase, anchor, webAuthEndpoint } = await resolveAnchorWebAuth(corridor);
    const sep10 = new Sep10Client(webAuthEndpoint, passphrase);
    const challenge = await sep10.fetchChallenge(account, anchor.homeDomain);

    return NextResponse.json({
      success: true,
      rail: 'STELLAR',
      account,
      corridor,
      anchor_id: anchor.id,
      home_domain: anchor.homeDomain,
      transaction: challenge.transaction,
      network_passphrase: challenge.network_passphrase,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'SEP-10 challenge failed';
    console.error('[Stellar Auth Challenge]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
