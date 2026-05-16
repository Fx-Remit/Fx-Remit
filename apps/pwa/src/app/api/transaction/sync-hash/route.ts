import { NextResponse } from 'next/server';
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from '@fx-remit/database';

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
    
    const { orderId, txHash } = await req.json();

    if (!orderId || !txHash) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Link the real txHash to the pending record
    await prisma.transaction.update({
      where: { 
        orderId_chainId: {
          orderId: BigInt(orderId),
          chainId: 0 // Pending transactions are created with chainId 0
        }
      },
      data: { 
        txHash,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[SYNC_HASH] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
