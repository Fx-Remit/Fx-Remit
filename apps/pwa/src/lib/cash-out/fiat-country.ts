/**
 * Map cash-out fiat codes → Paycrest ISO country codes for institutions / verify.
 * Also accepts an already-correct 2-letter country code.
 * Unknown 3-letter codes fall back — do not slice ISO-4217 (EUR→EU is invalid).
 */
const FIAT_TO_COUNTRY: Record<string, string> = {
  NGN: 'NG',
  KES: 'KE',
  UGX: 'UG',
  TZS: 'TZ',
  GHS: 'GH',
};

export function fiatToCountryCode(fiatOrCountry: string, fallback = 'NG'): string {
  const raw = (fiatOrCountry || '').trim().toUpperCase();
  if (!raw) return fallback;
  if (raw.length === 2 && /^[A-Z]{2}$/.test(raw)) return raw;
  return FIAT_TO_COUNTRY[raw] ?? fallback;
}
