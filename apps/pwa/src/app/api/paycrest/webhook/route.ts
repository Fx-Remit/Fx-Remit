import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma, Status } from '@fx-remit/database';

/**
 * Paycrest v2 Webhook Receiver
 * - Verifies X-Paycrest-Signature header using HMAC-SHA256.
 * - Updates transaction status in the database.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-paycrest-signature');
    const secret = process.env.PAYCREST_SECRET_KEY;

    if (!secret) {
      console.error('PAYCREST_SECRET_KEY not found in environment');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    if (!signature) {
      console.error('Missing X-Paycrest-Signature header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify HMAC-SHA256 Signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Invalid X-Paycrest-Signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = JSON.parse(body);
    const { event, data } = payload;

    console.log(`[Paycrest Webhook] Received event: ${event}`, data);

    /**
     * Map Paycrest Events to FX Remit Transaction Statuses
     * Event Types: payment_order.created, payment_order.settled, payment_order.failed, payment_order.refunding
     */
    switch (event) {
      case 'payment_order.settled':
        await prisma.transaction.updateMany({
          where: { externalId: data.id },
          data: { status: 'COMPLETED' },
        });
        break;

      case 'payment_order.failed':
        await prisma.transaction.updateMany({
          where: { externalId: data.id },
          data: { status: 'FAILED' },
        });
        break;

      case 'payment_order.refunding':
      case 'payment_order.refunded':
        await prisma.transaction.updateMany({
          where: { externalId: data.id },
          data: { status: Status.REFUNDING },
        });
        break;

      default:
        console.warn(`Unrecognized Paycrest event: ${event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[Paycrest Webhook Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
