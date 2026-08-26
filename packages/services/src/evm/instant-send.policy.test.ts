import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstantSendUsdcPolicyDraft,
  INSTANT_SEND_MAX_USDC_RAW,
  isInstantSendServerConfigured,
} from './instant-send.policy.js';
import { PAYCREST_SETTLEMENT } from '../paycrest/payout.service.js';

describe('instant-send policy', () => {
  it('caps USDC transfers at $10,000 (6 decimals)', () => {
    assert.equal(INSTANT_SEND_MAX_USDC_RAW, 10_000_000_000n);
  });

  it('allowlists Base USDC transfer only (no recipient per-order)', () => {
    const draft = buildInstantSendUsdcPolicyDraft();
    assert.equal(draft.chain_type, 'ethereum');
    assert.equal(draft.rules.length, 1);
    const conditions = draft.rules[0].conditions;
    const toCond = conditions.find((c) => c.field === 'to');
    assert.equal(toCond?.value, PAYCREST_SETTLEMENT.tokenAddress);
    const amountCond = conditions.find((c) => c.field === 'transfer.amount');
    assert.ok(amountCond);
    assert.equal(amountCond?.operator, 'lte');
    assert.ok(
      !conditions.some(
        (c) =>
          typeof c.field === 'string' &&
          (c.field.includes('recipient') || c.field.includes('transfer.recipient')),
      ),
    );
  });

  it('reports server config from env', () => {
    const prevAuth = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
    const prevSecret = process.env.PRIVY_APP_SECRET;
    const prevApp = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = '';
    process.env.PRIVY_APP_SECRET = 'secret';
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'app';
    assert.equal(isInstantSendServerConfigured(), false);

    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = 'test-key';
    assert.equal(isInstantSendServerConfigured(), true);

    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = prevAuth;
    process.env.PRIVY_APP_SECRET = prevSecret;
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = prevApp;
  });
});
