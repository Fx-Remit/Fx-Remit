/**
 * Fetch a fresh retail quote TTL for create-pending binding.
 * Shared by confirm open + Send retry so retries are not stuck on a frozen valid_until.
 */
export async function fetchFreshQuoteValidUntil(input: {
  sourceToken: string;
  destinationCurrency: string;
}): Promise<number> {
  const res = await fetch(
    `/api/quote?source=${encodeURIComponent(input.sourceToken)}&destination=${encodeURIComponent(input.destinationCurrency)}&amount=1`,
  );
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    quote?: { valid_until?: number };
  } | null;

  if (!json?.success || json.quote?.valid_until == null) {
    throw new Error(json?.error || 'Failed to refresh quote');
  }

  const quoteValidUntil = Number(json.quote.valid_until);
  if (!Number.isFinite(quoteValidUntil) || quoteValidUntil <= Date.now()) {
    throw new Error('Quote expired — refresh the rate and try again');
  }

  return quoteValidUntil;
}
