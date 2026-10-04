import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskAccount, shortAddress, toTransactionDetail } from './transaction-detail';

const base = {
  id: 'tx-1',
  type: 'REMITTANCE',
  status: 'COMPLETED',
  sourceToken: 'USDC',
  amountUsd: 50,
  payoutFiat: 66408.93,
  recipientName: 'Ada Obi',
  recipientBank: 'OPay',
  recipientAcc: '7055561191',
  chainId: 8453,
  createdAt: '2026-10-04T10:00:00.000Z',
};

describe('toTransactionDetail', () => {
  // Example values only; real fee/spread live in server env.
  it('shows the confirmed fee and rate when the row has a saved fee', () => {
    const d = toTransactionDetail({ ...base, feeUsd: 0.25, rate: 66408.93 / 49.75 });
    assert.equal(d.fee, '$0.25 (0.50%)');
    assert.equal(d.rate, '1 USDC = 1,334.85 NGN');
  });

  it('falls back to received ÷ sent and no fee on older rows', () => {
    const d = toTransactionDetail({ ...base, feeUsd: null, rate: null });
    assert.equal(d.fee, undefined);
    assert.equal(d.rate, '1 USDC = 1,328.18 NGN');
  });

  it('shows the bank recipient with a masked account', () => {
    assert.deepEqual(toTransactionDetail(base).recipient, {
      name: 'Ada Obi',
      bank: 'OPay',
      account: '•••• 1191',
    });
  });

  it('shows a short wallet address for crypto cash-outs', () => {
    const d = toTransactionDetail({
      ...base,
      recipientBank: 'crypto:base',
      recipientAcc: '0x3766aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3a51',
    });
    assert.deepEqual(d.recipient, { name: 'Wallet', bank: '', account: '0x3766…3a51' });
  });

  it('has no recipient for deposits', () => {
    assert.equal(toTransactionDetail({ ...base, type: 'DEPOSIT' }).recipient, undefined);
  });
});

describe('masking helpers', () => {
  it('keeps the last four digits only', () => {
    assert.equal(maskAccount('7055561191'), '•••• 1191');
    assert.equal(maskAccount('123'), '123');
  });

  it('shortens long addresses', () => {
    assert.equal(shortAddress('0x3766aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3a51'), '0x3766…3a51');
  });
});
