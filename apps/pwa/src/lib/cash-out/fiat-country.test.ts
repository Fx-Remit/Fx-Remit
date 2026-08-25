import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fiatToCountryCode, normalizeFiatCurrency } from './fiat-country';

describe('normalizeFiatCurrency', () => {
  it('keeps ISO-4217 fiat codes', () => {
    assert.equal(normalizeFiatCurrency('NGN'), 'NGN');
    assert.equal(normalizeFiatCurrency('kes'), 'KES');
  });

  it('maps accidental country codes back to fiat for institutions', () => {
    assert.equal(normalizeFiatCurrency('NG'), 'NGN');
    assert.equal(normalizeFiatCurrency('ke'), 'KES');
  });

  it('falls back for empty / unknown', () => {
    assert.equal(normalizeFiatCurrency(''), 'NGN');
    assert.equal(normalizeFiatCurrency('???'), 'NGN');
  });
});

describe('fiatToCountryCode', () => {
  it('maps fiat currencies to country codes', () => {
    assert.equal(fiatToCountryCode('NGN'), 'NG');
    assert.equal(fiatToCountryCode('UGX'), 'UG');
  });

  it('passes through 2-letter country codes', () => {
    assert.equal(fiatToCountryCode('NG'), 'NG');
  });
});
