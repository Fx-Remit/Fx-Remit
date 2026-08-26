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
import type { ClaimStellarPaymentSlotResult } from '../persist/stellar-transaction.service.js';

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
  /**
   * When true (default on HTTP pay), require a STELLAR remittance, claim before
   * Horizon submit, and fail closed if hash persist fails.
   */
  persistPaymentHash?: boolean;
  /** Test seam */
  submitPayment?: typeof submitSep24UsdcPayment;
  sep24Client?: Sep24Client;
  findRemittance?: (anchorTransactionId: string) => Promise<StellarRemittanceRow | null>;
  setPaymentHash?: (params: {
    anchorTransactionId: string;
    stellarPaymentHash: string;
  }) => Promise<{ id: string }>;
  claimPaymentSlot?: (
    anchorTransactionId: string,
  ) => Promise<ClaimStellarPaymentSlotResult>;
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
 * Mitigates double-submit via: same-process lock, DB payment-slot claim (cross-instance),
 * payment-hash reuse, and a final status re-check immediately before Horizon submit.
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

async function defaultClaimPaymentSlot(
  anchorTransactionId: string,
): Promise<ClaimStellarPaymentSlotResult> {
  const { claimStellarPaymentSlot } = await import(
    '../persist/stellar-transaction.service.js'
  );
  return claimStellarPaymentSlot(anchorTransactionId);
}

async function completeSep24WithdrawPaymentLocked(
  input: CompleteSep24WithdrawPaymentInput,
): Promise<CompleteSep24WithdrawPaymentResult> {
  const sep24 = input.sep24Client ?? new Sep24Client();
  const submitPayment = input.submitPayment ?? submitSep24UsdcPayment;
  const findRemittance = input.findRemittance ?? defaultFindRemittance;
  const setPaymentHash = input.setPaymentHash ?? defaultSetPaymentHash;
  const claimPaymentSlot = input.claimPaymentSlot ?? defaultClaimPaymentSlot;
  const persistPaymentHash = input.persistPaymentHash === true;
  const transferServer = await sep24.getTransferServer(input.anchor);

  const transferReady = await sep24.pollUntilTransferReady({
    transferServer,
    authToken: input.authToken,
    transactionId: input.transactionId,
    intervalMs: input.pollIntervalMs,
    timeoutMs: input.transferReadyTimeoutMs,
  });

  if (persistPaymentHash) {
    const claim = await claimPaymentSlot(input.transactionId);
    if (claim.outcome === 'missing') {
      throw new Error(
        `No STELLAR remittance for anchor tx ${input.transactionId} — restart withdraw so it can be persisted before Payment`,
      );
    }
    if (claim.outcome === 'reuse') {
      const payment = paymentFromSep24(
        transferReady,
        claim.stellarPaymentHash,
        input.amount,
      );
      const afterReuse = await pollTerminalIfNeeded(sep24, input, transferServer);
      return {
        transferReady,
        payment,
        remittanceId: claim.remittanceId,
        paymentReused: true,
        ...afterReuse,
      };
    }
    if (claim.outcome === 'in_flight') {
      throw new Error(
        `SEP-24 payment already in progress for ${input.transactionId} — do not resubmit Payment`,
      );
    }
    // claim.outcome === 'won' — continue to status check + submit
    return submitAndPersist({
      input,
      sep24,
      submitPayment,
      setPaymentHash,
      transferServer,
      transferReady,
      remittanceId: claim.remittanceId,
      persistPaymentHash: true,
    });
  }

  // Soft path (tests / explicit persistPaymentHash: false): reuse hash if present.
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

  return submitAndPersist({
    input,
    sep24,
    submitPayment,
    setPaymentHash,
    transferServer,
    transferReady,
    remittanceId: existing?.id,
    persistPaymentHash: false,
  });
}

async function submitAndPersist(params: {
  input: CompleteSep24WithdrawPaymentInput;
  sep24: Sep24Client;
  submitPayment: typeof submitSep24UsdcPayment;
  setPaymentHash: NonNullable<CompleteSep24WithdrawPaymentInput['setPaymentHash']>;
  transferServer: string;
  transferReady: Sep24Transaction;
  remittanceId?: string;
  persistPaymentHash: boolean;
}): Promise<CompleteSep24WithdrawPaymentResult> {
  const { input, sep24, submitPayment, setPaymentHash, transferServer } = params;

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

  let remittanceId = params.remittanceId;
  if (params.persistPaymentHash) {
    // Fail closed: hash must be stored so retries reuse instead of double-paying.
    const row = await setPaymentHash({
      anchorTransactionId: input.transactionId,
      stellarPaymentHash: payment.hash,
    });
    remittanceId = row.id;
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
