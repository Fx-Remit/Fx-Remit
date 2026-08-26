import { createHash, randomUUID } from 'node:crypto';
import { prisma, Prisma, type Transaction } from '@fx-remit/database';
import type { StellarCorridor } from '../types/types.js';

/** Stale claim reclaim window — covers crash between claim and Horizon submit. */
const STELLAR_PAYMENT_CLAIM_STALE_MS = 120_000;

export interface CreateStellarWithdrawStartInput {
  userId: string;
  /** Stellar account (G…) used for SEP-24 withdraw */
  account: string;
  anchorTransactionId: string;
  corridor: StellarCorridor;
  /** USDC amount as string/number from withdraw start */
  amountUsd: string | number;
  /** Optional retail fiat; 0 until quote is attached */
  payoutFiat?: string | number;
  anchorId?: string;
}

/**
 * Synthetic chain id for Stellar rail rows.
 * Must not equal EVM pending placeholder (0) or live L2s (8453 / 42220) so
 * @@unique([orderId, chainId]) and @@unique([chainId, blockNumber, logIndex])
 * never collide with createPending.
 */
export const STELLAR_RAIL_CHAIN_ID = 0x5354; // 21332 — "ST"

/**
 * Stable BigInt order id for Stellar rows under STELLAR_RAIL_CHAIN_ID.
 * Not an EVM order id until a Stellar-native id scheme exists.
 */
function stellarOrderIdFromAnchorTx(anchorTransactionId: string): bigint {
  const hex = createHash('sha256')
    .update(`stellar:${anchorTransactionId}`)
    .digest('hex')
    .slice(0, 15);
  return BigInt(`0x${hex}`);
}

export async function createStellarWithdrawStart(
  data: CreateStellarWithdrawStartInput,
): Promise<Transaction> {
  const externalId = `stellar:${data.anchorTransactionId}`;
  const amountUsd = new Prisma.Decimal(data.amountUsd);
  const payoutFiat = new Prisma.Decimal(data.payoutFiat ?? 0);

  const existing = await prisma.transaction.findFirst({
    where: {
      OR: [{ externalId }, { anchorTransactionId: data.anchorTransactionId }],
    },
  });

  if (existing) {
    if (existing.userId !== data.userId) {
      throw new Error(
        `Stellar anchor tx ${data.anchorTransactionId} belongs to another user`,
      );
    }
    if (existing.rail !== 'STELLAR') {
      throw new Error(
        `Transaction ${existing.id} exists but is not rail=STELLAR`,
      );
    }
    return existing;
  }

  const orderId = stellarOrderIdFromAnchorTx(data.anchorTransactionId);

  return prisma.transaction.create({
    data: {
      userId: data.userId,
      rail: 'STELLAR',
      anchorTransactionId: data.anchorTransactionId,
      corridor: data.corridor,
      sourceToken: 'USDC',
      amountUsd,
      payoutFiat,
      status: 'PENDING',
      type: 'REMITTANCE',
      externalId,
      txHash: `stellar-pending-${data.anchorTransactionId}`,
      chainId: STELLAR_RAIL_CHAIN_ID,
      orderId,
      blockNumber: orderId,
      logIndex: 0,
      recipientBank: data.anchorId ? `stellar:${data.anchorId}` : 'stellar:anchor',
      recipientAcc: data.account,
      stellarPaymentHash: null,
    },
  });
}

/**
 * Resolve a user for sandbox Stellar persist.
 *
 * Authority is always the SEP-10 `account` (G…):
 * - with `userId`: only if that user exists and `stellarPublicKey === account`
 * - without `userId`: lookup by `stellarPublicKey === account`
 *
 * Never trusts body `userId` alone (prevents attributing a withdraw to another user).
 * Returns null when nothing matches (smoke without an app user — skip DB write).
 */
export async function resolveStellarPersistUser(params: {
  userId?: string;
  account: string;
}): Promise<{ id: string } | null> {
  if (params.userId) {
    const byId = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, stellarPublicKey: true },
    });
    if (!byId || byId.stellarPublicKey !== params.account) {
      return null;
    }
    return { id: byId.id };
  }

  const byKey = await prisma.user.findUnique({
    where: { stellarPublicKey: params.account },
    select: { id: true },
  });
  return byKey;
}

/**
 * Link SEP-10 `account` (G…) onto the app user for this Privy DID.
 * Idempotent when already linked to the same key; rejects a different key.
 * Returns null when no User row exists yet (onboard first).
 */
