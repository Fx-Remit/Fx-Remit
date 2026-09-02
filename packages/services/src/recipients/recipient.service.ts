import { prisma, type RecipientType, type SavedRecipient } from '@fx-remit/database';

export type UpsertSavedRecipientInput = {
  userId: string;
  type?: RecipientType | 'BANK' | 'MOBILE' | 'bank' | 'mobile';
  currency: string;
  institutionCode: string;
  institutionName: string;
  accountIdentifier: string;
  accountName: string;
};

function normalizeType(
  type: UpsertSavedRecipientInput['type'],
): RecipientType {
  const raw = (type || 'BANK').toString().toUpperCase();
  return raw === 'MOBILE' ? 'MOBILE' : 'BANK';
}

/** True when a string looks like a Paycrest institution code rather than a bank display name. */
function looksLikeInstitutionCode(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 32) return false;
  if (/\s/.test(v)) return false;
  // Digits (e.g. legacy GTBank "058") or uppercase codes (e.g. PALMNGPC)
  if (/^\d+$/.test(v)) return true;
  if (v === v.toUpperCase() && /^[A-Z0-9_-]+$/.test(v)) return true;
  return false;
}

export type SavedRecipientResponse = {
  id: string;
  type: RecipientType;
  currency: string;
  institutionCode: string;
  institutionName: string;
  accountIdentifier: string;
  accountName: string;
  lastUsedAt: string;
};

export class RecipientService {
  static serialize(row: SavedRecipient): SavedRecipientResponse {
    return {
      id: row.id,
      type: row.type,
      currency: row.currency,
      institutionCode: row.institutionCode,
      institutionName: row.institutionName,
      accountIdentifier: row.accountIdentifier,
      accountName: row.accountName,
      lastUsedAt: row.lastUsedAt.toISOString(),
    };
  }

  /**
   * Idempotent upsert on (userId, currency, institutionCode, accountIdentifier).
   * Skips when institution code or account are missing (cannot recreate Paycrest order).
   */
  static async upsert(input: UpsertSavedRecipientInput): Promise<SavedRecipientResponse | null> {
    const institutionCode = input.institutionCode.trim();
    const accountIdentifier = input.accountIdentifier.trim();
    const currency = input.currency.trim().toUpperCase();
    const institutionName = input.institutionName.trim();
    const accountName = input.accountName.trim();

    if (!institutionCode || !accountIdentifier || !currency || !institutionName || !accountName) {
      return null;
    }

    // Never address-book crypto / stellar pseudo-banks
    if (
      institutionCode.startsWith('crypto:') ||
      institutionName.startsWith('crypto:') ||
      institutionCode.startsWith('stellar:') ||
      institutionName.startsWith('stellar:')
    ) {
      return null;
    }

    const type = normalizeType(input.type);
    const now = new Date();

    const row = await prisma.savedRecipient.upsert({
      where: {
        userId_currency_institutionCode_accountIdentifier: {
          userId: input.userId,
          currency,
          institutionCode,
          accountIdentifier,
        },
      },
      create: {
        userId: input.userId,
        type,
        currency,
        institutionCode,
        institutionName,
        accountIdentifier,
        accountName,
        lastUsedAt: now,
      },
      update: {
        type,
        institutionName,
        accountName,
        lastUsedAt: now,
      },
    });

    return this.serialize(row);
  }

  /**
   * Pull remittance history into the address book when we have enough data to re-pay
   * (Paycrest institution code + account number). Safe / idempotent.
   */
  static async backfillFromRemittances(userId: string): Promise<number> {
    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'REMITTANCE',
        recipientAcc: { not: null },
        recipientName: { not: null },
        OR: [
          { recipientBankCode: { not: null } },
          { recipientBank: { not: null } },
        ],
      },
      select: {
        recipientName: true,
        recipientBank: true,
        recipientAcc: true,
        recipientBankCode: true,
        sourceToken: true,
        createdAt: true,
        payoutFiat: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let saved = 0;
    const seen = new Set<string>();

    for (const tx of txs) {
      const accountIdentifier = (tx.recipientAcc || '').trim();
      const accountName = (tx.recipientName || '').trim();
      const bankDisplay = (tx.recipientBank || '').trim();
      const bankCode = (tx.recipientBankCode || '').trim();

      if (!accountIdentifier || !accountName) continue;
      if (bankDisplay.startsWith('crypto:') || bankDisplay.startsWith('stellar:')) continue;

      const institutionCode =
        bankCode ||
        (looksLikeInstitutionCode(bankDisplay) ? bankDisplay : '');
      if (!institutionCode) continue;

      const institutionName =
        bankDisplay && !looksLikeInstitutionCode(bankDisplay)
          ? bankDisplay
          : bankDisplay || institutionCode;

      // Currency not on row — default NGN (current live corridor). Distinct accounts still unique by code+acc.
      const currency = 'NGN';
      const key = `${currency}|${institutionCode}|${accountIdentifier}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const row = await this.upsert({
        userId,
        type: 'BANK',
        currency,
        institutionCode,
        institutionName,
        accountIdentifier,
        accountName,
      });
      if (row) saved += 1;
    }

    return saved;
  }

  static async listForUser(
    userId: string,
    opts?: {
      currency?: string;
      type?: RecipientType | 'BANK' | 'MOBILE' | 'bank' | 'mobile';
      /** When true, upsert missing remittance recipients into the address book first. */
      backfill?: boolean;
    },
  ): Promise<SavedRecipientResponse[]> {
    if (opts?.backfill !== false) {
      await this.backfillFromRemittances(userId).catch((err) => {
        console.error('[RecipientService] backfill failed:', err);
      });
    }

    const currency = opts?.currency?.trim().toUpperCase();
    const type = opts?.type ? normalizeType(opts.type) : undefined;

    const rows = await prisma.savedRecipient.findMany({
      where: {
        userId,
        ...(currency ? { currency } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
    });

    return rows.map((r) => this.serialize(r));
  }

  /** Delete only if the row belongs to userId. Returns false when missing / not owned. */
  static async deleteForUser(userId: string, recipientId: string): Promise<boolean> {
    const result = await prisma.savedRecipient.deleteMany({
      where: { id: recipientId, userId },
    });
    return result.count === 1;
  }
}
