import { prisma } from '@fx-remit/database';
import { LEGACY_CELO_CONTRACTS, LEGACY_CELO_REMITTANCES, type LegacyRemittance } from './legacy-celo.js';

/**
 * Public, on-chain-verifiable activity only: USD sent, time, tx link. `sender` is the v1/v2
 * contract caller; app rows carry none, so the page never ties a user's wallet to a bank payout.
 */
export type StatsEntry = {
  source: 'v1' | 'v2' | 'app';
  at: string;
  amountUsd: number;
  chain: 'base' | 'celo' | 'arbitrum';
  sender: string | null;
  txHash: string;
  corridor: string;
};

/** A completed app cash-out with a real hash. */
export type AppCashOut = {
  createdAt: Date;
  amountUsd: number;
  chainId: number;
  txHash: string;
  sourceToken: string;
  recipientBank: string | null;
  corridor: string | null;
  senderWallet: string;
};

type Bucket = { volumeUsd: number; transactions: number; uniqueUsers: number };

export type PublicStats = {
  updatedAt: string;
  totals: Bucket & { avgTransactionUsd: number; firstActivityAt: string | null; lastActivityAt: string | null };
  bySource: {
    legacyCelo: Bucket & { contracts: { v1: string; v2: string } };
    app: Bucket & { bank: Bucket; crypto: Bucket };
  };
  daily: Array<{ day: string } & Bucket>;
  monthly: Array<{ month: string } & Bucket>;
  recent: Array<StatsEntry & { explorerUrl: string }>;
  /** v1/v2 contract callers only (app users stay anonymous). */
  topSenders: Array<{ sender: string; transactions: number; volumeUsd: number }>;
  corridors: Array<{ corridor: string; transactions: number; volumeUsd: number }>;
};

const EXPLORER: Record<StatsEntry['chain'], string> = {
  base: 'https://basescan.org/tx/',
  celo: 'https://celoscan.io/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
};

