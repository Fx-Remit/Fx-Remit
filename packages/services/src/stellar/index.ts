export * from './types.js';
export * from './anchors.config.js';
export * from './anchor-toml.js';
export * from './sep10.client.js';
export * from './sep38.client.js';
export * from './sep24.client.js';

import { PricingService } from '../pricing.service.js';
import type { RetailQuote } from '../pricing.service.js';
import type { StellarCorridor, StellarWholesaleQuote } from './types.js';
import { getDefaultAnchor } from './anchors.config.js';
import { Sep38Client } from './sep38.client.js';

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
