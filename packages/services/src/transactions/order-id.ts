import { randomInt } from 'node:crypto';

/**
 * App order id: milliseconds × 1000 + 3 random digits.
 *
 * - Two creates in the same millisecond only clash 1 time in 1000, and a clash
 *   is caught by the unique index and retried (`withUniqueOrderId`).
 * - Ids from different milliseconds can never clash, so a new order never
 *   reuses an id already funded on-chain (PayoutForwarder funds each id once).
 * - Stays below 2^53 until ~2255, so the id survives JSON numbers exactly.
 */
export function newOrderId(now: number = Date.now()): bigint {
  return BigInt(now) * 1000n + BigInt(randomInt(1000));
}

/** Prisma unique violation on a constraint that includes the order id. */
export function isOrderIdCollision(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return false;
  return /order_?id|block_?number/i.test(JSON.stringify(e.meta?.target ?? ''));
}

/**
 * Run `create` with a fresh order id, retrying only on an order-id collision.
 * The create must be atomic (reserve + insert in one transaction), so a failed
 * attempt leaves no reserve behind.
 */
export async function withUniqueOrderId<T>(
  create: (orderId: bigint) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await create(newOrderId());
    } catch (err) {
      if (i >= attempts || !isOrderIdCollision(err)) throw err;
    }
  }
}
