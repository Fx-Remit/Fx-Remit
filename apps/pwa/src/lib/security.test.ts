import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isWeakPin } from './security';

describe('isWeakPin', () => {
  it('rejects all-same-digit PINs', () => {
    assert.equal(isWeakPin('111111'), true);
    assert.equal(isWeakPin('999999'), true);
    assert.equal(isWeakPin('000000'), true);
  });

  it('rejects ascending sequential runs', () => {
    assert.equal(isWeakPin('123456'), true);
    assert.equal(isWeakPin('234567'), true);
    assert.equal(isWeakPin('456789'), true); // upper boundary
  });

  it('rejects descending sequential runs', () => {
    assert.equal(isWeakPin('987654'), true); // upper boundary
    assert.equal(isWeakPin('876543'), true);
    assert.equal(isWeakPin('654321'), true); // lower boundary
  });

  it('accepts non-sequential, non-repeating PINs', () => {
    assert.equal(isWeakPin('284915'), false);
    assert.equal(isWeakPin('093827'), false);
    assert.equal(isWeakPin('112233'), false);
  });

  it('does not false-positive near the sequential boundaries', () => {
    assert.equal(isWeakPin('456788'), false); // one off from 456789
    assert.equal(isWeakPin('345679'), false); // broken run
  });
});
