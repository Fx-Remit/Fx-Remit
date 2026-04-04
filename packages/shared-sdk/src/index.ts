export const SDK_VERSION = '0.1.0';

/**
 * High-fidelity currency utilities for FX Remit.
 */
export const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};
