import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { DepositService, DEPOSIT_CHAIN_IDS } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

/**
 * Sync missed deposits, then return spendable ledger + live chain totals.
 * Home displays spendable (ledger); live is informational.
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

    // Catch up ledger from chain before reporting spendable balance
    for (const chainId of DEPOSIT_CHAIN_IDS) {
      try {
        await DepositService.syncWalletDeposits({
          walletAddress: user.walletAddress,
          chainId,
        });
      } catch (err) {
        console.warn(`[deposit/balance] sync ${chainId} failed`, err);
      }
    }

    const refreshed = await prisma.user.findUnique({
      where: { id: user.id },
      select: { walletBalance: true },
    });

    const live = await DepositService.getLiveBalances(user.walletAddress);
    const ledgerUsd = Number(refreshed?.walletBalance?.toString() || 0);

    return NextResponse.json({
      success: true,
      walletAddress: user.walletAddress,
      liveUsd: live.totalUsd,
      ledgerUsd,
      /** Spendable balance used for cash-out / home display */
      displayUsd: ledgerUsd,
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
