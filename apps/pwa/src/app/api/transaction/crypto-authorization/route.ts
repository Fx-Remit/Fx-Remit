import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { InstantSendWalletError, prepareCryptoAuthorization } from '@fx-remit/services';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const bodySchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

/**
 * Typed data the user signs in their wallet for a crypto cash-out to a new address.
 * Order, destination and amount all come from the reserved row; the signed result
 * goes to /api/transaction/broadcast-crypto-settlement.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let claims;
    try {
      claims = await privy.verifyAuthToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues.map((i) => i.message) },
        { status: 422 },
      );
    }
    let orderId: bigint;
    try {
      orderId = BigInt(parsed.data.orderId);
    } catch {
      return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true, walletAddress: true },
    });
    if (!user?.walletAddress) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    try {
      const prepared = await prepareCryptoAuthorization({ userId: user.id, walletAddress: user.walletAddress, orderId });
      return NextResponse.json(prepared);
    } catch (err) {
      if (err instanceof InstantSendWalletError) {
        const status = err.code === 'ORDER_NOT_FOUND' ? 404 : err.code === 'FORWARDER_UNAVAILABLE' ? 503 : 400;
        return NextResponse.json({ error: err.message, code: err.code }, { status });
      }
      throw err;
    }
  } catch (error: unknown) {
    console.error('[CRYPTO_AUTHORIZATION] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
