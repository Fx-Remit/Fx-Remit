/**
 * Prefetch create-pending (ledger reserve + Paycrest order) while the user
 * reviews the confirm sheet so Send can jump straight to the wallet transfer.
 *
 * Lifecycle is owned by the open/close event handlers not by useEffect.
 * If the user closes without sending, cancel using the known externalId.
 */

export type CreatePendingRequestBody = {
  amountUsd: string | number;
  /** Optional display estimate only — server overwrites from live retail quote. */
  payoutFiat?: number;
  /** ms epoch from /api/quote `valid_until`; required for stale-quote rejection. */
  quoteValidUntil: number;
  destinationCurrency?: string;
  recipientName: string;
  recipientBank: string;
  recipientAcc: string;
  bankCode?: string;
  token: string;
  externalId?: string;
};

export type PaycrestSettlementPayload = {
  receiveAddress?: string;
  amountToTransfer?: string | number;
  network?: string;
  chainId?: number;
  token?: string;
  tokenAddress?: string;
  decimals?: number;
};

export type PreparedSettlement = {
  externalId: string;
  resumed: boolean;
  /** Short-lived cancel capability — not a Privy JWT. */
  abandonToken?: string;
  /** Server-bound retail fiat from create-pending (authoritative for UI / history). */
  payoutFiat?: number;
  transaction: {
    orderId: string;
    id?: string;
    status?: string;
    payoutFiat?: string;
  };
  paycrest: PaycrestSettlementPayload;
};

export function buildCreatePendingBody(
  input: CreatePendingRequestBody,
): CreatePendingRequestBody {
  return {
    amountUsd: input.amountUsd,
    quoteValidUntil: input.quoteValidUntil,
    destinationCurrency: input.destinationCurrency,
    recipientName: input.recipientName,
    recipientBank: input.recipientBank,
    recipientAcc: input.recipientAcc,
    bankCode: input.bankCode,
    token: input.token,
    externalId: input.externalId,
  };
}

export function parseCreatePendingSuccess(
  json: unknown,
  fallbackExternalId: string,
): PreparedSettlement {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid create-pending response');
  }
  const data = json as Record<string, unknown>;
  if (data.success !== true) {
    throw new Error(
      typeof data.error === 'string' ? data.error : 'Failed to prepare settlement',
    );
  }

  const transaction = data.transaction as Record<string, unknown> | undefined;
  const paycrest = data.paycrest as PaycrestSettlementPayload | undefined;
  const quote = data.quote as Record<string, unknown> | undefined;

  if (!transaction?.orderId) {
    throw new Error('create-pending response missing transaction.orderId');
  }
  if (!paycrest?.receiveAddress) {
    throw new Error('Paycrest did not provide a receive address');
  }

  const externalId =
    (typeof transaction.externalId === 'string' && transaction.externalId) ||
    fallbackExternalId;

  const txPayoutRaw = transaction.payoutFiat;
  const quotePayoutRaw = quote?.payoutFiat;
  const payoutFiat = (() => {
    if (typeof quotePayoutRaw === 'number' && Number.isFinite(quotePayoutRaw)) {
      return quotePayoutRaw;
    }
    if (typeof quotePayoutRaw === 'string' && quotePayoutRaw.trim() !== '') {
      const n = Number(quotePayoutRaw);
      return Number.isFinite(n) ? n : undefined;
    }
    if (typeof txPayoutRaw === 'number' && Number.isFinite(txPayoutRaw)) {
      return txPayoutRaw;
    }
    if (typeof txPayoutRaw === 'string' && txPayoutRaw.trim() !== '') {
      const n = Number(txPayoutRaw);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  })();

  return {
    externalId,
    resumed: data.resumed === true,
    abandonToken:
      typeof data.abandonToken === 'string' ? data.abandonToken : undefined,
    payoutFiat,
    transaction: {
      orderId: String(transaction.orderId),
      id: typeof transaction.id === 'string' ? transaction.id : undefined,
      status: typeof transaction.status === 'string' ? transaction.status : undefined,
      payoutFiat:
        typeof txPayoutRaw === 'string' || typeof txPayoutRaw === 'number'
          ? String(txPayoutRaw)
          : undefined,
    },
    paycrest,
  };
}

export type PrefetchFetcher = (
  body: CreatePendingRequestBody,
  signal: AbortSignal,
) => Promise<unknown>;

/**
 * Prefetch must be younger than the server pending TTL (default 30m) so Send
 * never broadcasts against a remittance the cron already expired/refunded.
 */
export const PREFETCH_MAX_AGE_MS = 25 * 60 * 1000;

export class StaleSettlementError extends Error {
  constructor(message = 'Settlement expired — prepare again') {
    super(message);
    this.name = 'StaleSettlementError';
  }
}

/**
 * One confirm-sheet prefetch lifecycle.
 * Start from the Confirm click; await on Send; abandon from the Close click.
 */
export class SettlementPrefetchSession {
  private promise: Promise<PreparedSettlement> | null = null;
  private prepared: PreparedSettlement | null = null;
  private preparedAtMs: number | null = null;
  private error: Error | null = null;
  private consumed = false;
  private started = false;
  private abandoned = false;
  private abortController: AbortController | null = null;
  private abandonToken: string | null = null;
  private readonly body: CreatePendingRequestBody;
  private readonly fallbackExternalId: string;
  private readonly maxAgeMs: number;

