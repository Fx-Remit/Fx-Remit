import { prisma, type SavedCryptoAddress } from '@fx-remit/database';
import { NotificationService } from '../notifications/notification.service.js';


export const CRYPTO_TRUST_COOLDOWN_MS = Number(
  process.env.CRYPTO_TRUST_COOLDOWN_MS ?? 24 * 60 * 60 * 1000,
);

export type SavedCryptoAddressResponse = {
  id: string;
  network: string;
  address: string;
  label: string | null;
  lastUsedAt: string;
  firstConfirmedAt: string | null;
  /** True once a send to this address has confirmed and the cooldown has passed. */
  fastPathEligible: boolean;
  /** ISO timestamp this address becomes fast-path eligible, or null if never confirmed yet. */
  eligibleAt: string | null;
};

export class CryptoAddressService {
  static isFastPathEligible(row: Pick<SavedCryptoAddress, 'firstConfirmedAt'>): boolean {
    if (!row.firstConfirmedAt) return false;
    return Date.now() - row.firstConfirmedAt.getTime() >= CRYPTO_TRUST_COOLDOWN_MS;
  }

  static serialize(row: SavedCryptoAddress): SavedCryptoAddressResponse {
    const eligibleAt = row.firstConfirmedAt
      ? new Date(row.firstConfirmedAt.getTime() + CRYPTO_TRUST_COOLDOWN_MS).toISOString()
      : null;
    return {
      id: row.id,
      network: row.network,
      address: row.address,
      label: row.label,
      lastUsedAt: row.lastUsedAt.toISOString(),
      firstConfirmedAt: row.firstConfirmedAt ? row.firstConfirmedAt.toISOString() : null,
      fastPathEligible: this.isFastPathEligible(row),
      eligibleAt,
    };
  }

  /**
   * Pull crypto cash-out destinations into the address book from transaction
   * history same auto-backfill approach as RecipientService, no explicit
   * "save" step needed. Only COMPLETED sends count: a still-PENDING or
   * FAILED cash-out was never actually delivered to that address, so it
   * shouldn't be suggested (or start a trust cooldown) as if it had been.
   * Safe / idempotent.
   */
  static async backfillFromRemittances(userId: string): Promise<number> {
    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'REMITTANCE',
        status: 'COMPLETED',
        recipientAcc: { not: null },
        recipientBank: { startsWith: 'crypto:' },
      },
      select: {
        recipientBank: true,
        recipientAcc: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
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

      // txs is ordered updatedAt desc and deduped via `seen`, so the first
      // time an address is encountered in this loop is its most recently
      // confirmed use used for both lastUsedAt and (on first creation)
      // firstConfirmedAt, so backfilled history from before this feature
      // existed is correctly treated as already past its cooldown rather
      // than resetting the clock to "now".
      const existing = await prisma.savedCryptoAddress.findUnique({
        where: { userId_network_address: { userId, network, address } },
      });

      await prisma.savedCryptoAddress.upsert({
        where: { userId_network_address: { userId, network, address } },
        create: {
          userId,
          network,
          address,
          lastUsedAt: tx.updatedAt,
          firstConfirmedAt: tx.updatedAt,
        },
        update: { lastUsedAt: tx.updatedAt },
      });
      saved += 1;

      if (!existing) {
        await NotificationService.notifyDurableBestEffort({
          userId,
          type: 'NEW_CRYPTO_ADDRESS',
          transactionId: `crypto-address-${network}-${address}`,
          title: 'New send address added',
          body: `A new address ending in ...${address.slice(-4)} was added to your saved addresses.`,
        }).catch((err) => {
          console.error('[CryptoAddressService] new-address notification failed:', err);
        });
      }
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

  /**
   * Stamp the first-confirmation timestamp, starting the trust cooldown.
   * Never overwrites an existing value only the *first* confirmed send to
   * an address should start its clock.
   */
  static async markFirstConfirmed(userId: string, network: string, address: string): Promise<void> {
    await prisma.savedCryptoAddress.updateMany({
      where: {
        userId,
        network,
        address: address.toLowerCase(),
        firstConfirmedAt: null,
      },
      data: { firstConfirmedAt: new Date() },
    });
  }

  /** Delete only if the row belongs to userId. Returns false when missing / not owned. */
  static async deleteForUser(userId: string, id: string): Promise<boolean> {
    const result = await prisma.savedCryptoAddress.deleteMany({
      where: { id, userId },
    });
    return result.count === 1;
  }
}
