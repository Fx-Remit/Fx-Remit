import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import {
  TransactionService,
  verifyAbandonToken,
} from '@fx-remit/services';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const cancelPendingSchema = z.object({
  externalId: z.string().trim().min(1, 'externalId is required'),
  /** Short-lived capability from create-pending (pagehide / keepalive). */
  abandonToken: z.string().trim().min(1).optional(),
});

/**
 * Cancel a prefetched / abandoned remittance that never received an on-chain hash.
 * Auth: Privy Bearer OR a minted abandonToken scoped to externalId + userId.
 */
export async function POST(req: Request) {
  try {
    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = cancelPendingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.issues.map((i) => i.message),
        },
        { status: 422 },
      );
    }

    const { externalId, abandonToken } = parsed.data;
    const authHeader = req.headers.get('authorization');

    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const claims = await privy.verifyAuthToken(token);
        const user = await prisma.user.findUnique({
          where: { privyDid: claims.userId },
          select: { id: true },
        });
        if (!user) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        userId = user.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[CANCEL_PENDING] Privy verifyAuthToken failed:', message);
        // Fall through to abandonToken if present
      }
    }

    if (!userId && abandonToken) {
      const claims = verifyAbandonToken(abandonToken, externalId);
      if (!claims) {
        return NextResponse.json(
          { error: 'Invalid or expired abandon token' },
          { status: 401 },
        );
      }
      userId = claims.userId;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await TransactionService.findByPaycrestKey(externalId);
    if (!existing) {
      return NextResponse.json({
        success: true,
        cancelled: false,
        reason: 'not_found',
      });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
      const cancelled = await TransactionService.cancelAbandonedPending(externalId);
      return NextResponse.json({
        success: true,
        cancelled: true,
        status: cancelled?.status ?? 'FAILED',
        externalId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('on-chain txHash already attached')) {
        return NextResponse.json(
          { error: message, code: 'ALREADY_ON_CHAIN' },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('[CANCEL_PENDING] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
