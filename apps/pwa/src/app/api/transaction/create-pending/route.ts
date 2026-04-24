import { NextResponse } from 'next/server';
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from '@fx-remit/database';
import { TransactionService } from '@fx-remit/services';

export const dynamic = "force-dynamic";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? "";

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const claims = await privy.verifyAuthToken(token);

    const body = await req.json();
    const { 
      amountUsd, 
      recipientName, 
      recipientBank, 
      recipientAcc, 
      payoutFiat, 
      token: sourceToken 
    } = body;

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
      sourceToken: sourceToken || 'USDC',
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
