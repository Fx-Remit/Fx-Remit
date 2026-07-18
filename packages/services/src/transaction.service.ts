import { prisma, Status, Transaction, Prisma } from "@fx-remit/database";
import { RpcClient } from "./rpc.client";

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

    // Identify existing record: Prioritize txHash (synced from frontend) over orderId (which may mismatch)
    let existing = await prisma.transaction.findUnique({
      where: { txHash: data.txHash },
    });

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
          status: "VERIFIED",
          type,
        },
      });

      //  Update User Stats if the transaction just became VERIFIED
      if (existing?.status === "PENDING" || !existing) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            walletBalance: { increment: type === "DEPOSIT" ? amount : 0 },
            totalSentUsd: { increment: type === "REMITTANCE" ? amount : 0 },
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
   */
  static async updateFromPaycrest(externalId: string, status: Status) {
    const tx = await prisma.transaction.findUnique({
      where: { externalId },
    });

    if (!tx) {
      console.warn(`[TransactionService] No transaction found for Paycrest ID: ${externalId}`);
      return null;
    }

    // Terminal states: COMPLETED and FAILED cannot be transitioned out of.
    if (tx.status === "COMPLETED" || tx.status === "FAILED") {
      console.log(
        `[TransactionService] Transaction #${tx.orderId.toString()} is already in terminal state [${tx.status}]. Ignoring transition to [${status}].`
      );
      return tx;
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
        type: "REMITTANCE",
        txHash: `pending-${data.externalId}`, // Temporary placeholder until indexer picks it up
        chainId: 0,
        blockNumber: 0n,
        logIndex: 0,
      },
    });
  }

  /**
   * Credit an inbound wallet deposit (ERC-20 Transfer to user).
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

    const existing = await prisma.transaction.findUnique({
      where: { txHash: data.txHash },
    });

    if (existing) {
      return { created: false as const, transaction: existing, user };
    }

    const amount = new Prisma.Decimal(data.amountUsd);
    // Synthetic orderId for deposits (no Paycrest order): chainId-scoped block + log
    const orderId =
      data.blockNumber * 1000n + BigInt(data.logIndex);

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
  }
}
