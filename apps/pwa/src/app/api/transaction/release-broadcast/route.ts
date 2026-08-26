import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { TransactionService } from '@fx-remit/services';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const bodySchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((v) => String(v)),
  /** Required — release only when the client never obtained a tx hash (definite pre-send fail). */
  paycrestOrderId: z.string().trim().min(1),
});

/**
 * Release broadcasting-* → pending-* after a definite pre-send failure on the
 * client Instant Send bridge. Do not call after an ambiguous send error.
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
      console.error('[RELEASE_BROADCAST] Privy verifyAuthToken failed:', message);
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

    const released = await TransactionService.releaseBroadcastClaim({
      userId: user.id,
      orderId,
      paycrestOrderId: parsed.data.paycrestOrderId,
    });

    return NextResponse.json({ success: true, released });
  } catch (error: unknown) {
    console.error('[RELEASE_BROADCAST] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
