/**
 * Aggregate live per-chain token balances and pick the highest for bank cash-out default.
 */

export type LivePerChain = {
  chainId: number;
  tokens: Array<{ symbol: string; balanceUsd: number }>;
  totalUsd: number;
};

/** Tokens that can settle via Paycrest bank cash-out (quotes remap to USDC). */
export const BANK_SETTLEMENT_TOKENS = ['USDC', 'USDT'] as const;

export function aggregateTokenBalancesUsd(
  perChain: LivePerChain[] | null | undefined,
): Record<string, number> {
  const totals: Record<string, number> = {};
  if (!perChain) return totals;

  for (const chain of perChain) {
    for (const t of chain.tokens ?? []) {
      const symbol = (t.symbol || '').toUpperCase();
      if (!symbol || !Number.isFinite(t.balanceUsd)) continue;
      totals[symbol] = (totals[symbol] ?? 0) + t.balanceUsd;
    }
  }
  return totals;
}

/**
 * Prefer the allowlisted token with the highest live USD balance.
 * Falls back to `fallback` when none have a positive balance.
 */
export function pickHighestBalanceToken(
  perChain: LivePerChain[] | null | undefined,
  allowlist: readonly string[],
  fallback = 'USDC',
): string {
  const totals = aggregateTokenBalancesUsd(perChain);
  const allowed = allowlist.map((s) => s.toUpperCase());

  let best: string | null = null;
  let bestAmt = -1;

  for (const symbol of allowed) {
    const amt = totals[symbol] ?? 0;
    if (amt > bestAmt) {
      bestAmt = amt;
      best = symbol;
    }
  }

  if (best != null && bestAmt > 0) return best;
  return fallback;
}
