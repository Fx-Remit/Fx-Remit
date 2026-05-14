import { NextRequest, NextResponse } from 'next/server';
import { PayoutService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
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
