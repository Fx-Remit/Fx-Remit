import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import {
  claimSettlementBroadcastSlot,
  InstantSendWalletError,
} from '@fx-remit/services';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const bodySchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

/**
 * CAS claim pending-* → broadcasting-* before a client-side Instant Send bridge send.
 * Prevents concurrent silent sends without the server broadcast path.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    let claims;
    try {
      claims = await privy.verifyAuthToken(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[CLAIM_BROADCAST] Privy verifyAuthToken failed:', message);
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 },
      );
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.issues.map((i) => i.message),
        },
        { status: 422 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let orderId: bigint;
    try {
      orderId = BigInt(parsed.data.orderId);
    } catch {
      return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 });
    }

    try {
      const result = await claimSettlementBroadcastSlot({
        userId: user.id,
        orderId,
      });
      return NextResponse.json({
        success: true,
        claimed: !result.alreadyBroadcast,
        alreadyBroadcast: result.alreadyBroadcast,
        paycrestOrderId: result.paycrestOrderId || undefined,
        txHash: result.txHash,
      });
    } catch (err) {
      if (err instanceof InstantSendWalletError) {
        const status =
          err.code === 'ORDER_NOT_FOUND'
            ? 404
            : err.code === 'BROADCAST_IN_PROGRESS'
              ? 409
              : 400;
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status },
        );
      }
      throw err;
    }
  } catch (error: unknown) {
    console.error('[CLAIM_BROADCAST] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
