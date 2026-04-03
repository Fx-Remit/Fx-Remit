import { NextResponse } from 'next/server';
import { PrivyClient, verifyAuthToken } from '@privy-io/node';
import { prisma } from '@fx-remit/database';

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    const user = await privy.users().get({ id_token: token });

    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const wallet = user.linked_accounts.find((a) => a.type === 'wallet');

    if (!wallet || wallet.type !== 'wallet') {
      return NextResponse.json({ error: 'No wallet linked' }, { status: 400 });
    }

    const emailAccount = user.linked_accounts.find((a) => a.type === 'email');
    const email = emailAccount?.type === 'email' ? emailAccount.address : undefined;

    const dbUser = await prisma.user.upsert({
      where: { privyDid: user.id },
      update: {
        walletAddress: wallet.address,
        email: email,
      },
      create: {
        privyDid: user.id,
        walletAddress: wallet.address,
        email: email,
      },
    });

    return NextResponse.json({ success: true, user: dbUser });
  } catch (error) {
    console.error('Onboarding Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
