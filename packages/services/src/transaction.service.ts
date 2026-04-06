import { prisma, Status, Transaction, Prisma } from "@fx-remit/database";

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
    fromToken?: string;
    amountUsd?: number | string;
  }) {
    // Attempt to resolve user by wallet address
    const user = await prisma.user.findUnique({
      where: { walletAddress: data.sender.toLowerCase() },
      select: { id: true },
    });

    const existing = await prisma.transaction.findUnique({
      where: { orderId: data.orderId },
      select: { status: true },
    });

    const newStatus: Status =
      existing?.status === "PENDING" || !existing
        ? "VERIFIED"
        : (existing.status as Status);

    return await prisma.transaction.upsert({
      where: { orderId: data.orderId },
      update: {
        txHash: data.txHash,
        chainId: data.chainId,
        blockNumber: data.blockNumber,
        logIndex: data.logIndex,
        status: newStatus,
      },
      create: {
        orderId: data.orderId,
        txHash: data.txHash,
        chainId: data.chainId,
        blockNumber: data.blockNumber,
        logIndex: data.logIndex,
        userId: user?.id || "indexer-unlinked",
        sourceToken: data.fromToken || "CELO",
        amountUsd: new Prisma.Decimal(data.amountUsd || 0),
        payoutFiat: 0,
        status: "VERIFIED",
      },
    });
  }

  /**
   * Update transaction status from Paycrest webhook events.
   */
  static async updateFromPaycrest(externalId: string, status: Status) {
    return await prisma.transaction.updateMany({
      where: { externalId },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Create a pending transaction record with recipient metadata.
   * This should be called by the PWA before the on-chain transaction is initiated
   * to ensure we have the recipient details (which are not stored on-chain).
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
    return await prisma.transaction.create({
      data: {
        userId: data.userId,
        orderId: data.orderId,
        externalId: data.externalId,
        sourceToken: data.sourceToken,
        amountUsd: new Prisma.Decimal(data.amountUsd),
        payoutFiat: new Prisma.Decimal(data.payoutFiat),
        recipientName: data.recipientName,
        recipientBank: data.recipientBank,
        recipientAcc: data.recipientAcc,
        status: "PENDING",
        txHash: `pending-${data.externalId}`, // Temporary placeholder until indexer picks it up
        chainId: 0,
        blockNumber: 0n,
        logIndex: 0,
      },
    });
  }
}
