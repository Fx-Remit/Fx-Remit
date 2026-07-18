import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { DepositService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

/**
 * Live on-chain allowlisted balances + DB ledger balance.
 * Home UI prefers live for display; cash-out should keep using ledger.
 */
export async function GET(req: Request) {
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
      select: { id: true, walletAddress: true, walletBalance: true },
    });

    if (!user?.walletAddress) {
      return NextResponse.json({ error: 'User wallet not found' }, { status: 404 });
    }

    const live = await DepositService.getLiveBalances(user.walletAddress);
    const ledgerUsd = Number(user.walletBalance?.toString() || 0);

    return NextResponse.json({
      success: true,
      walletAddress: user.walletAddress,
      liveUsd: live.totalUsd,
      ledgerUsd,
      displayUsd: live.totalUsd,
      perChain: live.perChain,
    });
  } catch (error) {
    console.error('[deposit/balance]', error);
    return NextResponse.json(
      {
        error: 'Balance fetch failed',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
