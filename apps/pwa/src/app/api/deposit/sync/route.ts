import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { DepositService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const SUPPORTED = new Set<number>([8453, 42220]);

/**
 * Poll Alchemy for inbound allowlisted ERC-20 transfers and credit the ledger.
 * Used by Add Cash while waiting for a deposit (works without Address Activity webhook).
 */
export async function POST(req: Request) {
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
      select: { id: true, walletAddress: true },
    });

    if (!user?.walletAddress) {
      return NextResponse.json({ error: 'User wallet not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const chainId = Number(body.chainId);

    if (!SUPPORTED.has(chainId)) {
      return NextResponse.json(
        { error: 'Unsupported chain. Use Base (8453) or Celo (42220).' },
        { status: 400 },
      );
    }

    const result = await DepositService.syncWalletDeposits({
      walletAddress: user.walletAddress,
      chainId,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[deposit/sync]', error);
    return NextResponse.json(
      {
        error: 'Deposit sync failed',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
