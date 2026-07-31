import { NextRequest, NextResponse } from 'next/server';
import {
  Sep10Client,
  keypairFromSecret,
  isValidPublicKey,
  completeSep24WithdrawPayment,
} from '@fx-remit/services';
import { isStellarApiEnabled, parseCorridor, resolveAnchorWebAuth } from '../../_lib';

export const dynamic = 'force-dynamic';

/**
 * Sandbox: after SEP-24 withdraw start, poll for memo → submit USDC Payment → poll status.
 * Server keypair path first (STELLAR_TEST_SECRET). Freighter authToken + account also accepted
 * only when STELLAR_TEST_SECRET is set (server still signs the Payment).
 *
 * POST {
 *   corridor, transaction_id, amount?,
 *   authToken?, signedChallenge?, account?,
 *   persistPaymentHash?, waitForTerminal?
 * }
 */
export async function POST(req: NextRequest) {
  if (!isStellarApiEnabled()) {
    return NextResponse.json({ error: 'Stellar rail disabled' }, { status: 404 });
  }

  const secret = process.env.STELLAR_TEST_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'STELLAR_TEST_SECRET required to sign sandbox USDC Payment (Freighter payment path not wired yet)',
      },
      { status: 400 },
    );
  }

  let body: {
    corridor?: string;
    transaction_id?: string;
    amount?: string;
    account?: string;
    authToken?: string;
    signedChallenge?: string;
    persistPaymentHash?: boolean;
    waitForTerminal?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const corridor = parseCorridor(body.corridor);
  const transactionId = body.transaction_id?.trim();
  if (!corridor) {
    return NextResponse.json({ error: 'corridor required (NGN or KES)' }, { status: 400 });
  }
  if (!transactionId) {
    return NextResponse.json({ error: 'transaction_id required' }, { status: 400 });
  }

  const authToken = body.authToken?.trim();
  const signedChallenge = body.signedChallenge?.trim();
  const bodyAccount = body.account?.trim();
  if (bodyAccount && !isValidPublicKey(bodyAccount)) {
    return NextResponse.json({ error: 'Invalid Stellar account (G…)' }, { status: 400 });
  }

  try {
    const { network, passphrase, anchor, webAuthEndpoint } =
      await resolveAnchorWebAuth(corridor);
    const sep10 = new Sep10Client(webAuthEndpoint, passphrase);
    const keypair = keypairFromSecret(secret);
    const account = bodyAccount ?? keypair.publicKey();

    let token: string;
    if (authToken) {
      token = authToken;
    } else if (signedChallenge) {
      token = await sep10.submitTokenRequest(signedChallenge);
    } else {
      const auth = await sep10.authenticate(account, anchor.homeDomain, keypair);
      token = auth.token;
    }

    const result = await completeSep24WithdrawPayment({
      anchor,
      network,
      authToken: token,
      transactionId,
      keypair,
      amount: body.amount,
      pollIntervalMs: 2_000,
      transferReadyTimeoutMs: Number(
        process.env.STELLAR_SEP24_TRANSFER_TIMEOUT_MS ?? 300_000,
      ),
      terminalTimeoutMs: body.waitForTerminal === false ? 0 : Number(
        process.env.STELLAR_SEP24_TERMINAL_TIMEOUT_MS ?? 180_000,
      ),
      persistPaymentHash: body.persistPaymentHash !== false,
    });

    return NextResponse.json({
      success: true,
      rail: 'STELLAR',
      transaction_id: transactionId,
      status: result.finalStatus?.status ?? result.transferReady.status,
      withdraw_anchor_account: result.payment.destination,
      withdraw_memo: result.payment.memo,
      withdraw_memo_type: result.payment.memoType,
      amount: result.payment.amount,
      stellar_payment_hash: result.payment.hash,
      ...(result.terminalTimedOut ? { terminal_timed_out: true } : {}),
      ...(result.remittanceId ? { remittance_id: result.remittanceId } : {}),
      ...(result.finalStatus?.stellar_transaction_id
        ? { stellar_transaction_id: result.finalStatus.stellar_transaction_id }
        : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Withdraw pay failed';
    console.error('[Stellar Withdraw Pay]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
