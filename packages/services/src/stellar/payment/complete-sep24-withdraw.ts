import type { Keypair } from '@stellar/stellar-sdk';
import type { AnchorConfig, Sep24Transaction, StellarNetwork } from '../types/types.js';
import { Sep24Client } from '../sep24/sep24.client.js';
import {
  submitSep24UsdcPayment,
  type SubmitSep24UsdcPaymentResult,
} from './stellar-payment.service.js';
import { setStellarPaymentHash } from '../persist/stellar-transaction.service.js';

export interface CompleteSep24WithdrawPaymentInput {
  anchor: AnchorConfig;
  network: StellarNetwork;
  authToken: string;
  transactionId: string;
  keypair: Keypair;
  /** Used when SEP-24 amount_in is absent */
  amount?: string;
  pollIntervalMs?: number;
  transferReadyTimeoutMs?: number;
  /** When set (>0), poll after payment until terminal */
  terminalTimeoutMs?: number;
  /** When true and a STELLAR remittance exists, store payment hash */
  persistPaymentHash?: boolean;
  /** Test seam */
  submitPayment?: typeof submitSep24UsdcPayment;
  sep24Client?: Sep24Client;
}

export interface CompleteSep24WithdrawPaymentResult {
  transferReady: Sep24Transaction;
  payment: SubmitSep24UsdcPaymentResult;
  /** Present when terminal poll ran (even if it timed out before terminal) */
  finalStatus?: Sep24Transaction;
  /** True when terminal poll ran but did not reach a terminal status in time */
  terminalTimedOut?: boolean;
  remittanceId?: string;
}

/**
 * Sandbox Flow B: poll for memo → submit USDC Payment → optional terminal poll + persist.
 * Terminal-poll timeout does not fail the flow once Payment is on-chain.
 */
export async function completeSep24WithdrawPayment(
  input: CompleteSep24WithdrawPaymentInput,
): Promise<CompleteSep24WithdrawPaymentResult> {
  const sep24 = input.sep24Client ?? new Sep24Client();
  const submitPayment = input.submitPayment ?? submitSep24UsdcPayment;
  const transferServer = await sep24.getTransferServer(input.anchor);

  const transferReady = await sep24.pollUntilTransferReady({
    transferServer,
    authToken: input.authToken,
    transactionId: input.transactionId,
    intervalMs: input.pollIntervalMs,
    timeoutMs: input.transferReadyTimeoutMs,
  });

  const payment = await submitPayment({
    network: input.network,
    keypair: input.keypair,
    sep24: transferReady,
    assetCode: input.anchor.usdcAssetCode,
    assetIssuer: input.anchor.usdcIssuer,
    amount: input.amount,
  });

  let remittanceId: string | undefined;
  if (input.persistPaymentHash) {
    try {
      const row = await setStellarPaymentHash({
        anchorTransactionId: input.transactionId,
        stellarPaymentHash: payment.hash,
      });
      remittanceId = row.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/No STELLAR remittance/.test(msg)) {
        throw err;
      }
    }
  }

  let finalStatus: Sep24Transaction | undefined;
  let terminalTimedOut: boolean | undefined;
  if (input.terminalTimeoutMs && input.terminalTimeoutMs > 0) {
    const terminal = await sep24.pollUntilTerminal({
      transferServer,
      authToken: input.authToken,
      transactionId: input.transactionId,
      intervalMs: input.pollIntervalMs,
      timeoutMs: input.terminalTimeoutMs,
    });
    finalStatus = terminal.tx;
    terminalTimedOut = terminal.timedOut;
  }

  return { transferReady, payment, finalStatus, terminalTimedOut, remittanceId };
}
