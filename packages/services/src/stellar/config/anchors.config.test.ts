import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAnchorsForCorridor,
  getDefaultAnchor,
  getStellarNetwork,
  TEST_ANCHOR,
  PRODUCTION_ANCHORS,
  USDC_TESTNET_ISSUER,
  CIRCLE_USDC_TESTNET_ISSUER,
} from './anchors.config.js';

const ORIGINAL_ENV = process.env.STELLAR_NETWORK;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.STELLAR_NETWORK;
  } else {
    process.env.STELLAR_NETWORK = ORIGINAL_ENV;
  }
});

describe('anchors.config — happy paths', () => {
  it('getStellarNetwork defaults to testnet', () => {
    delete process.env.STELLAR_NETWORK;
    assert.equal(getStellarNetwork(), 'testnet');
  });

  it('getStellarNetwork returns public when configured', () => {
    process.env.STELLAR_NETWORK = 'public';
    assert.equal(getStellarNetwork(), 'public');
  });

  it('testnet corridor list includes TEST_ANCHOR first for NGN', () => {
    const anchors = getAnchorsForCorridor('NGN', 'testnet');
    assert.equal(anchors[0].id, TEST_ANCHOR.id);
    assert.ok(anchors.some((a) => a.id === 'link'));
    assert.ok(anchors.some((a) => a.id === 'flutterwave'));
  });

  it('public NGN list excludes TEST_ANCHOR and sorts by priority', () => {
    const anchors = getAnchorsForCorridor('NGN', 'public');
    assert.ok(anchors.every((a) => a.id !== TEST_ANCHOR.id));
    assert.equal(anchors[0].id, 'link');
    for (let i = 1; i < anchors.length; i++) {
      assert.ok(anchors[i - 1].priority <= anchors[i].priority);
    }
  });

  it('KES public anchors include clickpesa and flutterwave', () => {
    const anchors = getAnchorsForCorridor('KES', 'public');
    const ids = anchors.map((a) => a.id);
    assert.ok(ids.includes('clickpesa'));
    assert.ok(ids.includes('flutterwave'));
    assert.ok(!ids.includes('link'));
  });

  it('getDefaultAnchor on testnet returns TEST_ANCHOR', () => {
    assert.equal(getDefaultAnchor('NGN', 'testnet').id, TEST_ANCHOR.id);
    assert.equal(getDefaultAnchor('KES', 'testnet').id, TEST_ANCHOR.id);
  });

  it('TEST_ANCHOR USDC issuer matches SDF testanchor toml (not classic Circle)', () => {
    assert.equal(
      TEST_ANCHOR.usdcIssuer,
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    );
    assert.equal(TEST_ANCHOR.usdcIssuer, USDC_TESTNET_ISSUER);
    assert.notEqual(USDC_TESTNET_ISSUER, CIRCLE_USDC_TESTNET_ISSUER);
  });

  it('getDefaultAnchor on public returns highest-priority corridor match', () => {
    assert.equal(getDefaultAnchor('NGN', 'public').id, 'link');
    assert.equal(getDefaultAnchor('KES', 'public').id, 'clickpesa');
  });

  it('PRODUCTION_ANCHORS only cover NGN and/or KES', () => {
    for (const a of PRODUCTION_ANCHORS) {
      for (const c of a.corridors) {
        assert.ok(c === 'NGN' || c === 'KES');
      }
    }
  });
});

describe('anchors.config — edge paths', () => {
  it('getStellarNetwork treats unknown values as testnet', () => {
    process.env.STELLAR_NETWORK = 'staging';
    assert.equal(getStellarNetwork(), 'testnet');
  });

  it('getDefaultAnchor without network arg uses STELLAR_NETWORK env', () => {
    process.env.STELLAR_NETWORK = 'public';
    assert.equal(getDefaultAnchor('NGN').id, 'link');

    process.env.STELLAR_NETWORK = 'testnet';
    assert.equal(getDefaultAnchor('KES').id, TEST_ANCHOR.id);
  });

  it('every production anchor has a non-empty homeDomain and USDC issuer', () => {
    for (const a of PRODUCTION_ANCHORS) {
      assert.ok(a.homeDomain.length > 0);
      assert.ok(a.usdcIssuer.startsWith('G'));
      assert.equal(a.usdcAssetCode, 'USDC');
      assert.ok(a.methods.length > 0);
    }
  });
});
