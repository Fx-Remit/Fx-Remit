import { NextResponse } from 'next/server';
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from '@fx-remit/database';
import { TransactionService, PayoutService } from '@fx-remit/services';

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
    } catch {
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
    const externalId = frontendId || `pnd_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create the order on Paycrest
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
      externalId,
    });

    if (!paycrestResp.success || !paycrestResp.order) {
      return NextResponse.json({ 
        error: paycrestResp.error || "Failed to create Paycrest order" 
      }, { status: 400 });
    }

    const tx = await TransactionService.createPending({
      userId: user.id,
      orderId,
      externalId: paycrestResp.order.id, // Use Paycrest's ID as our externalId
      sourceToken,
      amountUsd,
      payoutFiat,
      recipientName,
      recipientBank,
      recipientAcc,
    });

    return NextResponse.json({
      success: true,
      transaction: {
        ...tx,
        orderId: tx.orderId.toString(),
        amountUsd: tx.amountUsd.toString(),
        payoutFiat: tx.payoutFiat.toString(),
      },
      paycrest: {
        receiveAddress: paycrestResp.order.providerAccount?.receiveAddress,
        amountToTransfer: paycrestResp.order.providerAccount?.amountToTransfer,
      }
    });

  } catch (error) {
    console.error("[CREATE_PENDING] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
