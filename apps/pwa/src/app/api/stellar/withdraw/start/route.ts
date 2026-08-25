import { NextRequest, NextResponse } from 'next/server';
import {
  Sep10Client,
  Sep24Client,
  resolveSep24DestinationAsset,
  keypairFromSecret,
  isValidPublicKey,
  createStellarWithdrawStart,
  resolveStellarPersistUser,
  type StellarCorridor,
} from '@fx-remit/services';
import {
  isStellarApiEnabled,
  parseCorridor,
  requirePrivyAuth,
  requireStellarTestSecretOperator,
  resolveAnchorWebAuth,
} from '../../_lib';

export const dynamic = 'force-dynamic';

/**
 * Start SEP-24 interactive withdraw (sandbox/dev).
 * Not wired to production cash-out confirm yet.
 *
 * Requires Privy Bearer JWT (#92) before any SEP-10 / STELLAR_TEST_SECRET path.
 * Server-secret smoke additionally requires STELLAR_TEST_OPERATOR_PRIVY_DIDS.
 *
 * Auth (first match):
 * 1. authToken + account — Freighter SEP-10 JWT already obtained
 * 2. signedChallenge + account — server exchanges signed XDR for JWT
 * 3. STELLAR_TEST_SECRET — server signs (smoke / CI; operator DID only)
 *
 * Optional persist (sandbox only): writes rail=STELLAR only when a user is
 * linked to the SEP-10 `account` (`stellar_public_key` match). Optional
 * `userId` must also have that same key — body id alone is never trusted.
 * Smoke without an app user still returns the interactive URL (persisted: false).
 *
 * POST { corridor, amount, account?, authToken?, signedChallenge?, userId? }
 */
export async function POST(req: NextRequest) {
  if (!isStellarApiEnabled()) {
    return NextResponse.json({ error: 'Stellar rail disabled' }, { status: 404 });
  }

  const privyAuth = await requirePrivyAuth(req);
  if (privyAuth instanceof NextResponse) return privyAuth;

  let body: {
    corridor?: string;
    amount?: string;
    account?: string;
    authToken?: string;
    signedChallenge?: string;
    userId?: string;
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
  const bodyUserId = body.userId?.trim();

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
    const { passphrase, anchor, webAuthEndpoint, signingKey } = await resolveAnchorWebAuth(corridor);
    const sep10 = new Sep10Client(webAuthEndpoint, passphrase, signingKey);

    let token: string;
    let account: string;

    if (authToken && bodyAccount) {
      token = authToken;
      account = bodyAccount;
    } else if (signedChallenge && bodyAccount) {
      token = await sep10.submitTokenRequest(signedChallenge);
      account = bodyAccount;
    } else if (secret) {
      const operatorDenied = requireStellarTestSecretOperator(privyAuth.userId);
      if (operatorDenied) return operatorDenied;

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

    let persisted = false;
    let remittanceId: string | undefined;

    const user = await resolveStellarPersistUser({
      userId: bodyUserId,
      account,
    });

    if (user) {
      try {
        const row = await createStellarWithdrawStart({
          userId: user.id,
          account,
          anchorTransactionId: withdraw.id,
          corridor,
          amountUsd: amount,
          anchorId: anchor.id,
        });
        persisted = true;
        remittanceId = row.id;
      } catch (persistErr: unknown) {
        // Do not fail SEP-24 start if sandbox DB write fails
        const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
        console.error('[Stellar Withdraw Start] persist skipped:', msg);
      }
    }

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
      persisted,
      ...(remittanceId ? { remittance_id: remittanceId } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Withdraw start failed';
    console.error('[Stellar Withdraw Start]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
