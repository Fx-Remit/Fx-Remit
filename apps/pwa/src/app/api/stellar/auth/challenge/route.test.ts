process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
process.env.STELLAR_NETWORK = 'testnet';

import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import {
  Sep10Client,
  clearAnchorTomlCache,
  seedAnchorTomlCache,
} from '@fx-remit/services';
import { POST } from './route';

const ACCOUNT = Keypair.random().publicKey();

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
  clearAnchorTomlCache();
  seedAnchorTomlCache('testanchor.stellar.org', {
    webAuthEndpoint: 'https://testanchor.stellar.org/auth',
    transferServerSep24: 'https://testanchor.stellar.org/sep24',
  });
});

function postJson(body: unknown) {
  return new NextRequest('http://localhost/api/stellar/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/stellar/auth/challenge — happy paths', () => {
  it('returns challenge XDR for account + corridor', async () => {
    mock.method(Sep10Client.prototype, 'fetchChallenge', async (account: string, home: string) => {
      assert.equal(account, ACCOUNT);
      assert.equal(home, 'testanchor.stellar.org');
      return {
        transaction: 'AAAAAgAAAABchallenge',
        network_passphrase: 'Test SDF Network ; September 2015',
      };
    });

    const res = await POST(postJson({ account: ACCOUNT, corridor: 'NGN' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.transaction, 'AAAAAgAAAABchallenge');
    assert.equal(body.home_domain, 'testanchor.stellar.org');
    assert.equal(body.account, ACCOUNT);
  });
});

describe('POST /api/stellar/auth/challenge — unhappy paths', () => {
  it('returns 404 when stellar rail disabled', async () => {
    process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'false';
    const res = await POST(postJson({ account: ACCOUNT, corridor: 'NGN' }));
    assert.equal(res.status, 404);
  });

  it('returns 400 when corridor missing', async () => {
    const res = await POST(postJson({ account: ACCOUNT }));
    assert.equal(res.status, 400);
  });

  it('returns 400 for invalid account', async () => {
    const res = await POST(postJson({ account: 'not-a-key', corridor: 'NGN' }));
    assert.equal(res.status, 400);
  });

  it('returns 502 when challenge fetch fails', async () => {
    mock.method(Sep10Client.prototype, 'fetchChallenge', async () => {
      throw new Error('anchor down');
    });
    const res = await POST(postJson({ account: ACCOUNT, corridor: 'NGN' }));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.match(body.error, /anchor down/);
  });
});
