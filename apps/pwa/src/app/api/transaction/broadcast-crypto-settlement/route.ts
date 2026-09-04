import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import {
  broadcastCryptoTransfer,
  InstantSendNotConfiguredError,
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
 * Crypto cash-out Instant Send: server-authorized transfer for a reserved
 * PENDING crypto remittance. Client must only send orderId, recipient,
 * amount, token, and network all come from the pending Transaction row that
 * create-crypto-pending already bound server-side, and the recipient is only
 * ever broadcast to once it has passed CryptoAddressService's trust cooldown.
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
      console.error('[BROADCAST_CRYPTO_SETTLEMENT] Privy verifyAuthToken failed:', message);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
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
        { error: 'Validation failed', details: parsed.error.issues.map((i) => i.message) },
        { status: 422 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true, walletAddress: true },
    });

    if (!user?.walletAddress) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let orderId: bigint;
    try {
      orderId = BigInt(parsed.data.orderId);
    } catch {
      return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 });
    }

    try {
      const result = await broadcastCryptoTransfer({
        privyDid: claims.userId,
        userId: user.id,
        walletAddress: user.walletAddress,
        orderId,
      });

      return NextResponse.json({
        success: true,
        txHash: result.txHash,
        alreadyBroadcast: result.alreadyBroadcast,
      });
    } catch (err) {
      if (err instanceof InstantSendNotConfiguredError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
      }
      if (err instanceof InstantSendWalletError) {
        const status =
          err.code === 'ORDER_NOT_FOUND'
            ? 404
            : err.code === 'NOT_DELEGATED' ||
                err.code === 'WALLET_OWNERSHIP' ||
                err.code === 'ADDRESS_NOT_TRUSTED'
              ? 403
              : err.code === 'BROADCAST_IN_PROGRESS' || err.code === 'BROADCAST_UNCERTAIN'
                ? 409
                : 400;
        return NextResponse.json({ error: err.message, code: err.code }, { status });
      }
      throw err;
    }
  } catch (error: unknown) {
    console.error('[BROADCAST_CRYPTO_SETTLEMENT] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
