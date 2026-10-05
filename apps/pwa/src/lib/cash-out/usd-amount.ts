import { Decimal } from 'decimal.js';
import { z } from 'zod';

/** USDC/USDT carry 6 decimals: the ledger reserve must equal what can be sent exactly. */
export const MAX_AMOUNT_DECIMALS = 6;

/**
 * Exact decimal-place count. Decimal(number) reads the number's shortest string form,
 * the same conversion createPending uses for the reserve, so no float tolerance is needed.
 */
export function amountDecimals(value: number | string): number {
  try {
    return new Decimal(value).decimalPlaces();
  } catch {
    return Infinity;
  }
}

/** Cash-out amount in USD, as accepted by the create-pending routes. */
export const cashOutAmountUsd = z.coerce
  .number()
  .positive('Enter an amount greater than zero')
  .min(0.000001, 'Enter an amount of at least $0.000001')
  .max(10_000, 'Transaction amount exceeds maximum of $10,000')
  .refine((v) => amountDecimals(v) <= MAX_AMOUNT_DECIMALS, `Amount can have at most ${MAX_AMOUNT_DECIMALS} decimal places`);

/** Error text for a failed reserve: the specific validation reason when there is one. */
export function reserveErrorMessage(data: { error?: unknown; details?: unknown }, fallback: string): string {
  const detail = Array.isArray(data.details) ? data.details[0] : undefined;
  return [detail, data.error].find((m): m is string => typeof m === 'string' && m.length > 0) ?? fallback;
}
