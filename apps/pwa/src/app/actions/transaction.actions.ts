"use server";

import { prisma } from "@fx-remit/database";

export async function getLatestDeposit(userId: string) {
  if (!userId) return null;

  try {
    const transaction = await prisma.transaction.findFirst({
      where: {
        userId,
        type: "DEPOSIT",
        status: { in: ["COMPLETED", "VERIFIED"] },
        createdAt: {
          gt: new Date(Date.now() - 30 * 60 * 1000),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!transaction) return null;

    return {
      ...transaction,
      amountUsd: transaction.amountUsd ? Number(transaction.amountUsd) : 0,
      payoutFiat: transaction.payoutFiat ? Number(transaction.payoutFiat) : 0,
      orderId: transaction.orderId.toString(),
      blockNumber: transaction.blockNumber.toString(),
    };
  } catch (error) {
    console.error("getLatestDeposit error:", error);
    return null;
  }
}
