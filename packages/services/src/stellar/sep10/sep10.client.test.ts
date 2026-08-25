import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  WebAuth,
} from '@stellar/stellar-sdk';
import {
  Sep10Client,
  isValidPublicKey,
  keypairFromSecret,
  generateKeypair,
} from './sep10.client.js';

const NETWORK = Networks.TESTNET;
const HOME_DOMAIN = 'testanchor.stellar.org';
const WEB_AUTH_URL = 'https://anchor.test/auth';
const WEB_AUTH_DOMAIN = 'anchor.test';

function makeClient(serverSigningKey: string, passphrase = NETWORK) {
  return new Sep10Client(WEB_AUTH_URL, passphrase, serverSigningKey);
}

function buildValidChallenge(serverKp: Keypair, clientKp: Keypair): string {
  return WebAuth.buildChallengeTx(
    serverKp,
    clientKp.publicKey(),
    HOME_DOMAIN,
    300,
    NETWORK,
    WEB_AUTH_DOMAIN,
  );
}

afterEach(() => {
  mock.restoreAll();
});

describe('Sep10Client — happy paths', () => {
  it('fetchChallenge calls web auth endpoint with account and home_domain', async () => {
    const serverKp = Keypair.random();
    const clientKp = Keypair.random();
    const challengeXdr = buildValidChallenge(serverKp, clientKp);

    const getMock = mock.fn(async () => ({
      data: {
        transaction: challengeXdr,
        network_passphrase: NETWORK,
      },
    }));
    mock.method(axios, 'get', getMock);

    const client = makeClient(serverKp.publicKey());
    const result = await client.fetchChallenge(clientKp.publicKey(), HOME_DOMAIN);

    assert.equal(result.network_passphrase, NETWORK);
    assert.ok(getMock.mock.calls.length >= 1);
    const firstCall = getMock.mock.calls[0] as { arguments: unknown[] };
    const calledUrl = String(firstCall.arguments[0]);
    assert.match(calledUrl, new RegExp(`account=${clientKp.publicKey()}`));
    assert.match(calledUrl, /home_domain=testanchor\.stellar\.org/);
  });

  it('submitTokenRequest returns bearer token', async () => {
    mock.method(axios, 'post', async () => ({ data: { token: 'jwt-test-token' } }));

    const client = makeClient(Keypair.random().publicKey());
    const token = await client.submitTokenRequest('signed-xdr');

    assert.equal(token, 'jwt-test-token');
  });

  it('signChallenge signs a valid SEP-10 challenge', () => {
    const serverKp = Keypair.random();
    const clientKp = Keypair.random();
    const challengeXdr = buildValidChallenge(serverKp, clientKp);
    const client = makeClient(serverKp.publicKey());

    const signed = client.signChallenge(challengeXdr, clientKp, HOME_DOMAIN);
    assert.ok(signed.length > 0);
    assert.notEqual(signed, challengeXdr);
  });

  it('authenticate chains challenge → verify → sign → token', async () => {
    const serverKp = Keypair.random();
    const clientKp = Keypair.random();
    const challengeXdr = buildValidChallenge(serverKp, clientKp);

    mock.method(axios, 'get', async () => ({
      data: {
        transaction: challengeXdr,
        network_passphrase: NETWORK,
      },
    }));
    mock.method(axios, 'post', async () => ({ data: { token: 'jwt-auth-ok' } }));

    const client = makeClient(serverKp.publicKey());
    const result = await client.authenticate(clientKp.publicKey(), HOME_DOMAIN, clientKp);
    assert.equal(result.token, 'jwt-auth-ok');
    assert.equal(result.account, clientKp.publicKey());
  });
});

