import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { Keypair } from '@stellar/stellar-sdk';
import { Sep10Client } from '../sep10.client.js';

const NETWORK = 'Test SDF Network ; September 2015';

describe('Sep10Client', () => {
  it('fetchChallenge calls web auth endpoint with account and home_domain', async () => {
    const getMock = mock.fn(async () => ({
      data: {
        transaction: 'AAAAAgAAAABmock',
        network_passphrase: NETWORK,
      },
    }));

    mock.method(axios, 'get', getMock);

    const client = new Sep10Client('https://anchor.test/auth', NETWORK);
    const result = await client.fetchChallenge('GABC', 'testanchor.stellar.org');

    assert.equal(result.network_passphrase, NETWORK);
    assert.ok(getMock.mock.calls.length >= 1);
    const firstCall = getMock.mock.calls[0] as { arguments: unknown[] };
    const calledUrl = String(firstCall.arguments[0]);
    assert.match(calledUrl, /account=GABC/);
    assert.match(calledUrl, /home_domain=testanchor\.stellar\.org/);

    mock.restoreAll();
  });

  it('submitTokenRequest returns bearer token', async () => {
    const postMock = mock.fn(async () => ({
      data: { token: 'jwt-test-token' },
    }));

    mock.method(axios, 'post', postMock);

    const client = new Sep10Client('https://anchor.test/auth', NETWORK);
    const token = await client.submitTokenRequest('signed-xdr');

    assert.equal(token, 'jwt-test-token');
    mock.restoreAll();
  });

  it('isValidPublicKey accepts generated keypair', async () => {
    const { isValidPublicKey } = await import('../sep10.client.js');
    const kp = Keypair.random();
    assert.equal(isValidPublicKey(kp.publicKey()), true);
    assert.equal(isValidPublicKey('not-a-key'), false);
  });
});
