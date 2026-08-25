process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
process.env.STELLAR_NETWORK = 'testnet';

import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  Sep10Client,
  clearAnchorTomlCache,
  seedAnchorTomlCache,
} from '@fx-remit/services';
import { POST } from './route';

afterEach(() => {
  mock.restoreAll();
  clearAnchorTomlCache();
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_STELLAR_ENABLED = 'true';
  clearAnchorTomlCache();
  seedAnchorTomlCache('testanchor.stellar.org', {
    webAuthEndpoint: 'https://testanchor.stellar.org/auth',
    signingKey: 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57',
    transferServerSep24: 'https://testanchor.stellar.org/sep24',
  });
});

function postJson(body: unknown) {
  return new NextRequest('http://localhost/api/stellar/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/stellar/auth/token — happy paths', () => {
  it('exchanges signed XDR for JWT', async () => {
    mock.method(Sep10Client.prototype, 'submitTokenRequest', async (xdr: string) => {
      assert.equal(xdr, 'signed-xdr');
      return 'jwt-from-anchor';
    });

    const res = await POST(
      postJson({ signedTransaction: 'signed-xdr', corridor: 'NGN' }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.token, 'jwt-from-anchor');
  });
});

describe('POST /api/stellar/auth/token — unhappy paths', () => {
  it('returns 400 when signedTransaction missing', async () => {
    const res = await POST(postJson({ corridor: 'NGN' }));
    assert.equal(res.status, 400);
  });

  it('returns 502 when token exchange fails', async () => {
    mock.method(Sep10Client.prototype, 'submitTokenRequest', async () => {
      throw new Error('invalid signature');
    });
    const res = await POST(
      postJson({ signedTransaction: 'bad-xdr', corridor: 'KES' }),
    );
    assert.equal(res.status, 502);
  });
});
