#!/usr/bin/env node
/**
 * SEP-24 withdraw pay smoke (sandbox) against SDF testanchor.
 *
 * Flow B: poll until memo ready → submit USDC Payment → poll terminal status.
 *
 * Prerequisites (Friendbot-funded STELLAR_TEST_SECRET account):
 *   1. XLM via Friendbot
 *   2. Trustline to testanchor USDC
 *   3. USDC balance ≥ amount
 *   4. Complete interactive KYC at the printed URL (or resume with STELLAR_SEP24_TX_ID)
 *
 * Usage:
 *   STELLAR_TEST_SECRET=S... pnpm --filter @fx-remit/services stellar:sep24-pay-test
 *   STELLAR_TEST_SECRET=S... STELLAR_SEP24_TX_ID=<id> pnpm --filter @fx-remit/services stellar:sep24-pay-test
 *
 * Env:
 *   STELLAR_TEST_AMOUNT (default 1)
 *   STELLAR_TEST_CORRIDOR (NGN|KES)
 *   STELLAR_SEP24_TRANSFER_TIMEOUT_MS (default 300000 — time for interactive KYC)
 *   STELLAR_SEP24_TERMINAL_TIMEOUT_MS (default 180000)
 */
import axios from 'axios';
import { Sep10Client, keypairFromSecret } from '../sep10/sep10.client.js';
import { Sep24Client, resolveSep24DestinationAsset } from '../sep24/sep24.client.js';
import { clearAnchorTomlCache, fetchAnchorToml } from '../config/anchor-toml.js';
import {
  TEST_ANCHOR,
  STELLAR_NETWORK_PASSPHRASE,
  getStellarNetwork,
} from '../config/anchors.config.js';
import { completeSep24WithdrawPayment } from './complete-sep24-withdraw.js';

async function main() {
  const secret = process.env.STELLAR_TEST_SECRET;
  if (!secret) {
    throw new Error('Set STELLAR_TEST_SECRET for sep24 pay smoke');
  }

  clearAnchorTomlCache();

  const network = getStellarNetwork();
  const passphrase = STELLAR_NETWORK_PASSPHRASE[network];
  const anchor = TEST_ANCHOR;
  const keypair = keypairFromSecret(secret);
  const amount = process.env.STELLAR_TEST_AMOUNT ?? '1';
  const corridor = process.env.STELLAR_TEST_CORRIDOR?.toUpperCase() === 'KES' ? 'KES' : 'NGN';
  const existingTxId = process.env.STELLAR_SEP24_TX_ID?.trim();
  const transferReadyTimeoutMs = Number(
    process.env.STELLAR_SEP24_TRANSFER_TIMEOUT_MS ?? 300_000,
  );
  const terminalTimeoutMs = Number(
    process.env.STELLAR_SEP24_TERMINAL_TIMEOUT_MS ?? 180_000,
  );

  console.log(`Network: ${network}`);
  console.log(`Anchor: ${anchor.homeDomain}`);
  console.log(`Account: ${keypair.publicKey()}`);
  console.log(`Amount (USDC): ${amount}`);

  const toml = await fetchAnchorToml(anchor.homeDomain);
  if (!toml.webAuthEndpoint || !toml.transferServerSep24) {
    throw new Error('Test anchor missing SEP-10 or SEP-24 endpoints');
  }
  if (!toml.signingKey) {
    throw new Error('Test anchor missing SIGNING_KEY');
  }

  const sep10 = new Sep10Client(toml.webAuthEndpoint, passphrase, toml.signingKey);
  const { token } = await sep10.authenticate(
    keypair.publicKey(),
    anchor.homeDomain,
    keypair,
  );

  let transactionId = existingTxId;
  if (!transactionId) {
    const destinationAsset = resolveSep24DestinationAsset(anchor, corridor);
    const sep24 = new Sep24Client();
    const withdraw = await sep24.startWithdrawInteractive({
      anchor,
      authToken: token,
      account: keypair.publicKey(),
      assetCode: anchor.usdcAssetCode,
      assetIssuer: anchor.usdcIssuer,
      amount,
      destinationAsset,
    });
    transactionId = withdraw.id;
    console.log('SEP-24 withdraw started');
    console.log(`Transaction id: ${transactionId}`);
    console.log(`Interactive URL (complete KYC if needed): ${withdraw.url}`);
    console.log('Polling for withdraw_memo / withdraw_anchor_account…');
  } else {
    console.log(`Resuming SEP-24 tx: ${transactionId}`);
    const sep24 = new Sep24Client();
    const transferServer = await sep24.getTransferServer(anchor);
    const current = await sep24.getTransactionReliable(transferServer, token, transactionId);
    console.log(`Current SEP-24 status: ${current.status}`);
    if (current.withdraw_memo) {
      console.log(`Memo already present: ${current.withdraw_memo}`);
    } else {
      console.log(
        'No withdraw_memo yet — open the interactive URL from sep24-test and finish KYC, then re-run.',
      );
    }
    console.log('Polling until pending_user_transfer_start + memo, then submitting USDC Payment…');
  }

  const result = await completeSep24WithdrawPayment({
    anchor,
    network,
    authToken: token,
    transactionId,
    keypair,
    amount,
    pollIntervalMs: 3_000,
    transferReadyTimeoutMs,
    terminalTimeoutMs,
    // Smoke often has no app DB user — skip unless explicitly enabled
    persistPaymentHash: process.env.STELLAR_PERSIST === 'true',
  });

  console.log('Payment submitted');
  console.log(`Horizon hash: ${result.payment.hash}`);
  console.log(`Destination: ${result.payment.destination}`);
  console.log(`Memo (${result.payment.memoType}): ${result.payment.memo}`);
  console.log(`Amount: ${result.payment.amount}`);
  if (result.remittanceId) {
    console.log(`Persisted remittance: ${result.remittanceId}`);
  }
  if (result.finalStatus) {
    console.log(`Final SEP-24 status: ${result.finalStatus.status}`);
    if (result.finalStatus.stellar_transaction_id) {
      console.log(`Anchor stellar_transaction_id: ${result.finalStatus.stellar_transaction_id}`);
    }
  }
  if (result.terminalTimedOut) {
    console.log('Terminal status poll timed out (payment already submitted — safe to stop)');
  }
}

main().catch((err) => {
  if (axios.isAxiosError(err)) {
    const url = err.config?.url ?? '';
    const detail = err.response?.data ?? err.message;
    console.error(
      '[sep24-pay-testnet]',
      typeof detail === 'string' ? detail : JSON.stringify(detail),
      url ? `url=${url}` : '',
      err.code ? `code=${err.code}` : '',
    );
  } else {
    console.error('[sep24-pay-testnet]', err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
