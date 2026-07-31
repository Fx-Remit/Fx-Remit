import { createHash } from 'node:crypto';
import { prisma, Prisma, type Transaction } from '@fx-remit/database';
import type { StellarCorridor } from '../types/types.js';

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