  constructor(
    body: CreatePendingRequestBody,
    opts?: { maxAgeMs?: number },
  ) {
    this.body = buildCreatePendingBody(body);
    this.maxAgeMs = opts?.maxAgeMs ?? PREFETCH_MAX_AGE_MS;
    this.fallbackExternalId =
      (typeof body.externalId === 'string' && body.externalId) ||
      `prefetch_${Date.now()}`;
    // Always send a stable externalId so abandon cancel can target the same key.
    if (!this.body.externalId) {
      this.body.externalId = this.fallbackExternalId;
    }
  }

  get externalId(): string {
    return this.prepared?.externalId ?? this.fallbackExternalId;
  }

  /**
   * Refresh quote TTL before a Send retry. Keeps the same externalId so
   * create-pending can still resume a reserved row or bind a fresh quote.
   */
  setQuoteValidUntil(quoteValidUntil: number): void {
    if (!Number.isFinite(quoteValidUntil) || quoteValidUntil <= 0) {
      throw new Error('quoteValidUntil must be a positive epoch ms');
    }
    this.body.quoteValidUntil = quoteValidUntil;
  }

  /** Test/debug: current create-pending body (stable externalId). */
  getCreatePendingBody(): Readonly<CreatePendingRequestBody> {
    return { ...this.body };
  }

  private isPreparedFresh(): boolean {
    if (!this.prepared || this.preparedAtMs == null) return false;
    return Date.now() - this.preparedAtMs < this.maxAgeMs;
  }

  private clearStalePrepared(): void {
    this.prepared = null;
    this.preparedAtMs = null;
    this.promise = null;
    this.error = new StaleSettlementError();
  }

  start(fetcher: PrefetchFetcher): void {
    if (this.consumed || this.abandoned) return;
    if (this.prepared && this.isPreparedFresh()) return;
    if (this.prepared && !this.isPreparedFresh()) {
      this.clearStalePrepared();
    }
    if (this.promise && !this.error) return;

    this.error = null;
    this.prepared = null;
    this.preparedAtMs = null;
    this.started = true;
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    this.promise = (async () => {
      try {
        const json = await fetcher(this.body, signal);
        if (signal.aborted || this.abandoned) {
          throw new DOMException('Settlement prefetch aborted', 'AbortError');
        }
        const result = parseCreatePendingSuccess(json, this.fallbackExternalId);
        this.prepared = result;
        this.preparedAtMs = Date.now();
        if (result.abandonToken) {
          this.abandonToken = result.abandonToken;
        }
        this.error = null;
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        this.error = e;
        this.prepared = null;
        this.preparedAtMs = null;
        throw e;
      }
    })();
  }

  /** Abort in-flight create-pending fetch (does not cancel server row by itself). */
  abortInFlight(): void {
    this.abortController?.abort();
  }

  isReady(): boolean {
    return (
      this.prepared != null &&
      this.isPreparedFresh() &&
      !this.consumed &&
      !this.abandoned
    );
  }

  getPrepared(): PreparedSettlement | null {
    if (!this.isPreparedFresh()) return null;
    return this.prepared;
  }

  async awaitPrepared(): Promise<PreparedSettlement> {
    if (this.abandoned) {
      throw new Error('Settlement session was abandoned');
    }
    if (this.consumed && this.prepared) {
      return this.prepared;
    }
    if (this.prepared && !this.isPreparedFresh()) {
      this.clearStalePrepared();
      throw new StaleSettlementError();
    }
    if (!this.promise) {
      throw new Error('Settlement prefetch was not started');
    }
    const result = await this.promise;
    if (!this.consumed && !this.isPreparedFresh()) {
      this.clearStalePrepared();
      throw new StaleSettlementError();
    }
    return result;
  }

  /** Call after wallet transfer has been submitted — keep the reserve. */
  markConsumed(): void {
    this.consumed = true;
  }

  wasConsumed(): boolean {
    return this.consumed;
  }

  wasAbandoned(): boolean {
    return this.abandoned;
  }

  getAbandonToken(): string | null {
    return this.abandonToken;
  }

  getLastError(): Error | null {
    return this.error;
  }

  /**
   * Abort in-flight fetch, wait for it to settle, then return externalId to cancel.
   * Uses the known idempotency key even when the client-side parse/fetch failed,
   * because create-pending may have reserved ledger before the client saw an error.
   * Cancel-pending is idempotent (not_found is fine).
   */
  async resolveAbandonExternalId(): Promise<string | null> {
    if (this.consumed || this.abandoned) return null;
    if (!this.started) return null;

    this.abortInFlight();

    if (this.promise) {
      try {
        await this.promise;
      } catch {
        // Still abandon — server may have reserved under fallbackExternalId.
      }
    }

    if (this.consumed) return null;

    this.abandoned = true;
    const id = this.prepared?.externalId ?? this.fallbackExternalId;
    this.prepared = null;
    this.preparedAtMs = null;
    this.promise = null;
    this.abortController = null;
    return id;
  }
}
