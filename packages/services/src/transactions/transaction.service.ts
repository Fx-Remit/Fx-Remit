import { prisma, Status, Transaction, TransactionType, Prisma } from "@fx-remit/database";
import { RpcClient } from "../evm/rpc.client";
import { PAYCREST_SETTLEMENT } from "../paycrest/payout.service.js";

/** Thrown when createPending cannot reserve spendable ledger. */
export class InsufficientBalanceError extends Error {
  readonly code = "INSUFFICIENT_BALANCE" as const;
  constructor(
    readonly userId: string,
    readonly requiredUsd: string,
  ) {
    super(`Insufficient wallet balance to reserve ${requiredUsd} USD`);
    this.name = "InsufficientBalanceError";
  }
}

/**
 * Thrown when cancel/expire would restore ledger while a Paycrest order is
 * still fundable or provider status cannot be confirmed safe.
 */
export class ProviderOrderStillLiveError extends Error {
  readonly code = "PROVIDER_ORDER_STILL_LIVE" as const;
  constructor(
    readonly externalId: string,
    readonly providerStatus?: string,
  ) {
    super(
      providerStatus
        ? `Cannot restore ledger for ${externalId}: Paycrest order status is ${providerStatus}`
        : `Cannot restore ledger for ${externalId}: Paycrest order may still be live`,
    );
    this.name = "ProviderOrderStillLiveError";
  }
}

const LEDGER_RESTORED_STATUSES: Status[] = ["FAILED", "REFUNDING"];
// Once a remittance reaches any of these it is settled/reversed — never transition out.
// REFUND_REQUIRED is an ops hold : Paycrest must not move it; only restoreRefundRequired /
// completeRefundRequiredAfterOnChainCredit may leave it.
const TERMINAL_STATUSES: Status[] = [
  "COMPLETED",
  "FAILED",
  "REFUNDING",
  "REFUND_REQUIRED",
];

/**
 * Base columns for API responses / create-pending returns.
 * Omits rail / stellar / refund columns so reads still work if those migrations lag.
 * Money-path writers that *need* those columns (refund linking, Stellar) still require
 * `prisma migrate deploy` on prod — do not paper over that with selects alone.
 */
const TRANSACTION_API_SELECT = {
  id: true,
  userId: true,
  orderId: true,
  txHash: true,
  chainId: true,
  blockNumber: true,
  logIndex: true,
  sourceToken: true,
  amountUsd: true,
  payoutFiat: true,
  status: true,
  type: true,
  externalId: true,
  recipientName: true,
  recipientBank: true,
  recipientAcc: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Row shape returned by TRANSACTION_API_SELECT — not a full Prisma Transaction. */
export type TransactionApiRow = Prisma.TransactionGetPayload<{
  select: typeof TRANSACTION_API_SELECT;
}>;

/** True when Prisma failed because the live DB schema lags the client schema. */
function isHistorySchemaDriftError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  return (
    code === "P2022" ||
    /column .* does not exist/i.test(message) ||
    /does not exist in the current database/i.test(message) ||
    /type .* does not exist/i.test(message) ||
    /invalid input value for enum/i.test(message)
  );
}

export interface TransactionResponse {
  id: string;
  userId: string;
  orderId: string;
  txHash: string;
  chainId: number;
  blockNumber: string;
  logIndex: number;
  sourceToken: string;
  amountUsd: number;
  payoutFiat: number;
  status: Status;
  type: TransactionType;
  externalId: string | null;
  recipientName: string | null;
  recipientBank: string | null;
  recipientAcc: string | null;
  createdAt: string;
  updatedAt: string;
}

export class TransactionService {
  /**
   * Serialize a Prisma Transaction model to a JSON-safe response object.
   * Explicit field pick — never spread Prisma rows (BigInt/`Decimal` break JSON.stringify).
   */
  static serialize(tx: TransactionApiRow): TransactionResponse {
    return {
      id: tx.id,
      userId: tx.userId,
      orderId: tx.orderId.toString(),
      txHash: tx.txHash,
      chainId: tx.chainId,
      blockNumber: tx.blockNumber.toString(),
      logIndex: tx.logIndex,
      sourceToken: tx.sourceToken,
      amountUsd: Number(tx.amountUsd.toString()),
      payoutFiat: Number(tx.payoutFiat.toString()),
      status: tx.status,
      type: tx.type,
      externalId: tx.externalId,
      recipientName: tx.recipientName,
      recipientBank: tx.recipientBank,
      recipientAcc: tx.recipientAcc,
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
    };
  }

  /**
   * Fetch transaction history for a specific user with pagination.
   * Prefer Prisma select (skips rail/stellar/refund). On schema-drift errors
   * only, fall back to raw SQL over the legacy column set so the home feed
   * cannot stay dark — other DB errors still fail closed.
   */
  static async getHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<TransactionResponse[]> {
    const parsedLimit = Number(limit);
    const take = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(0, Math.trunc(parsedLimit)), 100)
      : 20;
    const parsedOffset = Number(offset);
    const skip = Number.isFinite(parsedOffset)
      ? Math.max(0, Math.trunc(parsedOffset))
      : 0;

