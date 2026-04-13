import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { AlchemyService, PayoutService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('x-alchemy-signature');
    const rawBody = await req.text();

    // HMAC Signature Verification (Sovereign Gatekeeper)
    const secret = process.env.ALCHEMY_WEBHOOK_SECRET;
    
    if (!secret || !signature) {
      console.error(
        "[Alchemy Webhook] Missing security credentials - Blocking request",
      );
      return NextResponse.json(
        { error: "Unauthorized verification" },
        { status: 401 },
      );
    }

    const hmac = createHmac("sha256", secret);
    const digest = hmac.update(rawBody).digest("hex");

    if (signature !== digest) {
      console.error(
        "[Alchemy Webhook] Invalid Signature Encountered - Potential Spoofing",
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    const result = await AlchemyService.handleWebhook(payload);

    return NextResponse.json({
      success: true,
      message: 'Alchemy Watchtower Synchronized',
      synced: result.synced || 0,
    });
  } catch (err: any) {
    console.error(`[Alchemy Webhook Failure] ${err.message}`);
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 });
  }
}
