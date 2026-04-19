import { NextResponse } from 'next/server';
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from '@fx-remit/database';

export const dynamic = "force-dynamic";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? "";

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { fullName, displayName, avatarUrl, walletAddress, email } = body;

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
      console.log('[AUTH] Token verified via Server SDK. User:', claims.userId);
    } catch (err) {
      console.error('[AUTH] Token verification failed:', err);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    let dbUser;
    try {
      dbUser = await prisma.user.upsert({
        where: { privyDid: claims.userId },
        update: {
          walletAddress: walletAddress || undefined,
          email: email || undefined,
          fullName: fullName || undefined,
          displayName: displayName || undefined,
          avatarUrl: avatarUrl || undefined,
        },
        create: {
          privyDid: claims.userId,
          walletAddress: walletAddress ?? "",
          email: email || undefined,
          fullName: fullName || undefined,
          displayName: displayName || undefined,
          avatarUrl: avatarUrl || undefined,
        },
      });
      console.log('[DB] User upserted:', dbUser.id);
    } catch (dbErr) {
      console.error('[DB] Upsert failed:', dbErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: dbUser });
  } catch (error) {
    console.error("[ONBOARD] Unhandled error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 },
    );
  }
}
