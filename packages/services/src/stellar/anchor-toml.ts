import axios from 'axios';
import type { StellarTomlEndpoints } from './types.js';

const TOML_CACHE = new Map<string, StellarTomlEndpoints>();

function parseTomlEndpoints(raw: string): StellarTomlEndpoints {
  const lines = raw.split('\n');
  const get = (key: string): string | undefined => {
    const line = lines.find((l) => l.startsWith(`${key}=`));
    if (!line) return undefined;
    return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
  };

  return {
    webAuthEndpoint: get('WEB_AUTH_ENDPOINT'),
    transferServerSep24: get('TRANSFER_SERVER_SEP0024') ?? get('TRANSFER_SERVER'),
    transferServerSep6: get('TRANSFER_SERVER_SEP0006'),
    kycServerUrl: get('KYC_SERVER_URL') ?? get('KYC_SERVER'),
    sep38QuoteServer: get('QUOTE_SERVER') ?? get('SEP38_QUOTE_SERVER'),
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
