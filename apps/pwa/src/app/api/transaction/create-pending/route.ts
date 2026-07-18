import { NextResponse } from 'next/server';
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from '@fx-remit/database';
import {
  TransactionService,
  PayoutService,
  InsufficientBalanceError,
} from '@fx-remit/services';

export const dynamic = "force-dynamic";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? "";

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

import { z } from 'zod';

const createPendingSchema = z.object({
  amountUsd: z.coerce.number().positive("amountUsd must be a positive number").max(10_000, "Transaction amount exceeds maximum of $10,000"),
  payoutFiat: z.coerce.number().positive("payoutFiat must be a positive number"),
  recipientName: z.string().trim().min(1, "recipientName is required"),
  recipientBank: z.string().trim().min(1, "recipientBank is required"),
  recipientAcc: z.string().trim().min(1, "recipientAcc is required"),
  token: z.string().optional().default("USDT"),
  bankCode: z.string().optional(),
  externalId: z.string().optional(),
});

function serializeTransaction(tx: {
  orderId: bigint;
  blockNumber: bigint;
  amountUsd: { toString(): string };
  payoutFiat: { toString(): string };
}) {
  return {
    ...tx,
    orderId: tx.orderId.toString(),
    blockNumber: tx.blockNumber.toString(),
    amountUsd: tx.amountUsd.toString(),
    payoutFiat: tx.payoutFiat.toString(),
  };
}

function paycrestPayload(
  order: {
    id?: string;
    providerAccount?: { receiveAddress?: string; amountToTransfer?: string | number };
  },
  settlement: {
    network: string;
    chainId: number;
    token: string;
    tokenAddress: string;
    decimals: number;
  },
) {
  return {
    receiveAddress: order.providerAccount?.receiveAddress,
    amountToTransfer: order.providerAccount?.amountToTransfer,
    network: settlement.network,
    chainId: settlement.chainId,
    token: settlement.token,
    tokenAddress: settlement.tokenAddress,
    decimals: settlement.decimals,
  };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);

    let claims;
    try {
      claims = await privy.verifyAuthToken(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CREATE_PENDING] Privy verifyAuthToken failed:", message);
      return NextResponse.json(
        { error: "Invalid authentication token" },
        { status: 401 },
      );
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const validationResult = createPendingSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed", 
          details: validationResult.error.issues.map(i => i.message) 
        },
        { status: 422 },
      );
    }

    const {
      amountUsd,
      recipientName,
      recipientBank,
      recipientAcc,
      payoutFiat,
      token: sourceToken,
      bankCode,
      externalId: frontendId,
    } = validationResult.data;

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true, walletAddress: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const orderId = BigInt(Date.now());
    const appExternalId = frontendId || `pnd_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Reserve funds + create the pending row FIRST (atomic, guarded).
    // Doing this before Paycrest avoids orphan provider orders on insufficient balance.
    let tx;
    try {
      tx = await TransactionService.createPending({
        userId: user.id,
        orderId,
        externalId: appExternalId,
        sourceToken,
        amountUsd,
        payoutFiat,
        recipientName,
        recipientBank,
        recipientAcc,
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return NextResponse.json(
          {
            error: "Insufficient balance",
            details: err.message,
            code: err.code,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    // Resume in-flight PROCESSING (funds reserved + Paycrest order already created).
    // Happens when the client never received the prior create-pending response.
    if (tx.status === "PROCESSING") {
      const paycrestOrderId =
        TransactionService.paycrestOrderIdFromTxHash(tx.txHash) || tx.externalId;
      if (!paycrestOrderId) {
        return NextResponse.json(
          { error: "In-flight remittance is missing Paycrest order id" },
          { status: 409 },
        );
      }

      const resumed = await PayoutService.getSettlementOrder(paycrestOrderId);
      if (!resumed.success || !resumed.order || !resumed.settlement) {
        return NextResponse.json(
          { error: resumed.error || "Failed to resume Paycrest order" },
          { status: 400 },
        );
      }

      return NextResponse.json({
        success: true,
        resumed: true,
        transaction: serializeTransaction(tx),
        paycrest: paycrestPayload(resumed.order, resumed.settlement),
      });
    }

    // Create the Paycrest order. On failure, refund the reserved ledger.
    const paycrestResp = await PayoutService.createPaycrestOrder({
      amount: amountUsd.toString(),
      sourceToken: sourceToken,
      destinationCurrency: "NGN", // Defaulting to NGN for now
      recipient: {
        institution: bankCode || recipientBank,
        accountIdentifier: recipientAcc,
        accountName: recipientName,
      },
      refundAddress: user.walletAddress || "",
      externalId: tx.externalId || appExternalId,
    });

    if (!paycrestResp.success || !paycrestResp.order || !paycrestResp.settlement) {
      await TransactionService.cancelAbandonedPending(
        tx.externalId || appExternalId,
      ).catch((e) =>
        console.error("[CREATE_PENDING] refund after Paycrest failure failed:", e),
      );
      return NextResponse.json({
        error: paycrestResp.error || "Failed to create Paycrest order"
      }, { status: 400 });
    }

    // Link the Paycrest order id onto pending-* hash (keep externalId as reference).
    const linked = await TransactionService.attachPaycrestOrder(
      tx.id,
      paycrestResp.order.id,
    );

    const { settlement } = paycrestResp;

    return NextResponse.json({
      success: true,
      transaction: serializeTransaction(linked),
      paycrest: paycrestPayload(paycrestResp.order, settlement),
    });

  } catch (error) {
    console.error("[CREATE_PENDING] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
