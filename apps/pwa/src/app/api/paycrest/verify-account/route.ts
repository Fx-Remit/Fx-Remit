import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { PayoutService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? "";
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    try {
      await privy.verifyAuthToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const body = await req.json();
    const { accountNumber, bankCode, countryCode } = body;

    if (!accountNumber || !bankCode) {
      return NextResponse.json({ error: 'Account number and bank code are required' }, { status: 400 });
    }

    const resp = await PayoutService.verifyBeneficiary(accountNumber, bankCode, countryCode || 'NG');

    if (!resp.success) {
      return NextResponse.json(
        { error: resp.error || 'Verification failed' }, 
        { status: (resp as any).status || 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: resp.data,
    });
  } catch (error: any) {
    console.error('[Verification API Failure]', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
