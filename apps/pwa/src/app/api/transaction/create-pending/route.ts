import { NextResponse } from 'next/server';
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from '@fx-remit/database';
import { TransactionService } from '@fx-remit/services';

export const dynamic = "force-dynamic";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? "";

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

function isPositiveNumber(val: unknown): val is number {
  const n = Number(val);
  return !isNaN(n) && isFinite(n) && n > 0;
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
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
    } catch {
      return NextResponse.json(
        { error: "Invalid authentication token" },
        { status: 401 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const {
      amountUsd,
      recipientName,
      recipientBank,
      recipientAcc,
      payoutFiat,
      token: sourceToken,
    } = body;

    const validationErrors: string[] = [];

    if (!isPositiveNumber(amountUsd)) {
      validationErrors.push("amountUsd must be a positive number");
    }
    if (!isPositiveNumber(payoutFiat)) {
      validationErrors.push("payoutFiat must be a positive number");
    }
    if (!isNonEmptyString(recipientName)) {
      validationErrors.push("recipientName is required");
    }
    if (!isNonEmptyString(recipientBank)) {
      validationErrors.push("recipientBank is required");
    }
    if (!isNonEmptyString(recipientAcc)) {
      validationErrors.push("recipientAcc is required");
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: validationErrors },
        { status: 422 },
      );
    }

    const MAX_TX_AMOUNT_USD = 10_000;
    if (Number(amountUsd) > MAX_TX_AMOUNT_USD) {
      return NextResponse.json(
        {
          error: `Transaction amount exceeds maximum of $${MAX_TX_AMOUNT_USD.toLocaleString()}`,
        },
        { status: 422 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true, walletAddress: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const orderId = BigInt(Date.now());
    const externalId = `pnd_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const tx = await TransactionService.createPending({
      userId: user.id,
      orderId,
      externalId,
      sourceToken: isNonEmptyString(sourceToken) ? sourceToken : "USDC",
      amountUsd: Number(amountUsd),
      payoutFiat: Number(payoutFiat),
      recipientName: (recipientName as string).trim(),
      recipientBank: (recipientBank as string).trim(),
      recipientAcc: (recipientAcc as string).trim(),
    });

    return NextResponse.json({
      success: true,
      transaction: {
        ...tx,
        orderId: tx.orderId.toString(),
        amountUsd: tx.amountUsd.toString(),
        payoutFiat: tx.payoutFiat.toString(),
      },
    });

  } catch (error) {
    console.error("[CREATE_PENDING] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
