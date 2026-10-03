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

/**
 * Prisma unique violation on a constraint that includes the order id.
 *
 * Prisma 7 with @prisma/adapter-pg puts the columns under
 * `meta.driverAdapterError.cause.constraint.fields` (no `meta.target`); older
 * engines used `meta.target`. Both forms, and the message, are checked.
 *
 * `block_number` counts too: pending rows store `blockNumber = orderId` with
 * chainId 0, so an order-id clash can surface on (chain_id, block_number, log_index).
 */
export function isOrderIdCollision(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: unknown;
    message?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: unknown } };
    };
  };
  if (e.code !== 'P2002') return false;
  const where = JSON.stringify([
    e.meta?.target ?? null,
    e.meta?.driverAdapterError?.cause?.constraint ?? null,
    typeof e.message === 'string' ? e.message : null,
  ]);
  return /order_?id|block_?number/i.test(where);
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
