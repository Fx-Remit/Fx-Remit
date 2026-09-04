import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { CryptoAddressService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
    }

    let claims;
    try {
      claims = await privy.verifyAuthToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'Address id required' }, { status: 400 });
    }

    const deleted = await CryptoAddressService.deleteForUser(user.id, id.trim());
    if (!deleted) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CRYPTO_ADDRESSES_DELETE] Unhandled error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
