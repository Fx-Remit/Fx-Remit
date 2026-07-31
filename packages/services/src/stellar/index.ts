export * from './types/types.js';
export * from './config/anchors.config.js';
export * from './config/anchor-toml.js';
export * from './sep10/sep10.client.js';
export * from './sep38/sep38.client.js';
export * from './sep24/sep24.client.js';
export * from './persist/stellar-transaction.service.js';
export * from './payment/stellar-payment.service.js';
export * from './payment/complete-sep24-withdraw.js';

import { PricingService } from '../paycrest/pricing.service.js';
import type { RetailQuote } from '../paycrest/pricing.service.js';
import type { StellarCorridor, StellarWholesaleQuote } from './types/types.js';
import { getDefaultAnchor } from './config/anchors.config.js';
import { Sep38Client } from './sep38/sep38.client.js';

const sep38 = new Sep38Client();

/**
 * Stellar quote with FX Remit retail markup (same PricingService as EVM rail).
 */
export async function getStellarRetailQuote(
  corridor: StellarCorridor,
  amount = '1',
  markupBps?: number,
): Promise<{ wholesale: StellarWholesaleQuote; retail: RetailQuote }> {
  const anchor = getDefaultAnchor(corridor);
  const wholesale = await sep38.getWholesaleQuoteForCorridor(anchor, corridor, amount);

  const retail = PricingService.generateQuote(
    {
      source_currency: wholesale.source_currency,
      destination_currency: wholesale.destination_currency,
      rate: wholesale.rate,
      fixed_fee: 0,
      variable_fee: 0,
    },
    markupBps,
  );

  return { wholesale, retail };
}
