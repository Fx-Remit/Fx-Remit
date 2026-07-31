import type { Keypair } from '@stellar/stellar-sdk';
import type { AnchorConfig, Sep24Transaction, StellarNetwork } from '../types/types.js';
import {
  Sep24Client,
  isSep24PastUserTransfer,
  isSep24TransferReady,
} from '../sep24/sep24.client.js';
import {
  submitSep24UsdcPayment,
  type SubmitSep24UsdcPaymentResult,
} from './stellar-payment.service.js';

type StellarRemittanceRow = { id: string; stellarPaymentHash: string | null };

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
  findRemittance?: (anchorTransactionId: string) => Promise<StellarRemittanceRow | null>;
  setPaymentHash?: (params: {
    anchorTransactionId: string;
    stellarPaymentHash: string;
  }) => Promise<{ id: string }>;
}

export interface CompleteSep24WithdrawPaymentResult {
  transferReady: Sep24Transaction;
  payment: SubmitSep24UsdcPaymentResult;
  /** Present when terminal poll ran (even if it timed out before terminal) */
  finalStatus?: Sep24Transaction;
  /** True when terminal poll ran but did not reach a terminal status in time */
  terminalTimedOut?: boolean;
  remittanceId?: string;
  /** True when an existing remittance payment hash was reused (no new Horizon submit) */
  paymentReused?: boolean;
}

/** Same-process mutex so concurrent pay calls for one SEP-24 id serialize. */
const payLocks = new Map<string, Promise<void>>();

async function withPayLock<T>(transactionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = payLocks.get(transactionId);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  payLocks.set(transactionId, gate);
  if (prev) {
    await prev.catch(() => undefined);
  }
  try {
    return await fn();
  } finally {
    release();
    if (payLocks.get(transactionId) === gate) {
      payLocks.delete(transactionId);
    }
  }
}

function paymentFromSep24(
  sep24: Sep24Transaction,
  hash: string,
  amountFallback?: string,
): SubmitSep24UsdcPaymentResult {
  const amount = sep24.amount_in ?? amountFallback;
  if (!amount) {
    throw new Error('SEP-24 amount_in missing and no amount fallback provided');
  }
  const destination = sep24.withdraw_anchor_account;
  const memo = sep24.withdraw_memo;
  if (!destination || !memo) {
    throw new Error('SEP-24 withdraw_anchor_account / withdraw_memo required');
  }
  return {
    hash,
    amount,
    destination,
    memo,
    memoType: sep24.withdraw_memo_type ?? 'text',
  };
}

/**
 * Sandbox Flow B: poll for memo → submit USDC Payment → optional terminal poll + persist.
 * Terminal-poll timeout does not fail the flow once Payment is on-chain.
 *
 * Mitigates double-submit via: same-process lock, DB payment-hash reuse, and a
 * final status re-check immediately before Horizon submit.
 */
export async function completeSep24WithdrawPayment(
  input: CompleteSep24WithdrawPaymentInput,
): Promise<CompleteSep24WithdrawPaymentResult> {
  return withPayLock(input.transactionId, () => completeSep24WithdrawPaymentLocked(input));
}

async function defaultFindRemittance(
  anchorTransactionId: string,
): Promise<StellarRemittanceRow | null> {
  const { findStellarRemittanceByAnchorTx } = await import(
    '../persist/stellar-transaction.service.js'
  );
  return findStellarRemittanceByAnchorTx(anchorTransactionId);
}

async function defaultSetPaymentHash(params: {
  anchorTransactionId: string;
  stellarPaymentHash: string;
}): Promise<{ id: string }> {
  const { setStellarPaymentHash } = await import(
    '../persist/stellar-transaction.service.js'
  );
  return setStellarPaymentHash(params);
}

async function completeSep24WithdrawPaymentLocked(
  input: CompleteSep24WithdrawPaymentInput,
): Promise<CompleteSep24WithdrawPaymentResult> {
  const sep24 = input.sep24Client ?? new Sep24Client();
  const submitPayment = input.submitPayment ?? submitSep24UsdcPayment;
  const findRemittance = input.findRemittance ?? defaultFindRemittance;
  const setPaymentHash = input.setPaymentHash ?? defaultSetPaymentHash;
  const transferServer = await sep24.getTransferServer(input.anchor);

  const transferReady = await sep24.pollUntilTransferReady({
    transferServer,
    authToken: input.authToken,
    transactionId: input.transactionId,
    intervalMs: input.pollIntervalMs,
    timeoutMs: input.transferReadyTimeoutMs,
  });

  // Reuse an already-recorded payment (retry / concurrent second caller after first persisted).
  const existing = await findRemittance(input.transactionId);
  if (existing?.stellarPaymentHash) {
    const payment = paymentFromSep24(
      transferReady,
      existing.stellarPaymentHash,
      input.amount,
    );
    const afterReuse = await pollTerminalIfNeeded(sep24, input, transferServer);
    return {
      transferReady,
      payment,
      remittanceId: existing.id,
      paymentReused: true,
      ...afterReuse,
    };
  }

  // TOCTOU: confirm still awaiting user transfer immediately before submit.
  const latest = await sep24.getTransactionReliable(
    transferServer,
    input.authToken,
    input.transactionId,
  );
  if (!isSep24TransferReady(latest)) {
    if (isSep24PastUserTransfer(latest)) {
      throw new Error(
        `SEP-24 transaction ${input.transactionId} is no longer awaiting user transfer (status: ${latest.status}) — do not resubmit Payment`,
      );
    }
    throw new Error(
      `SEP-24 transaction ${input.transactionId} is not transfer-ready before Payment (status: ${latest.status})`,
    );
  }

  const payment = await submitPayment({
    network: input.network,
    keypair: input.keypair,
    sep24: latest,
    assetCode: input.anchor.usdcAssetCode,
    assetIssuer: input.anchor.usdcIssuer,
    amount: input.amount,
  });

  let remittanceId: string | undefined;
  if (input.persistPaymentHash) {
    try {
      const row = await setPaymentHash({
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

  const afterPay = await pollTerminalIfNeeded(sep24, input, transferServer);
  return {
    transferReady: latest,
    payment,
    remittanceId,
    ...afterPay,
  };
}

async function pollTerminalIfNeeded(
  sep24: Sep24Client,
  input: CompleteSep24WithdrawPaymentInput,
  transferServer: string,
): Promise<{
  finalStatus?: Sep24Transaction;
  terminalTimedOut?: boolean;
}> {
  if (!input.terminalTimeoutMs || input.terminalTimeoutMs <= 0) {
    return {};
  }
  const terminal = await sep24.pollUntilTerminal({
    transferServer,
    authToken: input.authToken,
    transactionId: input.transactionId,
    intervalMs: input.pollIntervalMs,
    timeoutMs: input.terminalTimeoutMs,
  });
  return {
    finalStatus: terminal.tx,
    terminalTimedOut: terminal.timedOut,
  };
}
