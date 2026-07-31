import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMemo } from './stellar-payment.service.js';

describe('buildMemo', () => {
  it('builds text memo by default', () => {
    const m = buildMemo('hello', 'text');
    assert.equal(m.type, 'text');
  });

  it('builds id memo', () => {
    const m = buildMemo('12345', 'id');
    assert.equal(m.type, 'id');
  });

  it('builds hash memo from hex string', () => {
    const hex = 'ab'.repeat(32);
    const m = buildMemo(hex, 'hash');
    assert.equal(m.type, 'hash');
  });
});
