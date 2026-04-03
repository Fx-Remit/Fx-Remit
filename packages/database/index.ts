import { PrismaClient } from '@prisma/client';

// Use any for the global to avoid type issues during setup
const globalForPrisma = globalThis as unknown as { prisma: any };

// High-fidelity lazy-init for Prisma (Build-Safe)
export const prisma =
  globalForPrisma.prisma ||
  (process.env.DATABASE_URL
    ? new PrismaClient({
        datasource: {
          url: process.env.DATABASE_URL,
        },
      } as any)
    : null);

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
