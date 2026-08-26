import { NextRequest, NextResponse } from 'next/server';
import {
  Sep10Client,
  Sep24Client,
  resolveSep24DestinationAsset,
  keypairFromSecret,
  isValidPublicKey,
  createStellarWithdrawStart,
  linkStellarPublicKey,
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
 * Optional persist (sandbox only): after SEP-10, links `stellar_public_key` to
 * the Privy user's row, then writes rail=STELLAR when link succeeds. If the user
 * is already linked to a different G… (`stellar_account_mismatch`), interactive
 * start still succeeds but persist is skipped — re-link UX is not wired yet.
 * Optional body `userId` is only used when no Privy user row exists yet and must
 * also match the SEP-10 account. Smoke without an app user returns persisted: false.
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
    let stellarAccountMismatch = false;

    // Link G… after successful SEP-10 so remittance persist / pay hash reuse work.
    // Conflict is a known UX gap (no re-link UI yet): still return interactive URL,
    // but skip persist so we never attribute funds to the wrong account.
    const linkResult = await linkStellarPublicKey({
      privyDid: privyAuth.userId,
      account,
    });

    let user: { id: string } | null = null;
    if (linkResult.status === 'ok') {
      user = { id: linkResult.id };
    } else if (linkResult.status === 'conflict') {
      stellarAccountMismatch = true;
    } else {
      user = await resolveStellarPersistUser({
        userId: bodyUserId,
        account,
      });
    }

    if (user) {
      // Fail closed: linked users must get a remittance row before interactive pay.
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
      ...(stellarAccountMismatch ? { stellar_account_mismatch: true } : {}),
      ...(remittanceId ? { remittance_id: remittanceId } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Withdraw start failed';
    console.error('[Stellar Withdraw Start]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
