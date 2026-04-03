import { NextResponse } from "next/server";
import { IdentityService } from "@fx-remit/services";

export async function POST(req: Request) {
  try {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("[Privy Webhook] Missing Svix Signature Headers");
      return NextResponse.json(
        { error: "Missing signature headers" },
        { status: 401 },
      );
    }

    const rawBody = await req.text();

    // 1. Hand off to Sovereign Identity Service for Verification
    const event = await IdentityService.verifyWebhook(rawBody, {
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
    });

    // 2. Atomic Synchronization of User Identity
    await IdentityService.syncUser(event);

    return NextResponse.json({ success: true, message: "Identity synchronized" });
  } catch (err: any) {
    console.error(`[Privy Webhook Failure] ${err.message}`);
    return NextResponse.json({ error: "Identity verification failed" }, { status: 401 });
  }
}
