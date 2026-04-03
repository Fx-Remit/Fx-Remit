import { PrismaClient } from "@prisma/client";

// Use any for the global to avoid type issues during setup
const globalForPrisma = globalThis as unknown as { prisma: any };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasource: {
      url: process.env.DATABASE_URL,
    },
  } as any);

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
