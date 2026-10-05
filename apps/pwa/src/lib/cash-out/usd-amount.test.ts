import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { amountDecimals, cashOutAmountUsd, reserveErrorMessage } from './usd-amount';

const ok = (v: unknown) => cashOutAmountUsd.safeParse(v).success;

describe('cashOutAmountUsd', () => {
  it('accepts every legitimate 6-decimal amount, including float-awkward ones', () => {
    for (const v of [0.000001, 1, 1.1, 1.123456, 8192.000002, 8589.934592, 9999.999999, 10_000, '2.5']) {
      assert.equal(ok(v), true, String(v));
    }
  });

  it('rejects anything with more than 6 decimals, however small the extra part', () => {
    for (const v of [1.1234567, 0.1 + 0.2, 1.000000999999, 1.0000000000001, 9999.9999999, 1e-7]) {
      assert.equal(ok(v), false, String(v));
    }
  });

  it('rejects zero, dust below one unit, and amounts over the cap', () => {
    for (const v of [0, -1, 1e-13, 5e-324, 9.999999e-7, 10_000.000001]) {
      assert.equal(ok(v), false, String(v));
    }
  });

  it('explains the decimal limit in user-facing words', () => {
    const r = cashOutAmountUsd.safeParse(1.1234567);
    assert.equal(r.success, false);
    assert.equal(r.error!.issues[0].message, 'Amount can have at most 6 decimal places');
  });

  it('counts decimals exactly from strings and numbers', () => {
    assert.equal(amountDecimals('1.1000000'), 1);
    assert.equal(amountDecimals('1.'), 0);
    assert.equal(amountDecimals('1e-7'), 7);
    assert.equal(amountDecimals('abc'), Infinity);
  });
});

describe('reserveErrorMessage', () => {
  it('prefers the validation detail, then the error, then the fallback', () => {
    assert.equal(reserveErrorMessage({ error: 'Validation failed', details: ['Amount can have at most 6 decimal places'] }, 'x'), 'Amount can have at most 6 decimal places');
    assert.equal(reserveErrorMessage({ error: 'Insufficient balance' }, 'x'), 'Insufficient balance');
    assert.equal(reserveErrorMessage({}, 'Failed to reserve balance'), 'Failed to reserve balance');
  });
});