export async function linkStellarPublicKey(params: {
  privyDid: string;
  account: string;
}): Promise<{ id: string; linked: boolean } | null> {
  const account = params.account.trim();
  if (!account) {
    throw new Error('Stellar account required to link');
  }

  const user = await prisma.user.findUnique({
    where: { privyDid: params.privyDid },
    select: { id: true, stellarPublicKey: true },
  });
  if (!user) {
    return null;
  }

  if (user.stellarPublicKey === account) {
    return { id: user.id, linked: false };
  }
  if (user.stellarPublicKey && user.stellarPublicKey !== account) {
    throw new Error(
      'User already linked to a different Stellar account — cannot re-link',
    );
  }

  try {
    const updated = await prisma.user.updateMany({
      where: { id: user.id, stellarPublicKey: null },
      data: { stellarPublicKey: account },
    });
    if (updated.count === 1) {
      return { id: user.id, linked: true };
    }
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    if (code === 'P2002') {
      throw new Error(
        `Stellar account ${account} is already linked to another user`,
      );
    }
    throw err;
  }

  const again = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, stellarPublicKey: true },
  });
  if (again?.stellarPublicKey === account) {
    return { id: again.id, linked: false };
  }
  throw new Error('Failed to link Stellar public key');
}

export type ClaimStellarPaymentSlotResult =
  | { outcome: 'won'; remittanceId: string; claimToken: string }
  | { outcome: 'reuse'; remittanceId: string; stellarPaymentHash: string }
  | { outcome: 'in_flight'; remittanceId: string }
  | { outcome: 'missing' };

/**
 * Cross-instance payment claim via CAS on txHash.
 * Winner alone may Horizon-submit; losers reuse hash or fail closed (in flight).
 */
export async function claimStellarPaymentSlot(
  anchorTransactionId: string,
): Promise<ClaimStellarPaymentSlotResult> {
  const row = await findStellarRemittanceByAnchorTx(anchorTransactionId);
  if (!row) {
    return { outcome: 'missing' };
  }
  if (row.stellarPaymentHash) {
    return {
      outcome: 'reuse',
      remittanceId: row.id,
      stellarPaymentHash: row.stellarPaymentHash,
    };
  }

  const claimToken = `stellar-claiming-${randomUUID()}`;
  const staleBefore = new Date(Date.now() - STELLAR_PAYMENT_CLAIM_STALE_MS);

  const claimed = await prisma.transaction.updateMany({
    where: {
      id: row.id,
      rail: 'STELLAR',
      stellarPaymentHash: null,
      OR: [
        { txHash: { startsWith: 'stellar-pending-' } },
        {
          AND: [
            { txHash: { startsWith: 'stellar-claiming-' } },
            { updatedAt: { lt: staleBefore } },
          ],
        },
      ],
    },
    data: {
      txHash: claimToken,
      updatedAt: new Date(),
    },
  });

  if (claimed.count === 1) {
    return { outcome: 'won', remittanceId: row.id, claimToken };
  }

  const again = await findStellarRemittanceByAnchorTx(anchorTransactionId);
  if (again?.stellarPaymentHash) {
    return {
      outcome: 'reuse',
      remittanceId: again.id,
      stellarPaymentHash: again.stellarPaymentHash,
    };
  }
  return { outcome: 'in_flight', remittanceId: again?.id ?? row.id };
}

/** Lookup sandbox STELLAR remittance by SEP-24 anchor transaction id. */
export async function findStellarRemittanceByAnchorTx(
  anchorTransactionId: string,
): Promise<Transaction | null> {
  return prisma.transaction.findFirst({
    where: {
      anchorTransactionId,
      rail: 'STELLAR',
    },
  });
}

/**
 * Attach Horizon payment hash to an existing rail=STELLAR remittance.
 * Idempotent when the same hash is already stored.
 */
export async function setStellarPaymentHash(params: {
  anchorTransactionId: string;
  stellarPaymentHash: string;
}): Promise<Transaction> {
  const hash = params.stellarPaymentHash.trim();
  if (!hash) {
    throw new Error('stellarPaymentHash required');
  }

  const row = await findStellarRemittanceByAnchorTx(params.anchorTransactionId);

  if (!row) {
    throw new Error(
      `No STELLAR remittance for anchor tx ${params.anchorTransactionId}`,
    );
  }

  if (row.stellarPaymentHash) {
    if (row.stellarPaymentHash === hash) {
      return row;
    }
    throw new Error(
      `Remittance ${row.id} already has stellarPaymentHash ${row.stellarPaymentHash}`,
    );
  }

  return prisma.transaction.update({
    where: { id: row.id },
    data: {
      stellarPaymentHash: hash,
      // Keep placeholder uniqueness but surface the payment on txHash for history
      txHash: hash,
      updatedAt: new Date(),
    },
  });
}
