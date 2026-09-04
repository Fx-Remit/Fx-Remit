'use server';

import { prisma } from '@fx-remit/database';

/** Plain JSON-safe user for Client Components / server actions (no Prisma Decimal). */
function serializeUser<T extends {
  totalSentUsd?: { toString(): string } | number | null;
  walletBalance?: { toString(): string } | number | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastLoginAt?: Date | string | null;
}>(user: T) {
  return {
    ...user,
    totalSentUsd: user.totalSentUsd != null ? Number(user.totalSentUsd.toString()) : 0,
    walletBalance: user.walletBalance != null ? user.walletBalance.toString() : '0',
    createdAt:
      user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    updatedAt:
      user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt,
    lastLoginAt:
      user.lastLoginAt instanceof Date
        ? user.lastLoginAt.toISOString()
        : user.lastLoginAt ?? null,
  };
}

export async function getMe(privyDid: string) {
  if (!privyDid) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { privyDid },
    });

    if (!user) return null;

    return serializeUser(user);
  } catch (error) {
    console.error('getMe error:', error);
    return null;
  }
}
