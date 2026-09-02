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

  static async listForUser(
    userId: string,
    opts?: { currency?: string; type?: RecipientType | 'BANK' | 'MOBILE' | 'bank' | 'mobile' },
  ): Promise<SavedRecipientResponse[]> {
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
}
