import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from "@fx-remit/database";

const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "No authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const verifiedClaims = await privy.verifySession(token);

    if (!verifiedClaims) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const user = await privy.getUser(verifiedClaims.userId);
    const wallet = user.linkedAccounts.find((a) => a.type === "wallet");

    if (!wallet || wallet.type !== "wallet") {
      return NextResponse.json({ error: "No wallet linked" }, { status: 400 });
    }

    const dbUser = await prisma.user.upsert({
      where: { privyDid: user.id },
      update: {
        walletAddress: wallet.address,
        email: user.email?.address,
      },
      create: {
        privyDid: user.id,
        walletAddress: wallet.address,
        email: user.email?.address,
      },
    });

    return NextResponse.json({ success: true, user: dbUser });
  } catch (error) {
    console.error("Onboarding Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
