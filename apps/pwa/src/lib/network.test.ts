import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTxHashLabel,
  isPlaceholderTxHash,
  networkLabelForTransaction,
  networkLabelFromChainId,
} from './network';

describe('networkLabelFromChainId', () => {
  it('maps known chain ids', () => {
    assert.equal(networkLabelFromChainId(8453), 'Base Network');
    assert.equal(networkLabelFromChainId(42220), 'Celo Network');
    assert.equal(networkLabelFromChainId(0), 'Pending');
  });
});

describe('isPlaceholderTxHash / formatTxHashLabel', () => {
  it('detects placeholder hashes', () => {
    assert.equal(isPlaceholderTxHash('pending-abc'), true);
    assert.equal(isPlaceholderTxHash('abandoned-xyz'), true);
    assert.equal(isPlaceholderTxHash('broadcasting-pc-1'), true);
    assert.equal(isPlaceholderTxHash('0x439e5f8c1234567890abcdef'), false);
  });

  it('formats placeholders without leaking prefixes', () => {
    assert.equal(formatTxHashLabel('pending-fe123'), 'Not sent');
    assert.equal(formatTxHashLabel('abandoned-55bc'), 'Not broadcast');
    assert.equal(
      formatTxHashLabel('0x439e5f8c1234567890abcdef1234567890abcdef'),
      '0x439e...cdef',
    );
  });
});

describe('networkLabelForTransaction', () => {
  it('shows Base for remittances even when chainId is still 0', () => {
    assert.equal(
      networkLabelForTransaction({
        chainId: 0,
        type: 'REMITTANCE',
        txHash: 'pending-order',
      }),
      'Base Network',
    );
    assert.equal(
      networkLabelForTransaction({
        chainId: 0,
        type: 'REMITTANCE',
        txHash: '0x439e5f8c1234567890abcdef1234567890abcdef',
      }),
      'Base Network',
    );
  });

  it('keeps deposit chain labels', () => {
    assert.equal(
      networkLabelForTransaction({
        chainId: 8453,
        type: 'DEPOSIT',
        txHash: '0xabc',
      }),
      'Base Network',
    );
    assert.equal(
      networkLabelForTransaction({ chainId: 0, type: 'DEPOSIT' }),
      'Pending',
    );
  });
});
