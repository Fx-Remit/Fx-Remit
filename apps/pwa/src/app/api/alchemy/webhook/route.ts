import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { AlchemyService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

function alchemySecrets(): string[] {
  return [
    process.env.ALCHEMY_WEBHOOK_SECRET,
    process.env.ALCHEMY_WEBHOOK_SECRET_BASE,
    process.env.ALCHEMY_WEBHOOK_SECRET_CELO,
  ].filter((s): s is string => Boolean(s?.trim()));
}

function signatureValid(rawBody: string, signature: string, secrets: string[]): boolean {
  for (const secret of secrets) {
    const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      const a = Buffer.from(digest, 'utf8');
      const b = Buffer.from(signature, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // continue
    }
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('x-alchemy-signature');
    const rawBody = await req.text();
    const secrets = alchemySecrets();

    if (!secrets.length || !signature) {
      console.error('[Alchemy Webhook] Missing security credentials - Blocking request');
      return NextResponse.json({ error: 'Unauthorized verification' }, { status: 401 });
    }

    if (!signatureValid(rawBody, signature, secrets)) {
      console.error('[Alchemy Webhook] Invalid Signature Encountered - Potential Spoofing');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
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
