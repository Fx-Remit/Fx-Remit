import axios from 'axios';
import type {
  AnchorConfig,
  Sep24Transaction,
  Sep24WithdrawInteractiveResponse,
  StellarCorridor,
} from '../types/types.js';
import { fetchAnchorToml } from '../config/anchor-toml.js';
import { TEST_ANCHOR } from '../config/anchors.config.js';

export interface Sep24WithdrawParams {
  anchor: AnchorConfig;
  authToken: string;
  account: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  destinationAsset?: string;
  lang?: string;
}

/**
 * Off-chain destination for SEP-24 withdraw.
 * SDF testanchor only supports USD/CAD — not NGN/KES product corridors.
 */
export function resolveSep24DestinationAsset(
  anchor: AnchorConfig,
  corridor: StellarCorridor,
): string {
  const isTestAnchor =
    anchor.id === TEST_ANCHOR.id || anchor.homeDomain === TEST_ANCHOR.homeDomain;
  if (isTestAnchor) {
    return 'iso4217:USD';
  }
  return `iso4217:${corridor}`;
}

/**
 * SEP-24: Hosted interactive deposit and withdrawal.
 */
export class Sep24Client {
  async getTransferServer(anchor: AnchorConfig): Promise<string> {
    const toml = await fetchAnchorToml(anchor.homeDomain);
    if (!toml.transferServerSep24) {
      throw new Error(`Anchor ${anchor.id} has no SEP-24 transfer server in stellar.toml`);
    }
    return toml.transferServerSep24.replace(/\/$/, '');
  }

  async getInfo(transferServer: string): Promise<Record<string, unknown>> {
    const { data } = await axios.get(`${transferServer}/info`, { timeout: 15_000 });
    return data;
  }

