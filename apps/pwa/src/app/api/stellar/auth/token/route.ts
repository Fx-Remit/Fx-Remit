import { NextRequest, NextResponse } from 'next/server';
import { Sep10Client } from '@fx-remit/services';
import { isStellarApiEnabled, parseCorridor, resolveAnchorWebAuth } from '../../_lib';

export const dynamic = 'force-dynamic';

/**
 * Exchange a Freighter-signed SEP-10 challenge XDR for an anchor JWT.
 *
 * POST { signedTransaction, corridor }
 */
export async function POST(req: NextRequest) {
  if (!isStellarApiEnabled()) {
    return NextResponse.json({ error: 'Stellar rail disabled' }, { status: 404 });
  }

  let body: { signedTransaction?: string; corridor?: string };
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

  const signedTransaction = body.signedTransaction?.trim();
  if (!signedTransaction) {
    return NextResponse.json(
      { error: 'signedTransaction (Freighter-signed XDR) required' },
      { status: 400 },
    );
  }

  try {
    const { passphrase, anchor, webAuthEndpoint, signingKey } = await resolveAnchorWebAuth(corridor);
    const sep10 = new Sep10Client(webAuthEndpoint, passphrase, signingKey);
    const token = await sep10.submitTokenRequest(signedTransaction);

    return NextResponse.json({
      success: true,
      rail: 'STELLAR',
      corridor,
      anchor_id: anchor.id,
      home_domain: anchor.homeDomain,
      token,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'SEP-10 token exchange failed';
    console.error('[Stellar Auth Token]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
