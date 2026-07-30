import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spendableLedgerUsd } from './spendable-balance';

describe('spendableLedgerUsd', () => {
  it('uses ledgerUsd only when syncComplete is true', () => {
    const result = spendableLedgerUsd({
      balanceData: { ledgerUsd: 42.5, syncComplete: true },
      fallbackWalletBalance: 10,
    });
    assert.deepEqual(result, {
      amount: '42.50',
      ready: true,
      syncIncomplete: false,
    });
  });

  it('does not treat incomplete sync ledger as spendable', () => {
    const result = spendableLedgerUsd({
      balanceData: { ledgerUsd: 99, syncComplete: false },
      fallbackWalletBalance: 10,
    });
    assert.equal(result.ready, false);
    assert.equal(result.syncIncomplete, true);
    assert.equal(result.amount, '10.00');
  });

  it('falls back to profile balance while loading', () => {
    const result = spendableLedgerUsd({
      balanceData: null,
      fallbackWalletBalance: '7.25',
    });
    assert.equal(result.amount, '7.25');
    assert.equal(result.ready, true);
    assert.equal(result.syncIncomplete, false);
  });
});