  /**
   * Start an interactive withdraw (cash-out). Returns hosted URL for KYC / bank details.
   * SDF testanchor accepts JSON; SEP-24 also allows form-urlencoded — we use JSON for compatibility.
   */
  async startWithdrawInteractive(
    params: Sep24WithdrawParams,
  ): Promise<Sep24WithdrawInteractiveResponse> {
    const transferServer = await this.getTransferServer(params.anchor);
    const body: Record<string, string> = {
      asset_code: params.assetCode,
      asset_issuer: params.assetIssuer,
      account: params.account,
      amount: params.amount,
    };

    if (params.destinationAsset) {
      body.destination_asset = params.destinationAsset;
    }
    if (params.lang) {
      body.lang = params.lang;
    }

    const { data } = await axios.post<Sep24WithdrawInteractiveResponse>(
      `${transferServer}/transactions/withdraw/interactive`,
      body,
      {
        timeout: 30_000,
        headers: {
          Authorization: `Bearer ${params.authToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!data.id || !data.url) {
      throw new Error('SEP-24 withdraw response missing id or url');
    }

    return data;
  }

  async getTransaction(
    transferServer: string,
    authToken: string,
    transactionId: string,
  ): Promise<Sep24Transaction> {
    const { data } = await axios.get<Sep24Transaction | { transaction: Sep24Transaction }>(
      `${transferServer}/transaction`,
      {
        // Testanchor /sep24 can be slow under load; 15s caused smoke false-negatives.
        timeout: 45_000,
        params: { id: transactionId },
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    return unwrapSep24Transaction(data);
  }

  /**
   * getTransaction with a few retries on transient network / axios timeouts.
   */
  async getTransactionReliable(
    transferServer: string,
    authToken: string,
    transactionId: string,
    attempts = 3,
  ): Promise<Sep24Transaction> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.getTransaction(transferServer, authToken, transactionId);
      } catch (err) {
        lastErr = err;
        const retryable =
          axios.isAxiosError(err) &&
          (err.code === 'ECONNABORTED' ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'ECONNRESET' ||
            !err.response);
        if (!retryable || i === attempts - 1) {
          throw err;
        }
        await sleep(1_000 * (i + 1));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /**
   * Poll until status is pending_user_transfer_start and memo/account are set
   * (after interactive KYC). Fails fast if the tx already moved past user transfer.
   */
  async pollUntilTransferReady(params: {
    transferServer: string;
    authToken: string;
    transactionId: string;
    intervalMs?: number;
    timeoutMs?: number;
  }): Promise<Sep24Transaction> {
    const intervalMs = params.intervalMs ?? 2_000;
    const timeoutMs = params.timeoutMs ?? 120_000;
    const deadline = Date.now() + timeoutMs;
    let last: Sep24Transaction | undefined;

    while (Date.now() < deadline) {
      last = await this.getTransactionReliable(
        params.transferServer,
        params.authToken,
        params.transactionId,
      );
      if (isSep24TransferReady(last)) {
        return last;
      }
      if (isSep24TerminalFailure(last)) {
        throw new Error(
          `SEP-24 transaction ${params.transactionId} failed before transfer ready: ${last.status}`,
        );
      }
      if (isSep24PastUserTransfer(last)) {
        throw new Error(
          `SEP-24 transaction ${params.transactionId} is no longer awaiting user transfer (status: ${last.status}) — do not resubmit Payment`,
        );
      }
      await sleep(intervalMs);
    }

    throw new Error(
      `Timed out waiting for SEP-24 transfer instructions (last status: ${last?.status ?? 'unknown'})`,
    );
  }

  /**
   * Poll until a terminal SEP-24 status (completed / error / refunded / expired).
   * On timeout, returns the last known transaction instead of throwing so callers
   * that already submitted Payment can still surface the on-chain hash.
   */
  async pollUntilTerminal(params: {
    transferServer: string;
    authToken: string;
    transactionId: string;
    intervalMs?: number;
    timeoutMs?: number;
  }): Promise<{ tx: Sep24Transaction; timedOut: boolean }> {
    const intervalMs = params.intervalMs ?? 3_000;
    const timeoutMs = params.timeoutMs ?? 180_000;
    const deadline = Date.now() + timeoutMs;
    let last: Sep24Transaction | undefined;

    while (Date.now() < deadline) {
      last = await this.getTransactionReliable(
        params.transferServer,
        params.authToken,
        params.transactionId,
      );
      if (isSep24TerminalStatus(last)) {
        return { tx: last, timedOut: false };
      }
      await sleep(intervalMs);
    }

    if (!last) {
      throw new Error(
        `Timed out waiting for SEP-24 terminal status (no transaction fetched)`,
      );
    }
    return { tx: last, timedOut: true };
  }

  /** @deprecated Prefer resolveSep24DestinationAsset(anchor, corridor) */
  corridorToDestinationAsset(corridor: StellarCorridor, anchor?: AnchorConfig): string {
    if (anchor) {
      return resolveSep24DestinationAsset(anchor, corridor);
    }
    return corridor;
  }
}

export function unwrapSep24Transaction(
  data: Sep24Transaction | { transaction: Sep24Transaction },
): Sep24Transaction {
  if (data && typeof data === 'object' && 'transaction' in data && data.transaction) {
    return data.transaction;
  }
  return data as Sep24Transaction;
}

/** Anchor is ready for the user to send USDC (+ memo). */
export function isSep24TransferReady(tx: Sep24Transaction): boolean {
  const status = tx.status?.toLowerCase();
  // Only payable while awaiting user transfer — memo fields often persist after payment.
  return (
    status === 'pending_user_transfer_start' &&
    Boolean(tx.withdraw_anchor_account && tx.withdraw_memo)
  );
}

/**
 * Statuses where the user should no longer submit a Payment
 * (funds already sent or anchor is processing).
 */
export function isSep24PastUserTransfer(tx: Sep24Transaction): boolean {
  const s = tx.status?.toLowerCase();
  return (
    s === 'pending_anchor' ||
    s === 'pending_stellar' ||
    s === 'pending_external' ||
    s === 'pending_trust' ||
    s === 'completed'
  );
}

export function isSep24TerminalStatus(tx: Sep24Transaction): boolean {
  const s = tx.status?.toLowerCase();
  return (
    s === 'completed' ||
    s === 'error' ||
    s === 'refunded' ||
    s === 'expired'
  );
}

export function isSep24TerminalFailure(tx: Sep24Transaction): boolean {
  const s = tx.status?.toLowerCase();
  return s === 'error' || s === 'refunded' || s === 'expired';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