    try {
      const transactions = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take,
        skip,
        select: TRANSACTION_API_SELECT,
      });
      return transactions.map((row) => TransactionService.serialize(row));
    } catch (err) {
      if (!isHistorySchemaDriftError(err)) {
        throw err;
      }

      console.error(
        JSON.stringify({
          alert: "HISTORY_SCHEMA_DRIFT_FALLBACK",
          userId,
          take,
          skip,
          message: err instanceof Error ? err.message : String(err),
        }),
      );

      const rows = await prisma.$queryRaw<TransactionApiRow[]>`
        SELECT
          id,
          user_id AS "userId",
          order_id AS "orderId",
          tx_hash AS "txHash",
          chain_id AS "chainId",
          block_number AS "blockNumber",
          log_index AS "logIndex",
          source_token AS "sourceToken",
          amount_usd AS "amountUsd",
          payout_fiat AS "payoutFiat",
          status::text AS status,
          type::text AS type,
          external_id AS "externalId",
          recipient_name AS "recipientName",
          recipient_bank AS "recipientBank",
          recipient_acc AS "recipientAcc",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM transactions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${take}
        OFFSET ${skip}
      `;

      return rows.map((row) => TransactionService.serialize(row));
    }
  }

  /**
   * Update transaction details from the Goldsky indexer.
   * Uses orderId as the idempotency key.
   */
  static async updateFromIndexer(data: {
    orderId: bigint;
    txHash: string;
    chainId: number;
    blockNumber: bigint;
    logIndex: number;
    sender: string;
    recipient?: string;
    fromToken?: string;
    amountUsd?: number | string;
  }) {
    const allUsers = await prisma.user.findMany({
      select: { id: true, walletAddress: true },
    });

    const user = allUsers.find(
      (u: any) =>
        u.walletAddress?.toLowerCase() === data.sender.toLowerCase() ||
        u.walletAddress?.toLowerCase() === data.recipient?.toLowerCase(),
    );

    if (!user) {
      console.error(
        `[ERROR] No user found for Sender: ${data.sender} or Recipient: ${data.recipient}`,
      );
      return null; // Don't try to create a transaction for a user that doesn't exist
    }

    const amount = new Prisma.Decimal(data.amountUsd || 0);

    // Prefer exact (txHash, logIndex) — multiple ERC-20 / event logs can share a txHash.
    let existing = await prisma.transaction.findUnique({
      where: {
        txHash_logIndex: {
          txHash: data.txHash,
          logIndex: data.logIndex,
        },
      },
    });

    // Frontend may stamp the real txHash onto the pending row while logIndex is still 0.
    if (!existing) {
      existing = await prisma.transaction.findFirst({
        where: {
          txHash: data.txHash,
          logIndex: 0,
          type: "REMITTANCE",
          status: { in: ["PENDING", "PROCESSING", "VERIFIED"] },
        },
      });
    }

    if (!existing) {
      existing = await prisma.transaction.findUnique({
        where: {
          orderId_chainId: {
            orderId: data.orderId,
            chainId: data.chainId,
          },
        },
      });
    }

    // Check for Block Finality (Confirmation Depth)
    const currentBlock = await RpcClient.getBlockNumber(data.chainId);
    const confirmations = currentBlock - data.blockNumber;
    const threshold = BigInt(process.env.CONFIRMATION_THRESHOLD || "5");

    const isFinalized = confirmations >= threshold;

    const isIncoming =
      data.recipient?.toLowerCase() === user.walletAddress?.toLowerCase();
    const type: "DEPOSIT" | "REMITTANCE" =
      isIncoming && !existing?.recipientAcc ? "DEPOSIT" : "REMITTANCE";

    // Only transition to VERIFIED if enough confirmations are reached
    // Never downgrade from VERIFIED, COMPLETED, etc.
    const canVerify = existing?.status === "PENDING" || !existing;
    const newStatus: Status = (canVerify && isFinalized)
      ? "VERIFIED"
      : (existing?.status as Status || "PENDING");

    //  Perform atomic update: Transaction + User Stats
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const dbTx = await tx.transaction.upsert({
        where: {
          orderId_chainId: {
            orderId: data.orderId,
            chainId: data.chainId,
          },
        },
        update: {
          txHash: data.txHash,
          chainId: data.chainId,
          blockNumber: data.blockNumber,
          logIndex: data.logIndex,
          status: newStatus,
          type,
        },
        create: {
          orderId: data.orderId,
          txHash: data.txHash,
          chainId: data.chainId,
          blockNumber: data.blockNumber,
          logIndex: data.logIndex,
          userId: user.id,
          sourceToken: data.fromToken || "CELO",
          amountUsd: amount,
          payoutFiat: 0,
          status: newStatus,
          type,
        },
      });

      // Ledger: deposits credit on first VERIFIED.
      // Remittances: debit on createPending; only debit here if indexer created the row (no prior pending).
      const shouldCreditDeposit =
        type === "DEPOSIT" &&
        newStatus === "VERIFIED" &&
        (existing?.status === "PENDING" || !existing);
      const shouldDebitRemittance =
        type === "REMITTANCE" &&
        newStatus === "VERIFIED" &&
        !existing;

      if (shouldCreditDeposit) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            walletBalance: { increment: amount },
            transactionCount: { increment: 1 },
          },
        });
      } else if (shouldDebitRemittance) {
        // Same gte CAS as createPending (#97) — never drive spendable negative.
        const reserved = await tx.user.updateMany({
          where: {
            id: user.id,
            walletBalance: { gte: amount },
          },
          data: {
            walletBalance: { decrement: amount },
            totalSentUsd: { increment: amount },
            transactionCount: { increment: 1 },
          },
        });
        if (reserved.count !== 1) {
          await tx.transaction.update({
            where: { id: dbTx.id },
            data: {
              status: "REFUND_REQUIRED",
              updatedAt: new Date(),
            },
          });
          console.error(
            JSON.stringify({
              alert: "INDEXER_DEBIT_INSUFFICIENT_BALANCE",
              severity: "high",
              transactionId: dbTx.id,
              userId: user.id,
              orderId: data.orderId.toString(),
              amountUsd: amount.toString(),
              txHash: data.txHash,
              message:
                "Indexer remittance created but walletBalance < amount; flagged REFUND_REQUIRED without debiting (fail closed)",
            }),
          );
          return await tx.transaction.findUnique({ where: { id: dbTx.id } });
        }
      }

      return dbTx;
    });
  }

  /**
   * Update transaction status from Paycrest webhook events.
   * Gated by a state machine to prevent out-of-order webhooks from overwriting terminal states.
   * FAILED / REFUNDING restore spendable ledger only for unfunded placeholder hashes
   * (pending-* / abandoned-*). Funded remittances wait for the on-chain refund deposit (#90).
   */
  /**
   * Resolve a remittance by Paycrest order id, our reference (externalId), or pending-{orderId} hash.
   */
  static async findByPaycrestKey(key: string) {
    if (!key) return null;

    const byExternal = await prisma.transaction.findUnique({
      where: { externalId: key },
    });
    if (byExternal) return byExternal;

    return await prisma.transaction.findFirst({
      where: {
        type: "REMITTANCE",
        OR: [
          { txHash: `pending-${key}` },
          { txHash: `abandoned-${key}` },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateFromPaycrest(externalId: string, status: Status) {
    const tx = await this.findByPaycrestKey(externalId);

    if (!tx) {
      console.warn(`[TransactionService] No transaction found for Paycrest ID: ${externalId}`);
      return null;
    }

    // Terminal states: COMPLETED and FAILED cannot be transitioned out of.
    if (TERMINAL_STATUSES.includes(tx.status)) {
      console.log(
        `[TransactionService] Transaction #${tx.orderId.toString()} is already in terminal state [${tx.status}]. Ignoring transition to [${status}].`
      );
      return tx;
    }

    const placeholderHash =
      tx.txHash.startsWith("pending-") || tx.txHash.startsWith("abandoned-");

    // Funded remittances (real on-chain hash) must not restore here — Alchemy will
    // credit the Paycrest crypto refund once via creditInboundDeposit (#90).
    const shouldRestoreLedger =
      tx.type === "REMITTANCE" &&
      LEDGER_RESTORED_STATUSES.includes(status) &&
      !LEDGER_RESTORED_STATUSES.includes(tx.status) &&
      placeholderHash;

    if (shouldRestoreLedger) {
      return await prisma.$transaction(async (client: Prisma.TransactionClient) => {
        // Atomic claim (#91): only one concurrent FAILED/REFUNDING webhook restores.
        // Do not pin snapshot status — a concurrent PENDING→PROCESSING must not skip
        // restore for a still-unfunded remittance.
        const claimed = await client.transaction.updateMany({
          where: {
            id: tx.id,
            type: "REMITTANCE",
            status: { notIn: TERMINAL_STATUSES },
            OR: [
              { txHash: { startsWith: "pending-" } },
              { txHash: { startsWith: "abandoned-" } },
            ],
          },
          data: {
            status,
            updatedAt: new Date(),
          },
        });

        if (claimed.count !== 1) {
          const current = await client.transaction.findUnique({
            where: { id: tx.id },
          });
          if (!current) return null;
          if (TERMINAL_STATUSES.includes(current.status)) return current;
          // Non-terminal + CAS lost ⇒ hash is no longer a placeholder (attachOnChainHash).
          // Status only; Alchemy credits the on-chain refund.
          return await client.transaction.update({
            where: { id: tx.id },
            data: {
              status,
              updatedAt: new Date(),
            },
          });
        }

        await client.user.update({
          where: { id: tx.userId },
          data: {
            walletBalance: { increment: tx.amountUsd },
            totalSentUsd: { decrement: tx.amountUsd },
            // Keep transactionCount — the attempt still happened
          },
        });

        return await client.transaction.findUnique({ where: { id: tx.id } });
      });
    }

    return await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Mark an abandoned remittance FAILED and restore ledger when no on-chain hash was attached.
   * Use when the user rejects the wallet send or post-createPending steps fail before Paycrest settles.
   *
   * Never restores ledger while a linked / likely-live Paycrest order is still fundable
   * unless `forceUnpaid` (ops only): live Paycrest amountPaid must still be 0.
   */
  static async cancelAbandonedPending(
    externalId: string,
    opts?: { forceUnpaid?: boolean },
  ) {
    const tx = await this.findByPaycrestKey(externalId);

    if (!tx) {
      return null;
    }

    if (tx.type !== "REMITTANCE") {
      return tx;
    }

    if (TERMINAL_STATUSES.includes(tx.status) || LEDGER_RESTORED_STATUSES.includes(tx.status)) {
      return tx;
    }

    // Only auto-cancel rows that never left the pending-* placeholder hash
    if (!tx.txHash.startsWith("pending-")) {
      throw new Error(
        `Cannot cancel remittance ${externalId}: on-chain txHash already attached`,
      );
    }

    if (opts?.forceUnpaid) {
      await this.assertPaycrestUnpaidForForceRestore(tx);
    } else {
      await this.assertProviderSafeToRestoreLedger(tx);
    }

    // CAS on the snapshot we just validated loses to concurrent PENDING→PROCESSING claim.
    return this.failAndReleasePlaceholderCas(tx);
  }

  /**
   * Restore ledger after *this* request's Paycrest create returned a client 4xx
   * (no order). CAS requires the hash still be app-local so a sibling live order
   * cannot be refunded out from under us.
   */
  static async refundAfterFailedProviderCreate(externalId: string) {
    const tx = await this.findByPaycrestKey(externalId);
    if (!tx || tx.type !== "REMITTANCE") {
      return tx;
    }
    if (TERMINAL_STATUSES.includes(tx.status) || LEDGER_RESTORED_STATUSES.includes(tx.status)) {
      return tx;
    }
    if (!tx.txHash.startsWith("pending-")) {
      throw new Error(
        `Cannot refund remittance ${externalId}: on-chain txHash already attached`,
      );
    }
    const placeholder = this.paycrestOrderIdFromTxHash(tx.txHash);
    if (!placeholder || !this.isAppLocalPendingKey(placeholder, tx.externalId)) {
      throw new ProviderOrderStillLiveError(tx.externalId ?? externalId, "linked-order");
    }
    return this.failAndReleasePlaceholderCas(tx);
  }

  /**
   * Revert PROCESSING → PENDING when the hash is still app-local (no ledger restore).
   * Prefer leaving the claim held on ambiguous provider failures; createPaycrestOrder
   * stale lease (>30s) already allows retry without flipping to PENDING.
   */
  static async releaseCreateClaim(externalId: string) {
    const tx = await this.findByPaycrestKey(externalId);
    if (!tx || tx.type !== "REMITTANCE") return tx;
    if (tx.status !== "PROCESSING" || !tx.txHash.startsWith("pending-")) return tx;
    const placeholder = this.paycrestOrderIdFromTxHash(tx.txHash);
    if (!placeholder || !this.isAppLocalPendingKey(placeholder, tx.externalId)) {
      return tx;
    }
    await prisma.transaction.updateMany({
      where: {
        id: tx.id,
        status: "PROCESSING",
        txHash: tx.txHash,
      },
      data: {
        status: "PENDING",
        updatedAt: new Date(),
      },
    });
    return await prisma.transaction.findUnique({ where: { id: tx.id } });
  }

  /**
   * Atomically mark FAILED + restore ledger only if status/txHash still match the
   * provider-safe snapshot (closes cancel vs claim TOCTOU).
   */
  private static async failAndReleasePlaceholderCas(tx: {
    id: string;
    userId: string;
    orderId: bigint;
    amountUsd: Prisma.Decimal | number | string;
    status: Status;
    txHash: string;
    externalId: string | null;
  }) {
    return await prisma.$transaction(async (client: Prisma.TransactionClient) => {
      const claimed = await client.transaction.updateMany({
        where: {
          id: tx.id,
          status: tx.status,
          txHash: tx.txHash,
          type: "REMITTANCE",
        },
        data: {
          status: "FAILED",
          updatedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ProviderOrderStillLiveError(
          tx.externalId ?? tx.id,
          "cas-lost",
        );
      }

      await client.user.update({
        where: { id: tx.userId },
        data: {
          walletBalance: { increment: tx.amountUsd },
          totalSentUsd: { decrement: tx.amountUsd },
        },
      });

      return await client.transaction.update({
        where: { id: tx.id },
        data: {
          txHash: `abandoned-${tx.id}`,
          blockNumber: tx.orderId,
          updatedAt: new Date(),
        },
      });
    });
  }

  /**
   * App-local pending keys (not Paycrest order ids).
   * Prefetch uses `pnd_*`; crypto withdraw uses `crypto_*`.
   * Client idempotency keys are stored as `pending-{externalId}` and must match
   * `externalId` — calling Paycrest getOrder on those 404s and would fail closed.
   */
  static isAppLocalPendingKey(
    key: string,
    externalId?: string | null,
  ): boolean {
    if (key.startsWith("pnd_") || key.startsWith("crypto_")) return true;
    return Boolean(externalId) && key === externalId;
  }

  static isCryptoWithdraw(recipientBank: string | null | undefined): boolean {
    return (recipientBank || '').startsWith('crypto:');
  }

  /**
   * Paycrest statuses where it is safe to auto-expire / refund the ledger reserve.
   * Anything else (pending, processing, validated, …) may already have received funds.
   */
  private static readonly PAYCREST_EXPIRE_SAFE = new Set([
    'expired',
    'cancelled',
    'canceled',
    'failed',
    'refunded',
  ]);

  /**
   * Statuses where Paycrest has opened a receive window but has not progressed
   * toward settlement. Do not treat pending/processing/validated as unpaid-window
   * closable — those may already be fundable or mid-settlement.
   */
  private static readonly PAYCREST_INITIATED_UNPAID = new Set(['initiated']);

  /**
   * Gate ledger restore on provider state (#89).
   * - Paycrest order id in pending-* hash → PAYCREST_EXPIRE_SAFE, OR
   *   status=initiated + explicit amountPaid=0 + past validUntil
   * - App-local pending key + PROCESSING → order may exist before attach; refuse restore
   * - App-local + PENDING → no provider order yet; allow
   * - Lookup failure / missing amountPaid → refuse (fail closed)
   */
  private static async assertProviderSafeToRestoreLedger(tx: {
    externalId: string | null;
    txHash: string;
    status: Status;
    recipientBank: string | null;
  }) {
    if (this.isCryptoWithdraw(tx.recipientBank)) {
      // Crypto path has no Paycrest order; callers that must not auto-refund
      // (expire cron) should skip before calling cancel.
      return;
    }

    const placeholder = this.paycrestOrderIdFromTxHash(tx.txHash);
    if (!placeholder) {
      return;
    }

    if (this.isAppLocalPendingKey(placeholder, tx.externalId)) {
      // Claim flips PENDING → PROCESSING before createOrder. Refuse restore
      // while that window is open (order id not on the hash yet).
      if (tx.status === "PROCESSING") {
        throw new ProviderOrderStillLiveError(
          tx.externalId ?? placeholder,
          "processing-unattached",
        );
      }
      return;
    }

    const { PayoutService } = await import("../paycrest/payout.service.js");
    const live = await PayoutService.getSettlementOrder(placeholder);
    if (!live.success || !live.order) {
      throw new ProviderOrderStillLiveError(tx.externalId ?? placeholder);
    }
    const order = live.order as {
      status?: string;
      amountPaid?: string | number | null;
      providerAccount?: { validUntil?: string | null };
    };
    const status = String(order.status || "").toLowerCase();
    if (this.PAYCREST_EXPIRE_SAFE.has(status)) {
      return;
    }
    // Paycrest often leaves status=initiated after the receive window closes.
    // Restore only for that narrow status with an explicit zero amountPaid.
    if (this.isPaycrestReceiveWindowClosedUnpaid(order, status)) {
      return;
    }
    throw new ProviderOrderStillLiveError(
      tx.externalId ?? placeholder,
      status || "unknown",
    );
  }

  /**
   * True only when status is initiated, amountPaid is an explicit numeric zero,
   * and providerAccount.validUntil is in the past. Missing amountPaid fails closed.
   */
  private static isPaycrestReceiveWindowClosedUnpaid(
    order: {
      amountPaid?: string | number | null;
      providerAccount?: { validUntil?: string | null };
    },
    status: string,
  ): boolean {
    if (!this.PAYCREST_INITIATED_UNPAID.has(status)) {
      return false;
    }
    if (!this.isPaycrestAmountExplicitlyZero(order.amountPaid)) {
      return false;
    }
    const validUntil = order.providerAccount?.validUntil;
    if (!validUntil) {
      return false;
    }
    const untilMs = Date.parse(validUntil);
    if (!Number.isFinite(untilMs)) {
      return false;
    }
    return Date.now() > untilMs;
  }

  /** Fail closed: absent / blank / non-numeric amountPaid is not treated as unpaid. */
  private static isPaycrestAmountExplicitlyZero(
    amountPaid?: string | number | null,
  ): boolean {
    if (amountPaid == null) {
      return false;
    }
    if (typeof amountPaid === "string" && amountPaid.trim() === "") {
      return false;
    }
    const paid = Number(
      typeof amountPaid === "string" ? amountPaid.trim() : amountPaid,
    );
    return Number.isFinite(paid) && paid === 0;
  }

  /**
   * Ops escape when Paycrest leaves status=initiated and keeps sliding validUntil.
   * Still fail-closed unless status is initiated and amountPaid is explicitly 0.
   */
  private static async assertPaycrestUnpaidForForceRestore(tx: {
    externalId: string | null;
    txHash: string;
    recipientBank: string | null;
  }) {
    if (this.isCryptoWithdraw(tx.recipientBank)) {
      return;
    }
    const placeholder = this.paycrestOrderIdFromTxHash(tx.txHash);
    if (!placeholder) {
      return;
    }
    if (this.isAppLocalPendingKey(placeholder, tx.externalId)) {
      return;
    }
    const { PayoutService } = await import("../paycrest/payout.service.js");
    const live = await PayoutService.getSettlementOrder(placeholder);
    if (!live.success || !live.order) {
      throw new ProviderOrderStillLiveError(tx.externalId ?? placeholder);
    }
    const order = live.order as {
      status?: string;
      amountPaid?: string | number | null;
    };
    const status = String(order.status || "").toLowerCase();
    if (!this.PAYCREST_INITIATED_UNPAID.has(status)) {
      throw new ProviderOrderStillLiveError(
        tx.externalId ?? placeholder,
        status || "unknown",
      );
    }
    if (!this.isPaycrestAmountExplicitlyZero(order.amountPaid)) {
      throw new ProviderOrderStillLiveError(
        tx.externalId ?? placeholder,
        `amountPaid=${order.amountPaid == null ? "missing" : String(order.amountPaid)}`,
      );
    }
    console.warn(
      `[TransactionService] forceUnpaid restore for ${tx.externalId ?? placeholder} ` +
        `(Paycrest status=${status}, amountPaid=0) — ` +
        "receive address may still be fundable; confirm on-chain balance first",
    );
  }

  private static async touchPendingUpdatedAt(id: string) {
    await prisma.transaction.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  /**
   * Expire stale prefetched / abandoned remittances that never received an on-chain hash.
   * Safe for cron: only touches pending-* placeholder hashes.
   *
   * Never auto-refund crypto withdraws (broadcast may have succeeded without sync-hash).
   * Provider-safe checks live in cancelAbandonedPending (shared with cancel API).
   */
  static async expireStalePendingRemittances(opts?: {
    olderThanMs?: number;
    limit?: number;
  }) {
    const olderThanMs = opts?.olderThanMs ?? 30 * 60 * 1000;
    const limit = opts?.limit ?? 100;
    const cutoff = new Date(Date.now() - olderThanMs);

    const stale = await prisma.transaction.findMany({
      where: {
        type: 'REMITTANCE',
        status: { in: ['PENDING', 'PROCESSING'] },
        txHash: { startsWith: 'pending-' },
        updatedAt: { lte: cutoff },
      },
      select: { id: true, externalId: true, txHash: true, recipientBank: true },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    let expired = 0;
    let failed = 0;
    let deferred = 0;

    for (const row of stale) {
      const key = row.externalId;
      if (!key) {
        failed += 1;
        continue;
      }
      try {
        // Crypto may already be on-chain while hash is still pending-crypto_* — never auto-refund.
        if (this.isCryptoWithdraw(row.recipientBank)) {
          await this.touchPendingUpdatedAt(row.id);
          deferred += 1;
          continue;
        }

        await this.cancelAbandonedPending(key);
        expired += 1;
      } catch (err) {
        if (err instanceof ProviderOrderStillLiveError) {
          await this.touchPendingUpdatedAt(row.id);
          deferred += 1;
          continue;
        }
        failed += 1;
        console.error(
          `[TransactionService] expireStalePendingRemittances failed for ${key}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { scanned: stale.length, expired, failed, deferred };
  }

  /**
   * Escalate Instant Send claims stuck in broadcasting-* (ambiguous Privy / attach failure).
   * Does NOT auto-release — releasing would reopen a double-send window if the first
   * transfer already landed. Ops: attach known 0x hash or force-release after chain check.
   */
  static async escalateStaleBroadcastClaims(opts?: {
    olderThanMs?: number;
    limit?: number;
  }) {
    const olderThanMs = opts?.olderThanMs ?? 30 * 60 * 1000;
    const limit = opts?.limit ?? 100;
    const cutoff = new Date(Date.now() - olderThanMs);

    const stale = await prisma.transaction.findMany({
      where: {
        type: 'REMITTANCE',
        status: { in: ['PENDING', 'PROCESSING'] },
        txHash: { startsWith: 'broadcasting-' },
        updatedAt: { lte: cutoff },
      },
      select: {
        id: true,
        orderId: true,
        externalId: true,
        txHash: true,
        amountUsd: true,
        updatedAt: true,
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    for (const row of stale) {
      console.error(
        JSON.stringify({
          alert: 'BROADCAST_CLAIM_STUCK',
          severity: 'high',
          transactionId: row.id,
          orderId: row.orderId.toString(),
          externalId: row.externalId,
          txHash: row.txHash,
          amountUsd: row.amountUsd.toString(),
          updatedAt: row.updatedAt.toISOString(),
          olderThanMs,
          message:
            'Instant Send claim stuck on broadcasting-* — ops: attach on-chain hash via sync-hash / cancel-stuck-pending --attach, or --force-release only after confirming no USDC left the wallet',
        }),
      );
    }

    return { scanned: stale.length, escalated: stale.length };
  }

  /**
   * Load a remittance owned by `userId` for Instant Send broadcast.
   * Accepts PENDING/PROCESSING rows (create-pending may claim PROCESSING).
   */
  static async findPendingRemittanceForBroadcast(opts: {
    userId: string;
    orderId: bigint;
  }) {
    const tx = await prisma.transaction.findUnique({
      where: {
        orderId_chainId: {
          orderId: opts.orderId,
          chainId: 0,
        },
      },
    });

    if (!tx) {
      // Already stamped with Base chainId after a prior broadcast attempt.
      const onBase = await prisma.transaction.findUnique({
        where: {
          orderId_chainId: {
            orderId: opts.orderId,
            chainId: PAYCREST_SETTLEMENT.chainId,
          },
        },
      });
      if (!onBase || onBase.userId !== opts.userId || onBase.type !== 'REMITTANCE') {
        return null;
      }
      return onBase;
    }

    if (tx.userId !== opts.userId || tx.type !== 'REMITTANCE') {
      return null;
    }
    return tx;
  }

  /**
   * True when `txHash` is a real EVM transaction hash (gateway / indexer funded).
   * Placeholder hashes use `pending-` / `abandoned-` prefixes instead.
   */
  static isOnChainTxHash(txHash: string | null | undefined): boolean {
    return !!txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash);
  }

  /**
   * App-local unfunded placeholders only. Indexer `unknown-${orderId}-${chainId}`
   * stubs are gateway-funded rows missing a hash — must NOT restore spendable.
   */
  static isAppLocalPlaceholderHash(txHash: string | null | undefined): boolean {
    return (
      !!txHash &&
      (txHash.startsWith("pending-") || txHash.startsWith("abandoned-"))
    );
  }

  /**
   * Orphan VERIFIED remittance missing recipient metadata (#96).
   *
   * - App-local placeholder (pending- or abandoned- prefix): restore spendable and mark FAILED.
   * - On-chain 0x or indexer unknown- stubs: REFUND_REQUIRED without restore (funds may
   *   be at gateway; Alchemy may later creditInboundDeposit). Ops write-off only via
   *   restoreRefundRequired when no refund will credit; otherwise wait for refund deposit.
   *   TTL escalates these holds without restoring spendable.
   */
  static async flagOrphanRefundRequired(tx: {
    id: string;
    userId: string;
    orderId: bigint;
    amountUsd: Prisma.Decimal | number | string;
    status: Status;
    txHash: string;
    externalId: string | null;
  }): Promise<{
    outcome: "restored_failed" | "flagged" | "skipped";
    transaction: Transaction | null;
  }> {
    if (tx.status !== "VERIFIED") {
      const current = await prisma.transaction.findUnique({ where: { id: tx.id } });
      return { outcome: "skipped", transaction: current };
    }

    if (this.isAppLocalPlaceholderHash(tx.txHash)) {
      const updated = await this.failAndReleasePlaceholderCas(tx);
      console.warn(
        JSON.stringify({
          audit: "ORPHAN_PLACEHOLDER_RESTORED",
          transactionId: tx.id,
          orderId: tx.orderId.toString(),
          amountUsd: String(tx.amountUsd),
          message:
            "Orphan remittance had app-local placeholder hash; ledger restored and marked FAILED",
        }),
      );
      return { outcome: "restored_failed", transaction: updated };
    }

    const claimed = await prisma.transaction.updateMany({
      where: { id: tx.id, status: "VERIFIED", type: "REMITTANCE" },
      data: {
        status: "REFUND_REQUIRED",
        updatedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      const current = await prisma.transaction.findUnique({ where: { id: tx.id } });
      return { outcome: "skipped", transaction: current };
    }

    console.error(
      JSON.stringify({
        alert: "REFUND_REQUIRED",
        severity: "high",
        transactionId: tx.id,
        orderId: tx.orderId.toString(),
        amountUsd: String(tx.amountUsd),
        txHash: tx.txHash,
        externalId: tx.externalId,
        message:
          "Orphan remittance missing recipient metadata (on-chain or unknown-* hash); spendable reserved until on-chain refund credits via creditInboundDeposit or ops write-off via restoreRefundRequired",
      }),
    );

    const flagged = await prisma.transaction.findUnique({ where: { id: tx.id } });
    return { outcome: "flagged", transaction: flagged };
  }

  /**
   * Ops write-off (#96): REFUND_REQUIRED → FAILED and restore spendable.
   * Refuses if refundTxHash is already set (refund deposit owns the credit).
   * Only use when no on-chain Paycrest refund will also credit via creditInboundDeposit.
   * Prefer completeRefundRequiredAfterOnChainCredit when the refund deposit already landed.
   */
  static async restoreRefundRequired(transactionId: string) {
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.type !== "REMITTANCE") {
      return tx;
    }
    if (tx.status !== "REFUND_REQUIRED") {
      return tx;
    }
    if (tx.refundTxHash) {
      return this.completeRefundRequiredAfterOnChainCredit(transactionId);
    }

    return await prisma.$transaction(async (client: Prisma.TransactionClient) => {
      const claimed = await client.transaction.updateMany({
        where: {
          id: tx.id,
          status: "REFUND_REQUIRED",
          type: "REMITTANCE",
        },
        data: {
          status: "FAILED",
          updatedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        return await client.transaction.findUnique({ where: { id: tx.id } });
      }

      await client.user.update({
        where: { id: tx.userId },
        data: {
          walletBalance: { increment: tx.amountUsd },
          totalSentUsd: { decrement: tx.amountUsd },
        },
      });

      console.warn(
        JSON.stringify({
          audit: "REFUND_REQUIRED_LEDGER_RESTORED",
          transactionId: tx.id,
          orderId: tx.orderId.toString(),
          amountUsd: tx.amountUsd.toString(),
          txHash: tx.txHash,
        }),
      );

      return await client.transaction.findUnique({ where: { id: tx.id } });
    });
  }

  /**
   * Ops path (#96): REFUND_REQUIRED → FAILED with no ledger restore because
   * creditInboundDeposit already returned spendable for the on-chain refund.
   */
  static async completeRefundRequiredAfterOnChainCredit(transactionId: string) {
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.type !== "REMITTANCE" || tx.status !== "REFUND_REQUIRED") {
      return tx;
    }

    const claimed = await prisma.transaction.updateMany({
      where: {
        id: tx.id,
        status: "REFUND_REQUIRED",
        type: "REMITTANCE",
      },
      data: {
        status: "FAILED",
        updatedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      return await prisma.transaction.findUnique({ where: { id: tx.id } });
    }

    console.warn(
      JSON.stringify({
        audit: "REFUND_REQUIRED_CLOSED_AFTER_ONCHAIN_CREDIT",
        transactionId: tx.id,
        orderId: tx.orderId.toString(),
        amountUsd: tx.amountUsd.toString(),
        txHash: tx.txHash,
      }),
    );

    return await prisma.transaction.findUnique({ where: { id: tx.id } });
  }

  /**
   * Count open REFUND_REQUIRED remittances for cron / monitoring (#96).
   */
  static async countOpenRefundRequired() {
    return prisma.transaction.count({
      where: { type: "REMITTANCE", status: "REFUND_REQUIRED" },
    });
  }

  /**
   * After REFUND_REQUIRED_TTL_MS (default 7d; set 0 to disable), close stale holds (#96).
   *
   * Never auto-increments walletBalance for gateway-funded (0x) or indexer unknown-*
   * rows — that would double-credit when creditInboundDeposit later links a refund.
   * Those rows: if refundTxHash is set, close with completeRefundRequiredAfterOnChainCredit;
   * otherwise re-alert and leave REFUND_REQUIRED for ops. App-local pending-/abandoned-
   * placeholders may still restore via restoreRefundRequired.
   */
  static async expireStaleRefundRequired(opts?: {
    olderThanMs?: number;
    limit?: number;
  }) {
    const olderThanMs =
      opts?.olderThanMs ??
      Number(process.env.REFUND_REQUIRED_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(olderThanMs) || olderThanMs <= 0) {
      return {
        scanned: 0,
        restored: 0,
        closedAfterCredit: 0,
        escalated: 0,
        failed: 0,
        disabled: true as const,
      };
    }

    const limit = opts?.limit ?? 100;
    const cutoff = new Date(Date.now() - olderThanMs);
    const stale = await prisma.transaction.findMany({
      where: {
        type: "REMITTANCE",
        status: "REFUND_REQUIRED",
        updatedAt: { lte: cutoff },
      },
      select: {
        id: true,
        txHash: true,
        refundTxHash: true,
        amountUsd: true,
        orderId: true,
      },
      take: limit,
      orderBy: { updatedAt: "asc" },
    });

    let restored = 0;
    let closedAfterCredit = 0;
    let escalated = 0;
    let failed = 0;
    for (const row of stale) {
      try {
        if (row.refundTxHash) {
          const updated = await this.completeRefundRequiredAfterOnChainCredit(row.id);
          if (updated?.status === "FAILED") {
            closedAfterCredit += 1;
            console.warn(
              JSON.stringify({
                audit: "REFUND_REQUIRED_TTL_CLOSED_AFTER_CREDIT",
                transactionId: row.id,
                olderThanMs,
              }),
            );
          } else {
            failed += 1;
          }
          continue;
        }

        if (this.isAppLocalPlaceholderHash(row.txHash)) {
          const updated = await this.restoreRefundRequired(row.id);
          if (updated?.status === "FAILED") {
            restored += 1;
            console.warn(
              JSON.stringify({
                audit: "REFUND_REQUIRED_TTL_AUTO_RESTORE",
                transactionId: row.id,
                olderThanMs,
              }),
            );
          } else {
            failed += 1;
          }
          continue;
        }

        // On-chain 0x or indexer unknown-* — do not restoreRefundRequired.
        escalated += 1;
        console.error(
          JSON.stringify({
            alert: "REFUND_REQUIRED_TTL_ESCALATION",
            severity: "high",
            transactionId: row.id,
            orderId: row.orderId.toString(),
            amountUsd: row.amountUsd.toString(),
            txHash: row.txHash,
            olderThanMs,
            message:
              "Stale funded/unknown-hash REFUND_REQUIRED with no refundTxHash; ops must confirm on-chain refund then completeRefundRequiredAfterOnChainCredit, or write-off via restoreRefundRequired only if no refund will credit",
          }),
        );
      } catch (err) {
        failed += 1;
        console.error(
          `[TransactionService] expireStaleRefundRequired failed for ${row.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return {
      scanned: stale.length,
      restored,
      closedAfterCredit,
      escalated,
      failed,
      disabled: false as const,
    };
  }

  /** Instant Send in-flight claim: `pending-{id}` → `broadcasting-{id}` before Privy send. */
  static isBroadcastClaimHash(txHash: string | null | undefined): boolean {
    return !!txHash && txHash.startsWith('broadcasting-');
  }

  static broadcastClaimHashFromPending(pendingTxHash: string): string | null {
    if (!pendingTxHash.startsWith('pending-')) return null;
    return `broadcasting-${pendingTxHash.slice('pending-'.length)}`;
  }

  /**
   * CAS claim a placeholder remittance for Instant Send broadcast.
   * Only one concurrent caller wins; loser must not call Privy.
   */
  static async claimBroadcastSlot(params: {
    userId: string;
    orderId: bigint;
    pendingTxHash: string;
  }): Promise<boolean> {
    const claimHash = this.broadcastClaimHashFromPending(params.pendingTxHash);
    if (!claimHash) return false;

    const claimed = await prisma.transaction.updateMany({
      where: {
        orderId: params.orderId,
        chainId: 0,
        userId: params.userId,
        type: 'REMITTANCE',
        txHash: params.pendingTxHash,
      },
      data: {
        txHash: claimHash,
        updatedAt: new Date(),
      },
    });
    return claimed.count === 1;
  }

  /**
   * Release Instant Send claim back to pending-* so a failed Privy call can retry.
   */
  static async releaseBroadcastClaim(params: {
    userId: string;
    orderId: bigint;
    paycrestOrderId: string;
  }): Promise<boolean> {
    const claimHash = `broadcasting-${params.paycrestOrderId}`;
    const pendingHash = `pending-${params.paycrestOrderId}`;
    const released = await prisma.transaction.updateMany({
      where: {
        orderId: params.orderId,
        chainId: 0,
        userId: params.userId,
        type: 'REMITTANCE',
        txHash: claimHash,
      },
      data: {
        txHash: pendingHash,
        updatedAt: new Date(),
      },
    });
    return released.count === 1;
  }

  /**
   * Attach a real on-chain hash to a pending remittance owned by `userId`.
   * Crypto withdraws (`recipientBank` starts with `crypto:`) mark COMPLETED.
   * CAS on pending-* / broadcasting-* so concurrent attach cannot clobber.
   */
  static async attachOnChainHash(params: {
    userId: string;
    orderId: bigint;
    txHash: string;
  }) {
    const hash = params.txHash.trim();
    if (!this.isOnChainTxHash(hash)) {
      throw new Error('Invalid txHash');
    }

    const existing = await prisma.transaction.findUnique({
      where: {
        orderId_chainId: {
          orderId: params.orderId,
          chainId: 0,
        },
      },
    });

    if (!existing) {
      return null;
    }
    if (existing.userId !== params.userId) {
      throw new Error('Forbidden');
    }
    if (existing.type !== 'REMITTANCE') {
      throw new Error('Not a remittance');
    }

    if (
      !existing.txHash.startsWith('pending-') &&
      !this.isBroadcastClaimHash(existing.txHash)
    ) {
      if (existing.txHash.toLowerCase() === hash.toLowerCase()) {
        return existing;
      }
      throw new Error('Transaction already has an on-chain hash');
    }

    const isCrypto = (existing.recipientBank || '').startsWith('crypto:');

    const attached = await prisma.transaction.updateMany({
      where: {
        id: existing.id,
        userId: params.userId,
        OR: [
          { txHash: { startsWith: 'pending-' } },
          { txHash: { startsWith: 'broadcasting-' } },
        ],
      },
      data: {
        txHash: hash,
        // Pending rows are created with chainId=0; stamp settlement chain on broadcast.
        chainId: PAYCREST_SETTLEMENT.chainId,
        ...(isCrypto ? { status: 'COMPLETED' as Status } : {}),
        updatedAt: new Date(),
      },
    });

    if (attached.count !== 1) {
      const again = await prisma.transaction.findUnique({ where: { id: existing.id } });
      if (again && again.txHash.toLowerCase() === hash.toLowerCase()) {
        return again;
      }
      throw new Error('Transaction already has an on-chain hash');
    }

    return await prisma.transaction.findUnique({ where: { id: existing.id } });
  }

  /**
   * Link a Paycrest order id onto the pending placeholder hash.
   * Keeps `externalId` as the frontend idempotency / Paycrest reference so retries still match.
   * Webhooks resolve via reference, order id, or `pending-{orderId}` (see findByPaycrestKey).
   */
  static async attachPaycrestOrder(
    id: string,
    paycrestOrderId: string,
  ): Promise<TransactionApiRow | null> {
    // Refuse to attach onto an abandoned/cancelled row (client abandon race).
    const attached = await prisma.transaction.updateMany({
      where: {
        id,
        status: { in: ["PENDING", "PROCESSING"] },
        txHash: { startsWith: "pending-" },
      },
      data: {
        txHash: `pending-${paycrestOrderId}`,
        updatedAt: new Date(),
      },
    });
    if (attached.count !== 1) {
      return null;
    }
    return await prisma.transaction.findUnique({
      where: { id },
      select: TRANSACTION_API_SELECT,
    });
  }

  /** Extract Paycrest order id from a pending-* / abandoned-* / broadcasting-* hash. */
  static paycrestOrderIdFromTxHash(txHash: string): string | null {
    if (txHash.startsWith("pending-")) return txHash.slice("pending-".length);
    if (txHash.startsWith("abandoned-")) return txHash.slice("abandoned-".length);
    if (txHash.startsWith("broadcasting-")) {
      return txHash.slice("broadcasting-".length);
    }
    return null;
  }

  /**
   * Create a pending transaction record with recipient metadata.
   * This should be called by the PWA before the on-chain transaction is initiated
   * to ensure we have the recipient details (which are not stored on-chain).
   * Reserves spendable balance immediately (debit ledger) only if funds are available.
   *
   * Idempotent only on `externalId` (#94 — no amount-match resume):
   * - PENDING/PROCESSING → return existing (no double debit)
   * - FAILED abandoned (pending-* hash) → re-reserve and reopen
   * Different cash-outs must use different externalIds even if USD amounts match.
   */
  static async createPending(data: {
    userId: string;
    orderId: bigint;
    externalId: string;
    sourceToken: string;
    amountUsd: number | string;
    payoutFiat: number | string;
    recipientName: string;
    recipientBank: string;
    recipientAcc: string;
  }): Promise<TransactionApiRow> {
    const amount = new Prisma.Decimal(data.amountUsd);
    const payoutFiat = new Prisma.Decimal(data.payoutFiat);

    const existing = await prisma.transaction.findUnique({
      where: { externalId: data.externalId },
      select: TRANSACTION_API_SELECT,
    });

    if (existing) {
      if (existing.userId !== data.userId) {
        throw new Error(`externalId ${data.externalId} belongs to another user`);
      }
      if (existing.type !== "REMITTANCE") {
        throw new Error(`externalId ${data.externalId} is not a remittance`);
      }

      // In-flight retry — funds already reserved
      if (existing.status === "PENDING" || existing.status === "PROCESSING") {
        return existing;
      }

      // Abandoned after Paycrest failure — re-reserve and reopen same row
      if (
        existing.status === "FAILED" &&
        (existing.txHash.startsWith("pending-") ||
          existing.txHash.startsWith("abandoned-"))
      ) {
        return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const reserved = await tx.user.updateMany({
            where: {
              id: data.userId,
              walletBalance: { gte: amount },
            },
            data: {
              walletBalance: { decrement: amount },
              totalSentUsd: { increment: amount },
              // transactionCount already counted on first attempt
            },
          });
          if (reserved.count !== 1) {
            throw new InsufficientBalanceError(data.userId, amount.toString());
          }

          return await tx.transaction.update({
            where: { id: existing.id },
            data: {
              status: "PENDING",
              orderId: data.orderId,
              sourceToken: data.sourceToken,
              amountUsd: amount,
              payoutFiat,
              recipientName: data.recipientName,
              recipientBank: data.recipientBank,
              recipientAcc: data.recipientAcc,
              txHash: `pending-${data.externalId}`,
              chainId: 0,
              // Avoid @@unique([chainId, blockNumber, logIndex]) collisions on (0,0,0)
              blockNumber: data.orderId,
              logIndex: 0,
              updatedAt: new Date(),
            },
            select: TRANSACTION_API_SELECT,
          });
        });
      }

      throw new Error(
        `Transaction ${data.externalId} already exists with status ${existing.status}`,
      );
    }

    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Atomic reserve: only succeed when walletBalance >= amount
      const reserved = await tx.user.updateMany({
        where: {
          id: data.userId,
          walletBalance: { gte: amount },
        },
        data: {
          walletBalance: { decrement: amount },
          totalSentUsd: { increment: amount },
          transactionCount: { increment: 1 },
        },
      });

      if (reserved.count !== 1) {
        throw new InsufficientBalanceError(data.userId, amount.toString());
      }

      return await tx.transaction.create({
        data: {
          userId: data.userId,
          orderId: data.orderId,
          externalId: data.externalId,
          sourceToken: data.sourceToken,
          amountUsd: amount,
          payoutFiat,
          recipientName: data.recipientName,
          recipientBank: data.recipientBank,
          recipientAcc: data.recipientAcc,
          status: "PENDING",
          type: "REMITTANCE",
          txHash: `pending-${data.externalId}`,
          chainId: 0,
          // Use orderId so multiple pending rows don't share (0,0,0)
          blockNumber: data.orderId,
          logIndex: 0,
        },
        select: TRANSACTION_API_SELECT,
      });
    });
  }

  /**
   * Credit an inbound wallet deposit (ERC-20 Transfer to user).
   * Idempotent on (chainId, blockNumber, logIndex) and (txHash, logIndex).
   * Safe under concurrent webhook + poll (handles unique races).
   *
   * Paycrest crypto refunds (#90 / #96): when a funded FAILED/REFUNDING/REFUND_REQUIRED
   * remittance matches this amount and has no refundTxHash yet, link the deposit hash on
   * that remittance in the same txn as the ledger credit (single economic credit).
   * REFUND_REQUIRED rows are closed to FAILED when linked so TTL cannot later restore.
   * Replays of a hash already stored as refundTxHash do not credit again.
   */
  static async creditInboundDeposit(data: {
    walletAddress: string;
    txHash: string;
    chainId: number;
    blockNumber: bigint;
    logIndex: number;
    sourceToken: string;
    amountUsd: number | string;
    status?: Status;
  }) {
    const wallet = data.walletAddress.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { walletAddress: { equals: wallet, mode: "insensitive" } },
    });

    if (!user) {
      throw new Error(`No user found for wallet ${data.walletAddress}`);
    }

    const byComposite = await prisma.transaction.findUnique({
      where: {
        chainId_blockNumber_logIndex: {
          chainId: data.chainId,
          blockNumber: data.blockNumber,
          logIndex: data.logIndex,
        },
      },
    });
    if (byComposite) {
      return { created: false as const, transaction: byComposite, user };
    }

    const byHashLog = await prisma.transaction.findUnique({
      where: {
        txHash_logIndex: {
          txHash: data.txHash,
          logIndex: data.logIndex,
        },
      },
    });
    if (byHashLog) {
      return { created: false as const, transaction: byHashLog, user };
    }

    // This user's remittance already claimed this refund hash — do not credit again.
    // Scoped by userId so another recipient's Transfer in the same tx still credits.
    const alreadyLinkedRefund = await prisma.transaction.findUnique({
      where: {
        userId_refundTxHash: {
          userId: user.id,
          refundTxHash: data.txHash,
        },
      },
    });
    if (alreadyLinkedRefund) {
      return { created: false as const, transaction: alreadyLinkedRefund, user };
    }

    const amount = new Prisma.Decimal(data.amountUsd);
    const orderId = data.blockNumber * 1000n + BigInt(data.logIndex);

    // Match open funded remittance refund claim (webhook did not restore ledger).
    const refundClaimStatuses: Status[] = ["FAILED", "REFUNDING", "REFUND_REQUIRED"];
    const refundCandidates = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: "REMITTANCE",
        status: { in: refundClaimStatuses },
        refundTxHash: null,
        amountUsd: amount,
        NOT: [
          { txHash: { startsWith: "pending-" } },
          { txHash: { startsWith: "abandoned-" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });
    const refundClaim = refundCandidates[0] ?? null;

    try {
      // Atomic: optional refund link + create + balance increment commit together.
      // On P2002 the whole interactive transaction rolls back — catch must NEVER
      // increment walletBalance (lookup-only idempotent return).
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const linkedAlready = await tx.transaction.findUnique({
          where: {
            userId_refundTxHash: {
              userId: user.id,
              refundTxHash: data.txHash,
            },
          },
        });
        if (linkedAlready) {
          return { created: false as const, transaction: linkedAlready };
        }

        let linkedClaim = false;
        if (refundClaim) {
          const linked = await tx.transaction.updateMany({
            where: {
              id: refundClaim.id,
              userId: user.id,
              refundTxHash: null,
              status: { in: refundClaimStatuses },
            },
            data: {
              refundTxHash: data.txHash,
              // Close ops hold so TTL never restoreRefundRequired after this credit.
              ...(refundClaim.status === "REFUND_REQUIRED"
                ? { status: "FAILED" as Status }
                : {}),
              updatedAt: new Date(),
            },
          });
          if (linked.count !== 1) {
            // Lost CAS or concurrent writer linked this hash for this user.
            const claimed = await tx.transaction.findUnique({
              where: {
                userId_refundTxHash: {
                  userId: user.id,
                  refundTxHash: data.txHash,
                },
              },
            });
            if (claimed) {
              return { created: false as const, transaction: claimed };
            }
            // Remittance was claimed by a different refund hash; continue as normal deposit.
          } else {
            linkedClaim = true;
          }
        }

        const dbTx = await tx.transaction.create({
          data: {
            userId: user.id,
            orderId,
            txHash: data.txHash,
            chainId: data.chainId,
            blockNumber: data.blockNumber,
            logIndex: data.logIndex,
            sourceToken: data.sourceToken,
            amountUsd: amount,
            payoutFiat: 0,
            status: data.status ?? "COMPLETED",
            type: "DEPOSIT",
            recipientName: linkedClaim
              ? `Paycrest refund (${refundClaim!.externalId || refundClaim!.id})`
              : "Wallet deposit",
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: {
            walletBalance: { increment: amount },
            transactionCount: { increment: 1 },
          },
        });

        return { created: true as const, transaction: dbTx };
      });

      return { ...result, user };
    } catch (err: any) {
      if (err?.code === "P2002") {
        // Concurrent writer won (deposit keys or per-user refundTxHash) — do not credit again.
        const raced =
          (await prisma.transaction.findUnique({
            where: {
              txHash_logIndex: {
                txHash: data.txHash,
                logIndex: data.logIndex,
              },
            },
          })) ||
          (await prisma.transaction.findUnique({
            where: {
              chainId_blockNumber_logIndex: {
                chainId: data.chainId,
                blockNumber: data.blockNumber,
                logIndex: data.logIndex,
              },
            },
          })) ||
          (await prisma.transaction.findUnique({
            where: {
              userId_refundTxHash: {
                userId: user.id,
                refundTxHash: data.txHash,
              },
            },
          }));
        if (raced) {
          return { created: false as const, transaction: raced, user };
        }
      }
      throw err;
    }
  }
}
