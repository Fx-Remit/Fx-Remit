/**
 * Paycrest corridor helpers.
 * Institutions list uses ISO-4217 fiat (NGN). Verify-account does not need country.
 */

const FIAT_TO_COUNTRY: Record<string, string> = {
  NGN: 'NG',
  KES: 'KE',
  UGX: 'UG',
  TZS: 'TZ',
  GHS: 'GH',
};

const COUNTRY_TO_FIAT: Record<string, string> = {
  NG: 'NGN',
  KE: 'KES',
  UG: 'UGX',
  TZ: 'TZS',
  GH: 'GHS',
};

/** ISO-4217 fiat for Paycrest GET /institutions/{currency_code}. */
export function normalizeFiatCurrency(
  fiatOrCountry: string,
  fallback = 'NGN',
): string {
  const raw = (fiatOrCountry || '').trim().toUpperCase();
  if (!raw) return fallback;
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  if (raw.length === 2 && COUNTRY_TO_FIAT[raw]) return COUNTRY_TO_FIAT[raw];
  return fallback;
}

/** ISO-3166 country when a 2-letter code is explicitly needed. */
export function fiatToCountryCode(fiatOrCountry: string, fallback = 'NG'): string {
  const raw = (fiatOrCountry || '').trim().toUpperCase();
  if (!raw) return fallback;
  if (raw.length === 2 && /^[A-Z]{2}$/.test(raw)) return raw;
  return FIAT_TO_COUNTRY[raw] ?? fallback;
}
