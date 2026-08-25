import axios from 'axios';
import type { StellarTomlEndpoints } from '../types/types.js';

const TOML_CACHE = new Map<string, StellarTomlEndpoints>();

function isAsciiSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

/** Strip trailing ` # comment` from unquoted values without regex (avoids ReDoS). */
function stripUnquotedInlineComment(value: string): string {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '#' && i > 0 && isAsciiSpace(value[i - 1]!)) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

function stripSurroundingQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parse a single stellar.toml key. Tolerates optional whitespace around `=`
 * (real anchors use `KEY = "value"`; some fixtures use `KEY="value"`).
 * Line-scan only — no unbounded `\s*` regexes on remote toml bodies (CodeQL).
 */
function getTomlValue(raw: string, key: string): string | undefined {
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(key)) continue;

    const afterKey = trimmed.slice(key.length);
    const eqIdx = afterKey.indexOf('=');
    if (eqIdx < 0) continue;

    // Characters between key and `=` must be whitespace only (or empty).
    const between = afterKey.slice(0, eqIdx);
    if (![...between].every(isAsciiSpace)) continue;

    let value = afterKey.slice(eqIdx + 1).trim();
    if (!value.startsWith('"') && !value.startsWith("'")) {
      value = stripUnquotedInlineComment(value);
    }
    return stripSurroundingQuotes(value);
  }
  return undefined;
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
    signingKey: getTomlValue(raw, 'SIGNING_KEY'),
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

/** Test helper: seed cache so route tests skip live stellar.toml fetches. */
export function seedAnchorTomlCache(homeDomain: string, endpoints: StellarTomlEndpoints): void {
  TOML_CACHE.set(homeDomain, endpoints);
}
