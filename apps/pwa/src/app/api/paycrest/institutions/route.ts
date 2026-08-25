import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { PayoutService } from '@fx-remit/services';
import { normalizeFiatCurrency } from '@/lib/cash-out/fiat-country';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? "";
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    // Paycrest GET /institutions/{currency_code} — NGN not NG.
    // Accept ?currency= or legacy ?country= (may be fiat or country).
    const currencyCode = normalizeFiatCurrency(
      searchParams.get('currency') || searchParams.get('country') || 'NGN',
    );

    const resp = await PayoutService.getInstitutions(currencyCode);

    if (!resp.success) {
      return NextResponse.json(
        { error: resp.error || 'Failed to fetch institutions' },
        { status: (resp as any).status || 500 },
      );
    }

    return NextResponse.json({
      success: true,
      currency: currencyCode,
      institutions: resp.data,
    });
  } catch (error: any) {
    console.error('[Institutions API Failure]', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
