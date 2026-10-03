import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cashOutFeeUsd, cashOutReceive, cashOutSendFor, formatCashOutFee } from './fee';

// Example values only; real fee/spread live in server env.
describe('cash-out fee display', () => {
  it('shows the fee as an amount and a percentage', () => {
    assert.equal(formatCashOutFee('50', 50), '$0.25 (0.50%)');
    assert.equal(formatCashOutFee('', 50), '0.50%');
    assert.equal(formatCashOutFee('50', 0), '$0.00 (0.00%)');
  });

  it('matches the server split: recipient gets (send − fee) × shown rate', () => {
    assert.equal(cashOutFeeUsd('50', 50).toString(), '0.25');
    // 49.75 × 1334.85295 = 66408.93
    assert.equal(cashOutReceive('50', 50, 1334.85295).toString(), '66408.93');
  });

  it('the receive field works out the amount to send, fee included', () => {
    const send = cashOutSendFor('66408.93', 50, 1334.85295);
    assert.equal(send.toString(), '50');
    assert.ok(cashOutReceive(send.toString(), 50, 1334.85295).gte('66408.93'));
  });

  it('handles empty and zero inputs', () => {
    assert.equal(cashOutReceive('', 50, 1300).toString(), '0');
    assert.equal(cashOutSendFor('1000', 50, 0).toString(), '0');
  });
});
