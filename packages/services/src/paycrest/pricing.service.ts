import { PaycrestRate } from './paycrest.client';
import { Decimal } from 'decimal.js';
import { reportAlert } from '../alerts/alert.service';

export interface RetailQuote extends PaycrestRate {
  retail_rate: number;
  fee_bps: number;
  markup_bps: number;
  valid_until: number;
}

export type PayoutSplit = {
  amountUsd: string;
  feeUsd: string;
  bankAmount: string;
  senderFee: string;
  payoutFiat: number;
};

const MAX_BPS = 1000;

const warnedUnset = new Set<string>();

/** Basis points from a server-only env var; unset means 0 (alerted in production). */
function envBps(name: string): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production' && !warnedUnset.has(name)) {
      warnedUnset.add(name);
      void reportAlert({
        alert: 'PRICING_ENV_MISSING',
        severity: 'high',
        variable: name,
        message: `${name} is not set; pricing uses 0 for it`,
      });
    }
    return 0;
  }
  const bps = Number(raw);
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_BPS) {
    throw new Error(`${name} must be an integer between 0 and ${MAX_BPS}`);
  }
  return bps;
}

export class PricingService {
  /** Visible fee (PAYOUT_FEE_BPS). */
  static feeBps(): number {
    return envBps('PAYOUT_FEE_BPS');
  }

  static spreadBps(): number {
    return envBps('PAYOUT_SPREAD_BPS');
  }

  /**
   * Transforms a wholesale Paycrest rate into the rate shown to the user.
   */
  static calculateRetailRate(wholesaleRate: number, markupBps: number = this.spreadBps()): number {
    const wholesale = new Decimal(wholesaleRate);
    const markup = new Decimal(markupBps).div(10000);
    const markupFactor = new Decimal(1).minus(markup);

    // Calculate retail rate and truncate to 8 decimal places to match contract precision
    return wholesale.mul(markupFactor).toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
  }

  /**
   * Converts a float rate to the BigInt format required by the smart contract.
   */
  static toContractRate(retailRate: number, decimals: number = 8): bigint {
    const rate = new Decimal(retailRate);
    const multiplier = new Decimal(10).pow(decimals);
    return BigInt(rate.mul(multiplier).toDecimalPlaces(0, Decimal.ROUND_DOWN).toString());
  }

  /**
   * Generates a complete retail quote. `markup_bps` stays on the server.
   */
  static generateQuote(
    wholesale: PaycrestRate,
    markupBps: number = this.spreadBps(),
    feeBps: number = this.feeBps(),
  ): RetailQuote {
    const retailRate = this.calculateRetailRate(wholesale.rate, markupBps);

    return {
      ...wholesale,
      retail_rate: retailRate,
      fee_bps: feeBps,
      markup_bps: markupBps,
      valid_until: Date.now() + 60 * 1000, // Quote valid for 60 seconds
    };
  }

  /**
   * Split a bank payout: the user sends `amountUsd`, sees a fee of `feeBps`, and receives
   * (amountUsd − fee) × the displayed rate. The Paycrest order converts `bankAmount` at the
   * wholesale rate (same fiat), and everything else is the sender fee.
   * Roundings never take more than `amountUsd` from the user or pay the bank more than shown.
   */
  static splitPayout(
    amountUsd: number | string,
    wholesaleRate: number,
    bps: { feeBps: number; spreadBps: number } = { feeBps: this.feeBps(), spreadBps: this.spreadBps() },
  ): PayoutSplit {
    const sent = new Decimal(amountUsd).toDecimalPlaces(6, Decimal.ROUND_DOWN);
    const fee = sent.mul(bps.feeBps).div(10000).toDecimalPlaces(6, Decimal.ROUND_DOWN);
    const bank = sent
      .minus(fee)
      .mul(new Decimal(1).minus(new Decimal(bps.spreadBps).div(10000)))
      .toDecimalPlaces(6, Decimal.ROUND_DOWN);
    return {
      amountUsd: sent.toFixed(6),
      feeUsd: fee.toFixed(6),
      bankAmount: bank.toFixed(6),
      senderFee: sent.minus(bank).toFixed(6),
      payoutFiat: bank.mul(wholesaleRate).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber(),
    };
  }

  /**
   * Retail fiat payout for a USD notional (cash-out / history display).
   * Truncates to 2 decimal places (ROUND_DOWN) to match the PWA calculator.
   */
  static computePayoutFiat(amountUsd: number, retailRate: number): number {
    return new Decimal(amountUsd)
      .mul(retailRate)
      .toDecimalPlaces(2, Decimal.ROUND_DOWN)
      .toNumber();
  }

  /**
   * Calculates the surplus (profit) from a transaction in destination currency.
   */
  static calculateSurplus(amount: number, wholesaleRate: number, retailRate: number): number {
    const qty = new Decimal(amount);
    const wholesaleTotal = qty.mul(wholesaleRate);
    const retailTotal = qty.mul(retailRate);
    return wholesaleTotal.minus(retailTotal).toNumber();
  }
}
