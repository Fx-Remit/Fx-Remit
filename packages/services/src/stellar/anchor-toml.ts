import axios from 'axios';
import type { StellarTomlEndpoints } from './types.js';

const TOML_CACHE = new Map<string, StellarTomlEndpoints>();

/**
 * Parse a single stellar.toml key. Tolerates optional whitespace around `=`
 * (real anchors use `KEY = "value"`; some fixtures use `KEY="value"`).
 */
function getTomlValue(raw: string, key: string): string | undefined {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm');
  const match = raw.match(re);
  if (!match) return undefined;

  let value = match[1].trim();
  // Strip inline comments outside quotes: value # comment
  if (!value.startsWith('"') && !value.startsWith("'")) {
    value = value.replace(/\s+#.*$/, '').trim();
  }
  return value.replace(/^["']|["']$/g, '');
}

function firstTomlValue(raw: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = getTomlValue(raw, key);
    if (value) return value;
  }
  return undefined;
}

export function parseTomlEndpoints(raw: string): StellarTomlEndpoints {
  return {
    webAuthEndpoint: getTomlValue(raw, 'WEB_AUTH_ENDPOINT'),
    transferServerSep24: firstTomlValue(raw, ['TRANSFER_SERVER_SEP0024', 'TRANSFER_SERVER']),
    transferServerSep6: getTomlValue(raw, 'TRANSFER_SERVER_SEP0006'),
    kycServerUrl: firstTomlValue(raw, ['KYC_SERVER_URL', 'KYC_SERVER']),
    // SDF testanchor + many production anchors publish ANCHOR_QUOTE_SERVER
    sep38QuoteServer: firstTomlValue(raw, [
      'ANCHOR_QUOTE_SERVER',
      'QUOTE_SERVER',
      'SEP38_QUOTE_SERVER',
    ]),
  };
}

/**
 * Fetches and parses anchor stellar.toml from HTTPS home domain.
 */
export async function fetchAnchorToml(homeDomain: string): Promise<StellarTomlEndpoints> {
  const cached = TOML_CACHE.get(homeDomain);
  if (cached) return cached;

  const url = `https://${homeDomain}/.well-known/stellar.toml`;
  const { data } = await axios.get<string>(url, {
    timeout: 15_000,
    responseType: 'text',
    validateStatus: (s) => s === 200,
  });

  const endpoints = parseTomlEndpoints(data);
  TOML_CACHE.set(homeDomain, endpoints);
  return endpoints;
}

export function clearAnchorTomlCache(): void {
  TOML_CACHE.clear();
}
