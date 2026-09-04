import { prisma, type SavedCryptoAddress } from '@fx-remit/database';

export type SavedCryptoAddressResponse = {
  id: string;
  network: string;
  address: string;
  label: string | null;
  lastUsedAt: string;
};

export class CryptoAddressService {
  static serialize(row: SavedCryptoAddress): SavedCryptoAddressResponse {
    return {
      id: row.id,
      network: row.network,
      address: row.address,
      label: row.label,
      lastUsedAt: row.lastUsedAt.toISOString(),
    };
  }

  /**
   * Pull crypto cash-out destinations into the address book from transaction
   * history same auto-backfill approach as RecipientService, no explicit
   * "save" step needed. Safe / idempotent.
   */
  static async backfillFromRemittances(userId: string): Promise<number> {
    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'REMITTANCE',
        recipientAcc: { not: null },
        recipientBank: { startsWith: 'crypto:' },
      },
      select: {
        recipientBank: true,
        recipientAcc: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let saved = 0;
    const seen = new Set<string>();

    for (const tx of txs) {
      const network = (tx.recipientBank || '').slice('crypto:'.length).trim();
      const address = (tx.recipientAcc || '').trim().toLowerCase();
      if (!network || !address) continue;

      const key = `${network}|${address}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // txs is ordered createdAt desc and deduped via `seen`, so the first
      // time an address is encountered in this loop is its most recent use.
      await prisma.savedCryptoAddress.upsert({
        where: {
          userId_network_address: { userId, network, address },
        },
        create: { userId, network, address, lastUsedAt: tx.createdAt },
        update: { lastUsedAt: tx.createdAt },
      });
      saved += 1;
    }

    return saved;
  }

  static async listForUser(
    userId: string,
    opts?: { backfill?: boolean },
  ): Promise<SavedCryptoAddressResponse[]> {
    if (opts?.backfill !== false) {
      await this.backfillFromRemittances(userId).catch((err) => {
        console.error('[CryptoAddressService] backfill failed:', err);
      });
    }

    const rows = await prisma.savedCryptoAddress.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
    });

    return rows.map((r) => this.serialize(r));
  }

  /** Delete only if the row belongs to userId. Returns false when missing / not owned. */
  static async deleteForUser(userId: string, id: string): Promise<boolean> {
    const result = await prisma.savedCryptoAddress.deleteMany({
      where: { id, userId },
    });
    return result.count === 1;
  }
}
