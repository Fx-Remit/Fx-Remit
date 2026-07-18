import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Status } from '@fx-remit/database';
import { TransactionService } from '@fx-remit/services';

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
     * Offramp: `validated` = fiat delivered (safe to mark COMPLETED).
     * `settled` = on-chain settlement finished (also COMPLETED).
     * Resolve by reference (our externalId) first, then Paycrest order id.
     */
    const paycrestKeys = [data?.reference, data?.id].filter(
      (k: unknown, i: number, arr: unknown[]) =>
        typeof k === "string" && k.length > 0 && arr.indexOf(k) === i,
    ) as string[];

    const applyStatus = async (status: Status | 'COMPLETED' | 'FAILED') => {
      for (const key of paycrestKeys) {
        const updated = await TransactionService.updateFromPaycrest(key, status as Status);
        if (updated) {
          console.log(
            `[Paycrest Webhook] ${event} → ${status} for key=${key} tx=${updated.id}`,
          );
          return updated;
        }
      }
      console.warn(
        `[Paycrest Webhook] No remittance matched keys=${JSON.stringify(paycrestKeys)} for ${event}`,
      );
      return null;
    };

    switch (event) {
      // Fiat confirmed for offramp do not wait for later `settled`
      case 'payment_order.validated':
      case 'payment_order.settled':
        await applyStatus('COMPLETED');
        break;

      case 'payment_order.failed':
      case 'payment_order.expired':
        await applyStatus('FAILED');
        break;

      case 'payment_order.refunding':
      case 'payment_order.refunded':
        await applyStatus(Status.REFUNDING);
        break;

      default:
        // Fallback: some payloads only bump data.status without a mapped event name
        if (data?.status === 'validated' || data?.status === 'settled') {
          await applyStatus('COMPLETED');
        } else if (data?.status === 'failed' || data?.status === 'expired') {
          await applyStatus('FAILED');
        } else if (data?.status === 'refunding' || data?.status === 'refunded') {
          await applyStatus(Status.REFUNDING);
        } else {
          console.warn(`Unrecognized Paycrest event: ${event}`);
        }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[Paycrest Webhook Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
