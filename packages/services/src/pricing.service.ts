import { PaycrestRate } from './paycrest.client';

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
    const markupFactor = 1 - markupBps / 10000;
    return Math.floor(wholesaleRate * markupFactor * 100000000) / 100000000;
  }

  /**
   * Converts a float rate to the BigInt format required by the smart contract.
   */
  static toContractRate(retailRate: number, decimals: number = 8): bigint {
    return BigInt(Math.floor(retailRate * Math.pow(10, decimals)));
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


  static calculateSurplus(amount: number, wholesaleRate: number, retailRate: number): number {
    const wholesaleTotal = amount * wholesaleRate;
    const retailTotal = amount * retailRate;
    return wholesaleTotal - retailTotal;
  }
}
