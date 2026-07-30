/**
 * Spendable ledger for cash-out UIs.
 * Only trust `/api/deposit/balance` ledgerUsd when syncComplete is true.
 */
export function spendableLedgerUsd(opts: {
  balanceData?: {
    ledgerUsd?: unknown;
    syncComplete?: unknown;
  } | null;
  fallbackWalletBalance?: { toString(): string } | string | number | null;
}): { amount: string; ready: boolean; syncIncomplete: boolean } {
  const syncComplete = opts.balanceData?.syncComplete === true;
  const ledger =
    typeof opts.balanceData?.ledgerUsd === 'number' &&
    Number.isFinite(opts.balanceData.ledgerUsd)
      ? opts.balanceData.ledgerUsd
      : null;

  if (syncComplete && ledger != null) {
    return {
      amount: ledger.toFixed(2),
      ready: true,
      syncIncomplete: false,
    };
  }

  const fallback = Number(opts.fallbackWalletBalance?.toString() || 0);
  const syncIncomplete =
    opts.balanceData != null && opts.balanceData.syncComplete === false;

  return {
    amount: (Number.isFinite(fallback) ? fallback : 0).toFixed(2),
    // Do not enable cash-out on an incomplete sync response.
    ready: opts.balanceData == null ? Number.isFinite(fallback) : false,
    syncIncomplete,
  };
}
