import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { TransactionService, verifySettlementHash } from '@fx-remit/services';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const syncHashSchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((v) => String(v)),
  txHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be a 0x-prefixed 32-byte hash'),
});

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
      console.error('[SYNC_HASH] Privy verifyAuthToken failed:', message);
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

    const parsed = syncHashSchema.safeParse(rawBody);
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
      select: { id: true, walletAddress: true },
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

    const txHash = parsed.data.txHash as `0x${string}`;
    const existing = await TransactionService.findRemittanceForBroadcast({
      userId: user.id,
      orderId,
    });
    if (!existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // A placeholder row only takes a hash the chain proves funds it (#102). The
    // server's own broadcasts attach before replying, so their sync is a no-op here.
    const isPlaceholder =
      existing.txHash.startsWith('pending-') ||
      TransactionService.isBroadcastClaimHash(existing.txHash);
    if (isPlaceholder && existing.txHash.toLowerCase() !== txHash.toLowerCase()) {
      if (!user.walletAddress) {
        return NextResponse.json({ error: 'No wallet on this account' }, { status: 409 });
      }
      const reused = await prisma.transaction.findFirst({
        where: { txHash: { equals: txHash, mode: 'insensitive' }, NOT: { id: existing.id } },
        select: { id: true },
      });
      if (reused) {
        return NextResponse.json({ error: 'This hash belongs to another transaction' }, { status: 409 });
      }
      let proof;
      try {
        proof = await verifySettlementHash({ row: existing, walletAddress: user.walletAddress, txHash });
      } catch (err) {
        console.error('[SYNC_HASH] Receipt lookup failed:', err instanceof Error ? err.message : String(err));
        return NextResponse.json({ error: 'Could not check this transaction yet. Try again shortly.' }, { status: 503 });
      }
      if (proof === 'PENDING') {
        return NextResponse.json({ error: 'Transaction not confirmed yet. Try again shortly.' }, { status: 409 });
      }
      if (proof === 'MISMATCH') {
        return NextResponse.json({ error: 'This transaction does not fund this payout' }, { status: 422 });
      }
    }

    let updated;
    try {
      updated = await TransactionService.attachOnChainHash({
        userId: user.id,
        orderId,
        txHash,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Invalid txHash') {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      if (message.includes('already has an on-chain hash')) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      throw err;
    }

    if (!updated) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const synced = await TransactionService.syncPaycrestStatusForRemittance({
      userId: user.id,
      orderId,
    });

    return NextResponse.json({
      success: true,
      transaction: TransactionService.serialize(synced ?? updated),
    });
  } catch (error: unknown) {
    console.error('[SYNC_HASH] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
