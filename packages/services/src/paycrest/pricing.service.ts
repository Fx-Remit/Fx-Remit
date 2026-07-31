import { PaycrestRate } from './paycrest.client';
import { Decimal } from 'decimal.js';

export interface RetailQuote extends PaycrestRate {
  retail_rate: number;
  markup_bps: number;
  valid_until: number;
}

export class PricingService {
  private static DEFAULT_MARKUP_BPS = 75;

  /**
   * Transforms a wholesale Paycrest rate into a retail rate for the user.
   */
  static calculateRetailRate(wholesaleRate: number, markupBps: number = this.DEFAULT_MARKUP_BPS): number {
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
   * Generates a complete retail quote for the frontend.
   */
  static generateQuote(wholesale: PaycrestRate, markupBps: number = this.DEFAULT_MARKUP_BPS): RetailQuote {
    const retailRate = this.calculateRetailRate(wholesale.rate, markupBps);
    
    return {
      ...wholesale,
      retail_rate: retailRate,
      markup_bps: markupBps,
      valid_until: Date.now() + 60 * 1000, // Quote valid for 60 seconds
    };
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
