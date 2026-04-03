import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { prisma } from "@fx-remit/database";

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

export async function POST(req: Request) {
  try {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        { error: "Missing signature headers" },
        { status: 401 },
      );
    }

    const rawBody = await req.text();

    const event = await privy.webhooks().verify({
      payload: rawBody,
      svix: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      signing_secret: process.env.PRIVY_WEBHOOK_SECRET,
    });

    const { type, data } = event as any;

    const user = data;

    console.log(`[Privy Webhook] Received ${type} for ${user.id}`);

    const privyDid = user.id;

    const email = user.linked_accounts.find(
      (a: any) => a.type === "email",
    )?.address;

    const walletAddress = user.linked_accounts.find(
      (a: any) => a.type === "wallet" || a.type === "smart_wallet",
    )?.address;

    await prisma.user.upsert({
      where: { privyDid },
      update: {
        email: email || undefined,
        walletAddress: walletAddress || undefined,
        lastLoginAt: new Date(),
        displayName: user.displayName || undefined,
      },
      create: {
        privyDid,
        email: email || "",
        walletAddress: walletAddress || "",
        displayName: user.displayName || "New User",
        lastLoginAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`[Privy Webhook Error] ${err.message}`);
    return NextResponse.json({ error: "Verification failed" }, { status: 401 });
  }
}