describe('Sep10Client — challenge verification (#93)', () => {
  it('rejects Payment (non-challenge) XDR before signing', () => {
    const serverKp = Keypair.random();
    const clientKp = Keypair.random();
    const paymentSource = new Account(serverKp.publicKey(), '1');
    const payment = new TransactionBuilder(paymentSource, {
      fee: '100',
      networkPassphrase: NETWORK,
    })
      .addOperation(
        Operation.payment({
          destination: clientKp.publicKey(),
          asset: Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(30)
      .build();
    payment.sign(serverKp);

    const client = makeClient(serverKp.publicKey());
    assert.throws(
      () => client.signChallenge(payment.toXDR(), clientKp, HOME_DOMAIN),
      /./,
    );
  });

  it('rejects challenge when network passphrase mismatches (fail closed)', async () => {
    const serverKp = Keypair.random();
    const clientKp = Keypair.random();
    const challengeXdr = buildValidChallenge(serverKp, clientKp);

    mock.method(axios, 'get', async () => ({
      data: {
        transaction: challengeXdr,
        network_passphrase: Networks.PUBLIC,
      },
    }));

    const client = makeClient(serverKp.publicKey());
    await assert.rejects(
      () => client.fetchChallenge(clientKp.publicKey(), HOME_DOMAIN),
      /network_passphrase mismatch/,
    );
  });

  it('rejects challenge signed by unexpected SIGNING_KEY', () => {
    const serverKp = Keypair.random();
    const otherServer = Keypair.random();
    const clientKp = Keypair.random();
    const challengeXdr = buildValidChallenge(serverKp, clientKp);

    const client = makeClient(otherServer.publicKey());
    assert.throws(
      () => client.signChallenge(challengeXdr, clientKp, HOME_DOMAIN),
      /./,
    );
  });
});

describe('Sep10Client — unhappy paths', () => {
  it('fetchChallenge rejects when transaction is missing', async () => {
    mock.method(axios, 'get', async () => ({
      data: { network_passphrase: NETWORK },
    }));

    const client = makeClient(Keypair.random().publicKey());
    await assert.rejects(
      () => client.fetchChallenge('GABC', HOME_DOMAIN),
      /Invalid SEP-10 challenge response/,
    );
  });

  it('fetchChallenge rejects when network_passphrase is missing', async () => {
    mock.method(axios, 'get', async () => ({
      data: { transaction: 'AAAAAgAAAABmock' },
    }));

    const client = makeClient(Keypair.random().publicKey());
    await assert.rejects(
      () => client.fetchChallenge('GABC', HOME_DOMAIN),
      /Invalid SEP-10 challenge response/,
    );
  });

  it('fetchChallenge propagates HTTP/network errors', async () => {
    mock.method(axios, 'get', async () => {
      throw new Error('ECONNREFUSED');
    });

    const client = makeClient(Keypair.random().publicKey());
    await assert.rejects(
      () => client.fetchChallenge('GABC', HOME_DOMAIN),
      /ECONNREFUSED/,
    );
  });

  it('submitTokenRequest rejects when token is missing', async () => {
    mock.method(axios, 'post', async () => ({ data: {} }));

    const client = makeClient(Keypair.random().publicKey());
    await assert.rejects(
      () => client.submitTokenRequest('signed-xdr'),
      /SEP-10 token response missing token/,
    );
  });

  it('submitTokenRequest propagates anchor 401/5xx as thrown errors', async () => {
    mock.method(axios, 'post', async () => {
      const err = new Error('Request failed with status code 401');
      (err as { response?: { status: number } }).response = { status: 401 };
      throw err;
    });

    const client = makeClient(Keypair.random().publicKey());
    await assert.rejects(
      () => client.submitTokenRequest('signed-xdr'),
      /401/,
    );
  });

  it('signChallenge rejects invalid challenge XDR', () => {
    const client = makeClient(Keypair.random().publicKey());
    const kp = Keypair.random();
    assert.throws(() => client.signChallenge('not-valid-xdr', kp, HOME_DOMAIN));
  });

  it('constructor rejects invalid SIGNING_KEY', () => {
    assert.throws(
      () => new Sep10Client(WEB_AUTH_URL, NETWORK, 'not-a-key'),
      /Invalid SEP-10 server SIGNING_KEY/,
    );
  });
});

describe('Sep10 helpers', () => {
  it('isValidPublicKey accepts generated keypair and rejects garbage', () => {
    const kp = Keypair.random();
    assert.equal(isValidPublicKey(kp.publicKey()), true);
    assert.equal(isValidPublicKey('not-a-key'), false);
    assert.equal(isValidPublicKey(''), false);
  });

  it('generateKeypair returns a valid public key', () => {
    const kp = generateKeypair();
    assert.equal(isValidPublicKey(kp.publicKey()), true);
  });

  it('keypairFromSecret rejects invalid secret', () => {
    assert.throws(() => keypairFromSecret('S_INVALID'), /./);
  });

  it('keypairFromSecret round-trips a random secret', () => {
    const original = Keypair.random();
    const restored = keypairFromSecret(original.secret());
    assert.equal(restored.publicKey(), original.publicKey());
  });
});
