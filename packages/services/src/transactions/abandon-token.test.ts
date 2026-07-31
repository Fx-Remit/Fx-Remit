process.env.ABANDON_TOKEN_SECRET ??= 'test-abandon-secret';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mintAbandonToken, verifyAbandonToken } from './abandon-token.js';

describe('abandon-token', () => {
  it('mints a token that verifies for the same externalId and user', () => {
    const token = mintAbandonToken('ext-1', 'user-1');
    const claims = verifyAbandonToken(token, 'ext-1');
    assert.ok(claims);
    assert.equal(claims!.userId, 'user-1');
    assert.ok(claims!.exp > Date.now());
  });

  it('rejects token for a different externalId', () => {
    const token = mintAbandonToken('ext-1', 'user-1');
    assert.equal(verifyAbandonToken(token, 'ext-OTHER'), null);
  });

  it('rejects tampered signature', () => {
    const token = mintAbandonToken('ext-1', 'user-1');
    const tampered = token.slice(0, -4) + 'xxxx';
    assert.equal(verifyAbandonToken(tampered, 'ext-1'), null);
  });

  it('rejects expired token', () => {
    const token = mintAbandonToken('ext-1', 'user-1', -1000);
    assert.equal(verifyAbandonToken(token, 'ext-1'), null);
  });
});
