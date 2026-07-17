import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { fetchAnchorToml, clearAnchorTomlCache } from '../anchor-toml.js';

beforeEach(() => {
  clearAnchorTomlCache();
});

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
});

const SAMPLE_TOML = `
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
WEB_AUTH_ENDPOINT="https://anchor.example/auth"
TRANSFER_SERVER_SEP0024="https://anchor.example/sep24"
TRANSFER_SERVER="https://anchor.example/legacy-transfer"
TRANSFER_SERVER_SEP0006="https://anchor.example/sep6"
KYC_SERVER="https://anchor.example/kyc"
QUOTE_SERVER="https://anchor.example/sep38"
`;

describe('fetchAnchorToml — happy paths', () => {
  it('parses SEP endpoints from stellar.toml', async () => {
    mock.method(axios, 'get', async (url: string) => {
      assert.match(String(url), /https:\/\/anchor\.example\/\.well-known\/stellar\.toml/);
      return { data: SAMPLE_TOML };
    });

    const endpoints = await fetchAnchorToml('anchor.example');
    assert.equal(endpoints.webAuthEndpoint, 'https://anchor.example/auth');
    assert.equal(endpoints.transferServerSep24, 'https://anchor.example/sep24');
    assert.equal(endpoints.transferServerSep6, 'https://anchor.example/sep6');
    assert.equal(endpoints.kycServerUrl, 'https://anchor.example/kyc');
    assert.equal(endpoints.sep38QuoteServer, 'https://anchor.example/sep38');
  });

  it('falls back to TRANSFER_SERVER when SEP0024 missing', async () => {
    mock.method(axios, 'get', async () => ({
      data: 'TRANSFER_SERVER="https://anchor.example/legacy"\n',
    }));

    const endpoints = await fetchAnchorToml('legacy.example');
    assert.equal(endpoints.transferServerSep24, 'https://anchor.example/legacy');
  });

  it('caches toml per home domain (single HTTP call)', async () => {
    const getMock = mock.fn(async () => ({ data: SAMPLE_TOML }));
    mock.method(axios, 'get', getMock);

    await fetchAnchorToml('cached.example');
    await fetchAnchorToml('cached.example');

    assert.equal(getMock.mock.calls.length, 1);
  });

  it('strips surrounding quotes from values', async () => {
    mock.method(axios, 'get', async () => ({
      data: 'WEB_AUTH_ENDPOINT="https://quoted.example/auth"\n',
    }));

    const endpoints = await fetchAnchorToml('quoted.example');
    assert.equal(endpoints.webAuthEndpoint, 'https://quoted.example/auth');
  });
});

describe('fetchAnchorToml — unhappy paths', () => {
  it('propagates non-200 / network errors', async () => {
    mock.method(axios, 'get', async () => {
      throw new Error('Request failed with status code 404');
    });

    await assert.rejects(() => fetchAnchorToml('missing.example'), /404/);
  });

  it('returns empty endpoints for empty toml body', async () => {
    mock.method(axios, 'get', async () => ({ data: '\n\n' }));
    const endpoints = await fetchAnchorToml('empty.example');
    assert.equal(endpoints.webAuthEndpoint, undefined);
    assert.equal(endpoints.transferServerSep24, undefined);
    assert.equal(endpoints.sep38QuoteServer, undefined);
  });

  it('clearAnchorTomlCache forces a refetch', async () => {
    const getMock = mock.fn(async () => ({ data: SAMPLE_TOML }));
    mock.method(axios, 'get', getMock);

    await fetchAnchorToml('refetch.example');
    clearAnchorTomlCache();
    await fetchAnchorToml('refetch.example');

    assert.equal(getMock.mock.calls.length, 2);
  });
});
