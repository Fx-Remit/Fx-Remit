import { prisma, Status, Transaction, Prisma } from "@fx-remit/database";
import { RpcClient } from "./rpc.client";

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

const LEDGER_RESTORED_STATUSES: Status[] = ["FAILED", "REFUNDING"];
// Once a remittance reaches any of these it is settled/reversed — never transition out.
const TERMINAL_STATUSES: Status[] = ["COMPLETED", "FAILED", "REFUNDING"];

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
   * Handles BigInt to string and Decimal to number conversion.
   */
  static serialize(tx: Transaction): TransactionResponse {
    return {
      ...tx,
      orderId: tx.orderId.toString(),
      blockNumber: tx.blockNumber.toString(),
      amountUsd: Number(tx.amountUsd),
      payoutFiat: Number(tx.payoutFiat),
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
    };
  }

  /**
   * Fetch transaction history for a specific user with pagination.
   */
  static async getHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<TransactionResponse[]> {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    return transactions.map(this.serialize);
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

      if (shouldCreditDeposit || shouldDebitRemittance) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            ...(shouldCreditDeposit
              ? { walletBalance: { increment: amount } }
              : { walletBalance: { decrement: amount } }),
            totalSentUsd: {
              increment: shouldDebitRemittance ? amount : 0,
            },
            transactionCount: { increment: 1 },
          },
        });
      }

      return dbTx;
    });
  }

  /**
   * Update transaction status from Paycrest webhook events.
   * Gated by a state machine to prevent out-of-order webhooks from overwriting terminal states.
   * FAILED / REFUNDING remittances restore spendable ledger reserved in createPending (once).
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

    const shouldRestoreLedger =
      tx.type === "REMITTANCE" &&
      LEDGER_RESTORED_STATUSES.includes(status) &&
      !LEDGER_RESTORED_STATUSES.includes(tx.status);

    if (shouldRestoreLedger) {
      return await prisma.$transaction(async (client: Prisma.TransactionClient) => {
        const updated = await client.transaction.update({
          where: { id: tx.id },
          data: {
            status,
            updatedAt: new Date(),
          },
        });
        await client.user.update({
          where: { id: tx.userId },
          data: {
            walletBalance: { increment: tx.amountUsd },
            totalSentUsd: { decrement: tx.amountUsd },
            // Keep transactionCount — the attempt still happened
          },
        });
        return updated;
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
   */
  static async cancelAbandonedPending(externalId: string) {
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

    const failed = await this.updateFromPaycrest(tx.externalId ?? externalId, "FAILED");
    if (!failed) return null;

    // Free placeholder unique keys so retries / new pendings don't collide
    return await prisma.transaction.update({
      where: { id: failed.id },
      data: {
        txHash: `abandoned-${failed.id}`,
        blockNumber: failed.orderId,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Expire stale prefetched / abandoned remittances that never received an on-chain hash.
   * Safe for cron: only touches pending-* placeholder hashes.
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
      select: { id: true, externalId: true },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    let expired = 0;
    let failed = 0;

    for (const row of stale) {
      const key = row.externalId;
      if (!key) {
        failed += 1;
        continue;
      }
      try {
        await this.cancelAbandonedPending(key);
        expired += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `[TransactionService] expireStalePendingRemittances failed for ${key}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { scanned: stale.length, expired, failed };
  }

  /**
   * Link a Paycrest order id onto the pending placeholder hash.
   * Keeps `externalId` as the frontend idempotency / Paycrest reference so retries still match.
   * Webhooks resolve via reference, order id, or `pending-{orderId}` (see findByPaycrestKey).
   */
  static async attachPaycrestOrder(id: string, paycrestOrderId: string) {
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
    return await prisma.transaction.findUnique({ where: { id } });
  }

  /** Extract Paycrest order id from a pending-* / abandoned-* placeholder hash. */
  static paycrestOrderIdFromTxHash(txHash: string): string | null {
    if (txHash.startsWith("pending-")) return txHash.slice("pending-".length);
    if (txHash.startsWith("abandoned-")) return txHash.slice("abandoned-".length);
    return null;
  }

  /**
   * Create a pending transaction record with recipient metadata.
   * This should be called by the PWA before the on-chain transaction is initiated
   * to ensure we have the recipient details (which are not stored on-chain).
   * Reserves spendable balance immediately (debit ledger) only if funds are available.
   *
   * Idempotent on `externalId` (frontend idempotency key):
   * - PENDING/PROCESSING → return existing (no double debit)
   * - FAILED abandoned (pending-* hash) → re-reserve and reopen
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
  }) {
    const amount = new Prisma.Decimal(data.amountUsd);
    const payoutFiat = new Prisma.Decimal(data.payoutFiat);

    let existing = await prisma.transaction.findUnique({
      where: { externalId: data.externalId },
    });

    // Older rows remapped externalId → Paycrest order id; still resume the open reserve
    if (!existing) {
      existing = await prisma.transaction.findFirst({
        where: {
          userId: data.userId,
          type: "REMITTANCE",
          status: { in: ["PENDING", "PROCESSING"] },
          txHash: { startsWith: "pending-" },
          amountUsd: amount,
        },
        orderBy: { createdAt: "desc" },
      });
    }

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
      });
    });
  }

  /**
   * Credit an inbound wallet deposit (ERC-20 Transfer to user).
   * Idempotent on (chainId, blockNumber, logIndex) and (txHash, logIndex).
   * Safe under concurrent webhook + poll (handles unique races).
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

    const amount = new Prisma.Decimal(data.amountUsd);
    const orderId = data.blockNumber * 1000n + BigInt(data.logIndex);

    try {
      // Atomic: create + balance increment commit together. On P2002 the whole
      // interactive transaction rolls back the catch path below must NEVER
      // increment walletBalance (lookup-only idempotent return).
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
            recipientName: "Wallet deposit",
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: {
            walletBalance: { increment: amount },
            transactionCount: { increment: 1 },
          },
        });

        return dbTx;
      });

      return { created: true as const, transaction: result, user };
    } catch (err: any) {
      if (err?.code === "P2002") {
        // Concurrent writer won — return their row. Do not credit again.
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
          }));
        if (raced) {
          return { created: false as const, transaction: raced, user };
        }
      }
      throw err;
    }
  }
}
