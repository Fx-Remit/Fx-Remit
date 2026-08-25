import { PAYCREST_SETTLEMENT, PayoutService } from './payout.service.js';
import { PricingService } from './pricing.service.js';

export class QuoteExpiredError extends Error {
  readonly code = 'QUOTE_EXPIRED';

  constructor(
    message = 'Quote expired — refresh the rate and try again',
  ) {
    super(message);
    this.name = 'QuoteExpiredError';
  }
}

export class QuoteUnavailableError extends Error {
  readonly code = 'QUOTE_UNAVAILABLE';

  constructor(message = 'Failed to fetch wholesale rates') {
    super(message);
    this.name = 'QuoteUnavailableError';
  }
}

export type BoundCreatePendingQuote = {
  payoutFiat: number;
  wholesaleRate: number;
  retailRate: number;
  markupBps: number;
  /** Fresh server quote TTL (ms epoch); not the client-supplied valid_until. */
  validUntil: number;
};

/**
 * Binds retail FX at create-pending: reject stale client quotes, then
 * recompute payoutFiat from live wholesale + retail markup.
 */
export class QuoteBindService {
  /**
   * Idempotent retries after the quote TTL must not re-bind or 422 —
   * funds are already reserved on PENDING/PROCESSING for this user.
   */
  static isReservedRemittanceResume(
    existing:
      | { userId: string; type: string; status: string }
      | null
      | undefined,
    userId: string,
  ): boolean {
    return (
      !!existing &&
      existing.userId === userId &&
      existing.type === 'REMITTANCE' &&
      (existing.status === 'PENDING' || existing.status === 'PROCESSING')
    );
  }

  static assertQuoteFresh(quoteValidUntilMs: number, nowMs = Date.now()) {
    if (!Number.isFinite(quoteValidUntilMs) || quoteValidUntilMs <= nowMs) {
      throw new QuoteExpiredError();
    }
  }

  static async resolveForCreatePending(input: {
    amountUsd: number;
    sourceToken: string;
    destinationCurrency?: string;
    quoteValidUntil: number;
    network?: string;
    nowMs?: number;
  }): Promise<BoundCreatePendingQuote> {
    this.assertQuoteFresh(input.quoteValidUntil, input.nowMs ?? Date.now());

    const network = (
      input.network || PAYCREST_SETTLEMENT.network
    ).toLowerCase();
    const destination = (input.destinationCurrency || 'NGN').toUpperCase();
    // Rates are quoted in settlement token (USDC); create remaps source the same way.
    const source = PAYCREST_SETTLEMENT.token;

    const wholesaleResp = await PayoutService.fetchRate(
      network,
      source,
      destination,
      '1',
    );

    if (!wholesaleResp.success || !wholesaleResp.rate) {
      throw new QuoteUnavailableError(
        wholesaleResp.error || 'Failed to fetch wholesale rates',
      );
    }

    const retail = PricingService.generateQuote(wholesaleResp.rate);
    const payoutFiat = PricingService.computePayoutFiat(
      input.amountUsd,
      retail.retail_rate,
    );

    return {
      payoutFiat,
      wholesaleRate: wholesaleResp.rate.rate,
      retailRate: retail.retail_rate,
      markupBps: retail.markup_bps,
      validUntil: retail.valid_until,
    };
  }
}
