import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/node';
import { prisma } from '@fx-remit/database';

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { fullName, displayName, avatarUrl, walletAddress, email } = body;
    console.log("Onboarding Payload:", {
      fullName,
      displayName,
      avatarUrl,
      walletAddress,
      email,
    });

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error("Onboarding Error: Missing Auth Header");
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log("Verifying Privy Access Token...");

    let claims;
    try {
      claims = await privy.utils().auth().verifyAccessToken(token);
      console.log("Token Verified. DID:", claims.user_id);
    } catch (privyError) {
      console.error("Privy Token Verification Failed:", privyError);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    console.log("Upserting User in Database:", claims.user_id);
    let dbUser;
    try {
      dbUser = await prisma.user.upsert({
        where: { privyDid: claims.user_id },
        update: {
          walletAddress: walletAddress || undefined,
          email: email || undefined,
          fullName: fullName || undefined,
          displayName: displayName || undefined,
          avatarUrl: avatarUrl || undefined,
        },
        create: {
          privyDid: claims.user_id,
          walletAddress: walletAddress || "",
          email: email || undefined,
          fullName: fullName || undefined,
          displayName: displayName || undefined,
          avatarUrl: avatarUrl || undefined,
        },
      });
      console.log("Database Sync Successful for:", claims.user_id);
    } catch (dbError) {
      console.error("Prisma Upsert Error:", dbError);
      throw new Error(`Database synchronization failed: ${dbError instanceof Error ? dbError.message : 'Unknown DB error'}`);
    }

    console.log("Onboarding Success:", dbUser.id);
    return NextResponse.json({ success: true, user: dbUser });
  } catch (error) {
    console.error("Unhandled Onboarding Error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
