import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { Sep24Client } from '../sep24.client.js';
import { clearAnchorTomlCache } from '../anchor-toml.js';
import type { AnchorConfig } from '../types.js';

const ANCHOR: AnchorConfig = {
  id: 'testanchor',
  name: 'Test Anchor',
  homeDomain: 'testanchor.example',
  corridors: ['NGN', 'KES'],
  usdcAssetCode: 'USDC',
  usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCN7DABMYZ4PKCFXLJ2J4G5UO7K4R6WXXZ3VY',
  priority: 0,
  methods: ['bank'],
};

const TOML_WITH_SEP24 = `
WEB_AUTH_ENDPOINT="https://testanchor.example/auth"
TRANSFER_SERVER_SEP0024="https://testanchor.example/sep24/"
QUOTE_SERVER="https://testanchor.example/sep38"
`;

beforeEach(() => {
  clearAnchorTomlCache();
});

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
});

function mockToml(raw: string) {
  mock.method(axios, 'get', async (url: string) => {
    if (String(url).includes('stellar.toml')) {
      return { data: raw };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
}

describe('Sep24Client — happy paths', () => {
  it('getTransferServer strips trailing slash', async () => {
    mockToml(TOML_WITH_SEP24);
    const client = new Sep24Client();
    const server = await client.getTransferServer(ANCHOR);
    assert.equal(server, 'https://testanchor.example/sep24');
  });

  it('startWithdrawInteractive returns id and url', async () => {
    mock.method(axios, 'get', async (url: string) => {
      if (String(url).includes('stellar.toml')) {
        return { data: TOML_WITH_SEP24 };
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    mock.method(axios, 'post', async () => ({
      data: {
        id: 'tx-123',
        url: 'https://testanchor.example/withdraw?id=tx-123',
        type: 'interactive_customer_info_needed',
      },
    }));

    const client = new Sep24Client();
    const result = await client.startWithdrawInteractive({
      anchor: ANCHOR,
      authToken: 'tok',
      account: 'GABC',
      assetCode: 'USDC',
      assetIssuer: ANCHOR.usdcIssuer,
      amount: '10',
      destinationAsset: 'NGN',
      lang: 'en',
    });

    assert.equal(result.id, 'tx-123');
    assert.match(result.url, /withdraw/);
  });

  it('getTransaction fetches by id with auth header', async () => {
    const getMock = mock.fn(async () => ({
      data: { id: 'tx-123', status: 'pending_user_transfer_start' },
    }));
    mock.method(axios, 'get', getMock);

    const client = new Sep24Client();
    const tx = await client.getTransaction(
      'https://testanchor.example/sep24',
      'tok',
      'tx-123',
    );

    assert.equal(tx.status, 'pending_user_transfer_start');
    const opts = (getMock.mock.calls[0] as { arguments: unknown[] }).arguments[1] as {
      headers: { Authorization: string };
      params: { id: string };
    };
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    assert.equal(opts.params.id, 'tx-123');
  });

  it('corridorToDestinationAsset maps NGN and KES', () => {
    const client = new Sep24Client();
    assert.equal(client.corridorToDestinationAsset('NGN'), 'NGN');
    assert.equal(client.corridorToDestinationAsset('KES'), 'KES');
  });
});

describe('Sep24Client — unhappy paths', () => {
  it('getTransferServer rejects when SEP-24 server missing from toml', async () => {
    mockToml('WEB_AUTH_ENDPOINT="https://testanchor.example/auth"\n');
    const client = new Sep24Client();
    await assert.rejects(
      () => client.getTransferServer(ANCHOR),
      /no SEP-24 transfer server/,
    );
  });

  it('startWithdrawInteractive rejects when response missing id', async () => {
    mock.method(axios, 'get', async () => ({ data: TOML_WITH_SEP24 }));
    mock.method(axios, 'post', async () => ({
      data: { url: 'https://testanchor.example/withdraw' },
    }));

    const client = new Sep24Client();
    await assert.rejects(
      () =>
        client.startWithdrawInteractive({
          anchor: ANCHOR,
          authToken: 'tok',
          account: 'GABC',
          assetCode: 'USDC',
          assetIssuer: ANCHOR.usdcIssuer,
          amount: '10',
        }),
      /missing id or url/,
    );
  });

  it('startWithdrawInteractive rejects when response missing url', async () => {
    mock.method(axios, 'get', async () => ({ data: TOML_WITH_SEP24 }));
    mock.method(axios, 'post', async () => ({
      data: { id: 'tx-only' },
    }));

    const client = new Sep24Client();
    await assert.rejects(
      () =>
        client.startWithdrawInteractive({
          anchor: ANCHOR,
          authToken: 'tok',
          account: 'GABC',
          assetCode: 'USDC',
          assetIssuer: ANCHOR.usdcIssuer,
          amount: '10',
        }),
      /missing id or url/,
    );
  });

  it('startWithdrawInteractive propagates anchor HTTP errors', async () => {
    mock.method(axios, 'get', async () => ({ data: TOML_WITH_SEP24 }));
    mock.method(axios, 'post', async () => {
      throw new Error('Request failed with status code 403');
    });

    const client = new Sep24Client();
    await assert.rejects(
      () =>
        client.startWithdrawInteractive({
          anchor: ANCHOR,
          authToken: 'bad-tok',
          account: 'GABC',
          assetCode: 'USDC',
          assetIssuer: ANCHOR.usdcIssuer,
          amount: '10',
        }),
      /403/,
    );
  });

  it('getTransferServer propagates toml fetch failures', async () => {
    mock.method(axios, 'get', async () => {
      throw new Error('ENOTFOUND');
    });

    const client = new Sep24Client();
    await assert.rejects(() => client.getTransferServer(ANCHOR), /ENOTFOUND/);
  });
});