const CHAIN_BY_ID: Record<number, StatsEntry['chain']> = { 8453: 'base', 42220: 'celo', 42161: 'arbitrum' };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "0x3766…3a51": wallets are public on-chain, but the page never needs the full address. */
export function shortWallet(address: string): string {
  const a = address.trim().toLowerCase();
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function legacyEntry(r: LegacyRemittance): Internal {
  return {
    source: r.version,
    at: new Date(r.at).toISOString(), // same format as app rows, so string order is time order
    amountUsd: r.amountUsd,
    chain: 'celo',
    sender: r.sender.toLowerCase(),
    userKey: r.sender.toLowerCase(),
    txHash: r.txHash,
    corridor: `${r.fromCurrency}-${r.toCurrency}`,
  };
}

/** Internal: entries keep the wallet for unique-user counts; it is stripped before output. */
type Internal = StatsEntry & { userKey: string };

function appEntry(r: AppCashOut): Internal {
  const bank = r.recipientBank ?? '';
  const isCrypto = bank.startsWith('crypto:');
  const network = isCrypto ? bank.slice('crypto:'.length) : '';
  const chain: StatsEntry['chain'] = isCrypto
    ? network === 'celo' || network === 'arbitrum' ? network : 'base'
    : CHAIN_BY_ID[r.chainId] ?? 'base'; // bank payouts settle on Base; older rows kept chainId 0
  return {
    source: 'app',
    at: r.createdAt.toISOString(),
    amountUsd: r.amountUsd,
    chain,
    sender: null,
    userKey: r.senderWallet.toLowerCase(),
    txHash: r.txHash,
    // Bank rows don't store the payout currency yet, so don't guess it.
    corridor: isCrypto ? `${r.sourceToken}-wallet` : `${r.sourceToken}-${r.corridor || 'bank'}`,
  };
}

function bucket(entries: Internal[]): Bucket {
  return {
    volumeUsd: round2(entries.reduce((s, e) => s + e.amountUsd, 0)),
    transactions: entries.length,
    uniqueUsers: new Set(entries.map((e) => e.userKey)).size,
  };
}

function groupBy(entries: Internal[], key: (e: Internal) => string): Map<string, Internal[]> {
  const m = new Map<string, Internal[]>();
  for (const e of entries) {
    const k = key(e);
    const group = m.get(k);
    if (group) group.push(e);
    else m.set(k, [e]);
  }
  return m;
}

/** Public shape of an entry: no internal user key, wallet shortened. */
function publicEntry({ userKey: _userKey, ...e }: Internal): StatsEntry & { explorerUrl: string } {
  return { ...e, sender: e.sender ? shortWallet(e.sender) : null, explorerUrl: `${EXPLORER[e.chain]}${e.txHash}` };
}

const CACHE_TTL_MS = 10 * 60_000;
let cached: { at: number; value: Promise<PublicStats> } | null = null;

export class PublicStatsService {
  static build(
    appRows: AppCashOut[],
    legacy: readonly LegacyRemittance[] = LEGACY_CELO_REMITTANCES,
    now: Date = new Date(),
  ): PublicStats {
    const legacyEntries = legacy.map(legacyEntry);
    const appEntries = appRows.map(appEntry);
    const all = [...legacyEntries, ...appEntries].sort((a, b) => a.at.localeCompare(b.at));
    const totals = bucket(all);

    const daily = [...groupBy(all, (e) => e.at.slice(0, 10))].map(([day, es]) => ({ day, ...bucket(es) }));
    const monthly = [...groupBy(all, (e) => e.at.slice(0, 7))].map(([month, es]) => ({ month, ...bucket(es) }));

    const topSenders = [...groupBy(legacyEntries, (e) => e.userKey)]
      .map(([sender, es]) => ({ sender: shortWallet(sender), transactions: es.length, volumeUsd: bucket(es).volumeUsd }))
      .sort((a, b) => b.volumeUsd - a.volumeUsd || b.transactions - a.transactions)
      .slice(0, 10);

    const corridors = [...groupBy(all, (e) => e.corridor)]
      .map(([corridor, es]) => ({ corridor, transactions: es.length, volumeUsd: bucket(es).volumeUsd }))
      .sort((a, b) => b.transactions - a.transactions || b.volumeUsd - a.volumeUsd);

    const recent = all.slice(-20).reverse().map(publicEntry);

    const isCrypto = (e: Internal) => e.corridor.endsWith('-wallet');
    return {
      updatedAt: now.toISOString(),
      totals: {
        ...totals,
        avgTransactionUsd: totals.transactions ? round2(totals.volumeUsd / totals.transactions) : 0,
        firstActivityAt: all[0]?.at ?? null,
        lastActivityAt: all.at(-1)?.at ?? null,
      },
      bySource: {
        legacyCelo: { ...bucket(legacyEntries), contracts: { ...LEGACY_CELO_CONTRACTS } },
        app: {
          ...bucket(appEntries),
          bank: bucket(appEntries.filter((e) => !isCrypto(e))),
          crypto: bucket(appEntries.filter(isCrypto)),
        },
      },
      daily,
      monthly,
      recent,
      topSenders,
      corridors,
    };
  }

  static async loadAppCashOuts(): Promise<AppCashOut[]> {
    const rows = await prisma.transaction.findMany({
      where: { type: 'REMITTANCE', status: 'COMPLETED', txHash: { startsWith: '0x' } },
      select: {
        createdAt: true,
        amountUsd: true,
        chainId: true,
        txHash: true,
        sourceToken: true,
        recipientBank: true,
        corridor: true,
        user: { select: { walletAddress: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows
      .filter((r) => /^0x[0-9a-fA-F]{64}$/.test(r.txHash) && !!r.user.walletAddress)
      .map((r) => ({
        createdAt: r.createdAt,
        amountUsd: Number(r.amountUsd.toString()),
        chainId: r.chainId,
        txHash: r.txHash,
        sourceToken: r.sourceToken,
        recipientBank: r.recipientBank,
        corridor: r.corridor,
        senderWallet: r.user.walletAddress!,
      }));
  }

  static async get(): Promise<PublicStats> {
    return this.build(await this.loadAppCashOuts());
  }

  /**
   * get() behind a 10-minute in-process cache: the endpoint is public, so query strings that
   * bypass the CDN still hit the database at most once per TTL per instance. Failures aren't cached.
   */
  static getCached(nowMs: number = Date.now()): Promise<PublicStats> {
    if (cached && nowMs - cached.at < CACHE_TTL_MS) return cached.value;
    const value = this.get();
    cached = { at: nowMs, value };
    value.catch(() => {
      if (cached?.value === value) cached = null;
    });
    return value;
  }

  /** Tests only. */
  static resetCache(): void {
    cached = null;
  }
}
