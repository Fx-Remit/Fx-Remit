import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { TransactionService } from '@fx-remit/services';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const cancelPendingSchema = z.object({
  externalId: z.string().trim().min(1, 'externalId is required'),
});

/**
 * Cancel a prefetched / abandoned remittance that never received an on-chain hash.
 * Restores ledger via TransactionService.cancelAbandonedPending.
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
      console.error('[CANCEL_PENDING] Privy verifyAuthToken failed:', message);
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

    const { externalId } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const existing = await TransactionService.findByPaycrestKey(externalId);
    if (!existing) {
      return NextResponse.json({
        success: true,
        cancelled: false,
        reason: 'not_found',
      });
    }

    if (existing.userId !== user.id) {
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
      // On-chain hash already attached — do not unwind
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
