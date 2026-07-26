/**
 * Prefetch create-pending (ledger reserve + Paycrest order) while the user
 * reviews the confirm sheet so Send can jump straight to the wallet transfer.
 *
 * If the user closes without sending, the reserved remittance must be cancelled.
 */

export type CreatePendingRequestBody = {
  amountUsd: string | number;
  payoutFiat: number;
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
  transaction: {
    orderId: string;
    id?: string;
    status?: string;
  };
  paycrest: PaycrestSettlementPayload;
};

export function buildCreatePendingBody(
  input: CreatePendingRequestBody,
): CreatePendingRequestBody {
  return {
    amountUsd: input.amountUsd,
    payoutFiat: input.payoutFiat,
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

  if (!transaction?.orderId) {
    throw new Error('create-pending response missing transaction.orderId');
  }
  if (!paycrest?.receiveAddress) {
    throw new Error('Paycrest did not provide a receive address');
  }

  const externalId =
    (typeof transaction.externalId === 'string' && transaction.externalId) ||
    fallbackExternalId;

  return {
    externalId,
    resumed: data.resumed === true,
    transaction: {
      orderId: String(transaction.orderId),
      id: typeof transaction.id === 'string' ? transaction.id : undefined,
      status: typeof transaction.status === 'string' ? transaction.status : undefined,
    },
    paycrest,
  };
}

export type PrefetchFetcher = (
  body: CreatePendingRequestBody,
) => Promise<unknown>;

/**
 * Tracks one confirm-sheet prefetch lifecycle.
 * - start() kicks create-pending early
 * - awaitPrepared() is what Send awaits (hits cache if ready)
 * - abandon() returns externalId to cancel if reserved and not consumed
 */
export class SettlementPrefetchSession {
  private promise: Promise<PreparedSettlement> | null = null;
  private prepared: PreparedSettlement | null = null;
  private error: Error | null = null;
  private consumed = false;
  private readonly body: CreatePendingRequestBody;
  private readonly fallbackExternalId: string;

  constructor(body: CreatePendingRequestBody) {
    this.body = buildCreatePendingBody(body);
    this.fallbackExternalId =
      (typeof body.externalId === 'string' && body.externalId) ||
      `prefetch_${Date.now()}`;
  }

  start(fetcher: PrefetchFetcher): void {
    if (this.prepared && !this.consumed) return;
    if (this.promise && !this.error) return;

    this.error = null;
    this.prepared = null;

    this.promise = (async () => {
      try {
        const json = await fetcher(this.body);
        const result = parseCreatePendingSuccess(json, this.fallbackExternalId);
        this.prepared = result;
        this.error = null;
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        this.error = e;
        this.prepared = null;
        throw e;
      }
    })();
  }

  isReady(): boolean {
    return this.prepared != null && !this.consumed;
  }

  getPrepared(): PreparedSettlement | null {
    return this.prepared;
  }

  async awaitPrepared(): Promise<PreparedSettlement> {
    if (this.consumed && this.prepared) {
      return this.prepared;
    }
    if (!this.promise) {
      throw new Error('Settlement prefetch was not started');
    }
    return this.promise;
  }

  /** Call after wallet transfer has been submitted successfully enough to keep the reserve. */
  markConsumed(): void {
    this.consumed = true;
  }

  /**
   * If we reserved funds and never consumed the settlement, return externalId for cancel.
   * Clears session so cancel is only suggested once.
   */
  takeAbandonExternalId(): string | null {
    if (this.consumed) return null;
    if (!this.prepared) {
      // Still in flight — waiters should cancel after await if user closed
      return null;
    }
    const id = this.prepared.externalId;
    this.prepared = null;
    this.promise = null;
    return id;
  }

  /** True when a successful prefetch reserved ledger and Send never consumed it. */
  needsAbandonCancel(): boolean {
    return !this.consumed && this.prepared != null;
  }

  getLastError(): Error | null {
    return this.error;
  }

  /**
   * Wait for in-flight prefetch (if any) and return externalId to cancel when reserved
   * but not consumed. Safe to call on sheet close.
   */
  async resolveAbandonExternalId(): Promise<string | null> {
    if (this.consumed) return null;
    if (this.promise) {
      try {
        await this.promise;
      } catch {
        return null;
      }
    }
    return this.takeAbandonExternalId();
  }
}
