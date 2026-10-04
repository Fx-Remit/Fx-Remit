import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PublicStatsService, shortWallet, type AppCashOut } from './public-stats.service.js';
import { LEGACY_CELO_REMITTANCES } from './legacy-celo.js';

const WALLET = '0x376665538f584ee62d41C8F39da10266e0333a51';
const HASH = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

const bank = (over: Partial<AppCashOut> = {}): AppCashOut => ({
  createdAt: new Date('2026-10-04T13:12:50Z'),
  amountUsd: 3,
  chainId: 8453,
  txHash: HASH(1),
  sourceToken: 'USDC',
  recipientBank: 'OPay',
  corridor: 'NGN',
  senderWallet: WALLET,
  ...over,
});

describe('PublicStatsService.build', () => {
  it('reproduces the v1/v2 Celo totals from the frozen snapshot', () => {
    const s = PublicStatsService.build([]);
    assert.equal(LEGACY_CELO_REMITTANCES.length, 107);
    assert.deepEqual(
      { v: s.bySource.legacyCelo.volumeUsd, t: s.bySource.legacyCelo.transactions, u: s.bySource.legacyCelo.uniqueUsers },
      { v: 2350.3, t: 107, u: 16 },
    );
  });

  it('combines v1/v2 with app cash-outs and dedupes users across both', () => {
    const legacySender = LEGACY_CELO_REMITTANCES[0].sender;
    const s = PublicStatsService.build([
      bank(),
      bank({ txHash: HASH(2), amountUsd: 0.55, recipientBank: 'crypto:base', chainId: 8453 }),
      bank({ txHash: HASH(3), senderWallet: legacySender.toUpperCase().replace('0X', '0x') }),
    ]);
    assert.equal(s.totals.transactions, 110);
    assert.equal(s.totals.volumeUsd, 2356.85);
    assert.equal(s.totals.uniqueUsers, 17); // the third row's sender already used v1/v2
    assert.deepEqual(s.bySource.app.bank, { volumeUsd: 6, transactions: 2, uniqueUsers: 2 });
    assert.deepEqual(s.bySource.app.crypto, { volumeUsd: 0.55, transactions: 1, uniqueUsers: 1 });
    assert.equal(s.totals.lastActivityAt, '2026-10-04T13:12:50.000Z');
  });

  it('lists recent activity newest first with short wallets and explorer links', () => {
    const s = PublicStatsService.build([bank()]);
    assert.equal(s.recent.length, 20);
    assert.equal(s.recent[0].sender, '0x3766…3a51');
    assert.equal(s.recent[0].explorerUrl, `https://basescan.org/tx/${HASH(1)}`);
    assert.equal(s.recent[1].chain, 'celo');
    assert.ok(s.recent[1].explorerUrl.startsWith('https://celoscan.io/tx/'));
  });

  it('settles older bank rows with chainId 0 on Base, and crypto on its own network', () => {
    const s = PublicStatsService.build([
      bank({ chainId: 0 }),
      bank({ txHash: HASH(2), recipientBank: 'crypto:celo', createdAt: new Date('2026-10-05T00:00:00Z') }),
    ]);
    assert.equal(s.recent[1].chain, 'base');
    assert.equal(s.recent[0].chain, 'celo');
    assert.equal(s.recent[0].corridor, 'USDC-wallet');
    assert.equal(s.recent[1].corridor, 'USDC-NGN');
  });

  it('never exposes full wallets, names, accounts or pricing', () => {
    const json = JSON.stringify(PublicStatsService.build([bank()]));
    assert.equal(json.toLowerCase().includes(WALLET.toLowerCase()), false);
    for (const field of ['recipientName', 'recipientAcc', 'payoutFiat', 'rate', 'fee']) {
      assert.equal(new RegExp(`"${field}"`, 'i').test(json), false, field);
    }
  });

  it('groups daily and monthly buckets', () => {
    const s = PublicStatsService.build([bank()]);
    const day = s.daily.find((d) => d.day === '2026-10-04');
    assert.deepEqual(day, { day: '2026-10-04', volumeUsd: 3, transactions: 1, uniqueUsers: 1 });
    assert.equal(s.monthly.at(-1)?.month, '2026-10');
    assert.equal(shortWallet('0xABCDEF0123456789'), '0xabcd…6789');
  });
});
