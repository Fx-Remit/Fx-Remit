import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { AlchemyNotifyService } from '@fx-remit/services';
import { isAddress } from 'viem';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

function linkedWalletAddresses(privyUser: {
  linkedAccounts?: Array<{ type?: string; address?: string }>;
}): string[] {
  const accounts = privyUser.linkedAccounts ?? [];
  return accounts
    .filter(
      (a) =>
        (a.type === 'wallet' || a.type === 'smart_wallet') &&
        typeof a.address === 'string' &&
        isAddress(a.address),
    )
    .map((a) => a.address!.toLowerCase());
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { fullName, displayName, avatarUrl, walletAddress, email } = body;

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7);

    let claims;
    try {
      claims = await privy.verifyAuthToken(token);
      console.log('[AUTH] Token verified via Server SDK. User:', claims.userId);
    } catch (err) {
      console.error('[AUTH] Token verification failed:', err);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    let verifiedWallet: string | undefined;
    if (walletAddress != null && walletAddress !== '') {
      if (typeof walletAddress !== 'string' || !isAddress(walletAddress)) {
        return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
      }

      let privyUser;
      try {
        privyUser = await privy.getUser(claims.userId);
      } catch (err) {
        console.error('[ONBOARD] privy.getUser failed:', err);
        return NextResponse.json(
          { error: 'Failed to verify wallet ownership' },
          { status: 502 },
        );
      }

      const owned = linkedWalletAddresses(privyUser);
      if (!owned.includes(walletAddress.toLowerCase())) {
        return NextResponse.json(
          { error: 'Wallet is not linked to this Privy account' },
          { status: 403 },
        );
      }
      verifiedWallet = walletAddress;
    }

    let dbUser;
    try {
      const existing = await prisma.user.findUnique({
        where: { privyDid: claims.userId },
        select: { walletAddress: true },
      });

      dbUser = await prisma.user.upsert({
        where: { privyDid: claims.userId },
        update: {
          walletAddress: verifiedWallet || undefined,
          email: email || undefined,
          fullName: fullName || undefined,
          displayName: displayName || undefined,
          avatarUrl: avatarUrl || undefined,
        },
        create: {
          privyDid: claims.userId,
          walletAddress: verifiedWallet || undefined,
          email: email || undefined,
          fullName: fullName || undefined,
          displayName: displayName || undefined,
          avatarUrl: avatarUrl || undefined,
        },
      });
      console.log('[DB] User upserted:', dbUser.id);

      try {
        await AlchemyNotifyService.syncWalletChange({
          previousAddress: existing?.walletAddress,
          nextAddress: verifiedWallet || existing?.walletAddress || null,
        });
      } catch (notifyErr) {
        console.error('[ONBOARD] Alchemy Notify registration failed:', notifyErr);
      }
    } catch (dbErr) {
      console.error('[DB] Upsert failed:', dbErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: dbUser });
  } catch (error) {
    console.error('[ONBOARD] Unhandled error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
