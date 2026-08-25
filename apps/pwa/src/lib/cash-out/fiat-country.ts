/**
 * Map cash-out fiat codes → Paycrest ISO country codes for institutions / verify.
 * Also accepts an already-correct 2-letter country code.
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
  if (FIAT_TO_COUNTRY[raw]) return FIAT_TO_COUNTRY[raw];
  // Common ISO-4217 → ISO-3166 shortcut (NGN→NG, KES→KE, …)
  if (raw.length === 3 && /^[A-Z]{3}$/.test(raw)) return raw.slice(0, 2);
  return fallback;
}
