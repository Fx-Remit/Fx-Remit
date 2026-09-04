import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCryptoInstantSendPolicyDraft,
  CRYPTO_INSTANT_SEND_MAX_USD,
  isCryptoInstantSendConfigured,
} from './crypto-instant-send.policy.js';
import { DEPOSIT_TOKENS } from '../deposits/deposit.tokens.js';

describe('crypto-instant-send policy', () => {
  it('has one ALLOW rule per supported (chain, token) pair', () => {
    const draft = buildCryptoInstantSendPolicyDraft();
    const totalTokens = Object.values(DEPOSIT_TOKENS).reduce((n, list) => n + list.length, 0);
    assert.equal(draft.chain_type, 'ethereum');
    assert.equal(draft.rules.length, totalTokens);
  });

  it('caps each rule at $1,000 in that token\'s own decimals, never constrains recipient', () => {
    const draft = buildCryptoInstantSendPolicyDraft();
    for (const [chainIdStr, tokens] of Object.entries(DEPOSIT_TOKENS)) {
      for (const token of tokens) {
        const rule = draft.rules.find(
          (r) =>
            r.conditions.some((c) => c.field === 'to' && c.value === token.address) &&
            r.conditions.some((c) => c.field === 'chain_id' && c.value === chainIdStr),
        );
        assert.ok(rule, `expected a rule for ${token.symbol} on chain ${chainIdStr}`);
        const amountCond = rule!.conditions.find((c) => c.field === 'transfer.amount');
        assert.ok(amountCond);
        assert.equal(amountCond?.operator, 'lte');
        const expectedRaw = BigInt(CRYPTO_INSTANT_SEND_MAX_USD) * BigInt(10) ** BigInt(token.decimals);
        assert.equal(amountCond?.value, `0x${expectedRaw.toString(16)}`);
        assert.ok(
          !rule!.conditions.some(
            (c) => typeof c.field === 'string' && c.field.toLowerCase().includes('recipient'),
          ),
        );
      }
    }
  });

  it('reports server config from env, including the crypto-specific policy id', () => {
    const prev = {
      auth: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY,
      secret: process.env.PRIVY_APP_SECRET,
      app: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
      policy: process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO,
    };

    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = 'test-key';
    process.env.PRIVY_APP_SECRET = 'secret';
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'app';
    process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO = '';
    assert.equal(isCryptoInstantSendConfigured(), false);

    process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO = 'policy-123';
    assert.equal(isCryptoInstantSendConfigured(), true);

    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = prev.auth;
    process.env.PRIVY_APP_SECRET = prev.secret;
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = prev.app;
    process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO = prev.policy;
  });
});
