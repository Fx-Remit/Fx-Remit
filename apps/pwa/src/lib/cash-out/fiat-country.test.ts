import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fiatToCountryCode } from './fiat-country';

describe('fiatToCountryCode', () => {
  it('maps fiat currencies to Paycrest country codes', () => {
    assert.equal(fiatToCountryCode('NGN'), 'NG');
    assert.equal(fiatToCountryCode('kes'), 'KE');
    assert.equal(fiatToCountryCode('UGX'), 'UG');
    assert.equal(fiatToCountryCode('TZS'), 'TZ');
  });

  it('passes through 2-letter country codes', () => {
    assert.equal(fiatToCountryCode('NG'), 'NG');
    assert.equal(fiatToCountryCode('ke'), 'KE');
  });

  it('falls back for empty / unknown', () => {
    assert.equal(fiatToCountryCode(''), 'NG');
    assert.equal(fiatToCountryCode('???'), 'NG');
    assert.equal(fiatToCountryCode('EUR'), 'NG');
  });
});
