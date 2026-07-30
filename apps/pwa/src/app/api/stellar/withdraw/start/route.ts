import { NextRequest, NextResponse } from 'next/server';
import {
  Sep10Client,
  Sep24Client,
  resolveSep24DestinationAsset,
  keypairFromSecret,
  isValidPublicKey,
  type StellarCorridor,
} from '@fx-remit/services';
import { isStellarApiEnabled, parseCorridor, resolveAnchorWebAuth } from '../../_lib';

export const dynamic = 'force-dynamic';

/**
 * Start SEP-24 interactive withdraw (sandbox/dev).
 * Not wired to production cash-out confirm yet.
 *
 * Auth (first match):
 * 1. authToken + account — Freighter SEP-10 JWT already obtained
 * 2. signedChallenge + account — server exchanges signed XDR for JWT
 * 3. STELLAR_TEST_SECRET — server signs (smoke / CI)
 *
 * POST { corridor, amount, account?, authToken?, signedChallenge? }
 */
export async function POST(req: NextRequest) {
  if (!isStellarApiEnabled()) {
    return NextResponse.json({ error: 'Stellar rail disabled' }, { status: 404 });
  }

  let body: {
    corridor?: string;
    amount?: string;
    account?: string;
    authToken?: string;
    signedChallenge?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const corridor = parseCorridor(body.corridor);
  const amount = body.amount ?? '1';

  if (!corridor) {
    return NextResponse.json(
      { error: 'corridor required (NGN or KES)' },
      { status: 400 },
    );
  }

  const secret = process.env.STELLAR_TEST_SECRET;
  const authToken = body.authToken?.trim();
  const signedChallenge = body.signedChallenge?.trim();
  const bodyAccount = body.account?.trim();

  if (bodyAccount && !isValidPublicKey(bodyAccount)) {
    return NextResponse.json({ error: 'Invalid Stellar account (G…)' }, { status: 400 });
  }

  if (!authToken && !signedChallenge && !secret) {
    return NextResponse.json(
      {
        error:
          'Provide authToken or signedChallenge (Freighter), or set STELLAR_TEST_SECRET for smoke',
      },
      { status: 400 },
    );
  }

  if ((authToken || signedChallenge) && !bodyAccount) {
    return NextResponse.json(
      { error: 'account required when using authToken or signedChallenge' },
      { status: 400 },
    );
  }

  try {
    const { passphrase, anchor, webAuthEndpoint } = await resolveAnchorWebAuth(corridor);
    const sep10 = new Sep10Client(webAuthEndpoint, passphrase);

    let token: string;
    let account: string;

    if (authToken && bodyAccount) {
      token = authToken;
      account = bodyAccount;
    } else if (signedChallenge && bodyAccount) {
      token = await sep10.submitTokenRequest(signedChallenge);
      account = bodyAccount;
    } else if (secret) {
      const keypair = keypairFromSecret(secret);
      account = bodyAccount ?? keypair.publicKey();
      const auth = await sep10.authenticate(account, anchor.homeDomain, keypair);
      token = auth.token;
    } else {
      return NextResponse.json({ error: 'Unable to resolve SEP-10 credentials' }, { status: 400 });
    }

    const sep24 = new Sep24Client();
    const destinationAsset = resolveSep24DestinationAsset(anchor, corridor as StellarCorridor);
    const withdraw = await sep24.startWithdrawInteractive({
      anchor,
      authToken: token,
      account,
      assetCode: anchor.usdcAssetCode,
      assetIssuer: anchor.usdcIssuer,
      amount,
      destinationAsset,
    });

    return NextResponse.json({
      success: true,
      rail: 'STELLAR',
      anchor_id: anchor.id,
      corridor,
      account,
      destination_asset: destinationAsset,
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
