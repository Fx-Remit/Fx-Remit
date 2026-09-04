import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { CryptoAddressService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

async function requireUser(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing authorization header' }, { status: 401 }) };
  }

  let claims;
  try {
    claims = await privy.verifyAuthToken(authHeader.slice(7));
  } catch {
    return { error: NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { privyDid: claims.userId },
    select: { id: true },
  });

  if (!user) {
    return { error: NextResponse.json({ error: 'User profile not found' }, { status: 404 }) };
  }

  return { user };
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const addresses = await CryptoAddressService.listForUser(auth.user.id, { backfill: true });

    return NextResponse.json({ success: true, addresses });
  } catch (error) {
    console.error('[CRYPTO_ADDRESSES] Unhandled error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
