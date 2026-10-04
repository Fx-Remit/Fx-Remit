import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskAccount, recipientLabel, shortAddress, toTransactionDetail } from './transaction-detail';

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
    const d = toTransactionDetail({ ...base, feeUsd: 0.25, rate: 1334.85295 });
    assert.equal(d.fee, '$0.25 (0.50%)');
    // Same toLocaleString() format the confirm screen uses.
    assert.equal(d.rate, `1 USDC = ${(1334.85295).toLocaleString()} NGN`);
  });

  it('falls back to received ÷ sent and no fee on older rows', () => {
    const d = toTransactionDetail({ ...base, feeUsd: null, rate: null });
    assert.equal(d.fee, undefined);
    assert.equal(d.rate, `1 USDC = ${(66408.93 / 50).toLocaleString()} NGN`);
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

describe('recipientLabel', () => {
  it('names the bank recipient and where the money went', () => {
    assert.deepEqual(recipientLabel(base), { who: 'Ada Obi', where: 'OPay · •••• 1191' });
  });

  it('shows the short address and network for crypto cash-outs', () => {
    assert.deepEqual(
      recipientLabel({ ...base, recipientName: 'Crypto withdraw', recipientBank: 'crypto:celo', recipientAcc: '0x3766aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3a51' }),
      { who: '0x3766…3a51', where: 'Celo wallet' },
    );
  });

  it('returns null for deposits and rows without a recipient', () => {
    assert.equal(recipientLabel({ ...base, type: 'DEPOSIT' }), null);
    assert.equal(recipientLabel({ ...base, recipientName: null }), null);
  });
});
