import { NextResponse } from 'next/server';
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from '@fx-remit/database';
import { TransactionService } from '@fx-remit/services';

export const dynamic = "force-dynamic";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? "";

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7);

    let claims;
    try {
      claims = await privy.verifyAuthToken(token);
//      console.log('[HISTORY] Token verified. User DID:', claims.userId);
    } catch (err) {
      console.error('[HISTORY] Token verification failed:', err);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    await TransactionService.syncProcessingRemittancesFromPaycrest(user.id);
    const transactions = await TransactionService.getHistory(user.id, limit, offset);

    return NextResponse.json({ 
      success: true, 
      transactions,
    });

  } catch (error) {
    console.error("[HISTORY] Unhandled error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 },
    );
  }
}
