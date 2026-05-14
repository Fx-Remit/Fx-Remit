import { NextRequest, NextResponse } from 'next/server';
import { PayoutService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const countryCode = searchParams.get('country') || 'NG';

  try {
    const resp = await PayoutService.getInstitutions(countryCode);

    if (!resp.success) {
      return NextResponse.json(
        { error: resp.error || 'Failed to fetch institutions' }, 
        { status: (resp as any).status || 500 }
      );
    }

    return NextResponse.json({
      success: true,
      institutions: resp.data,
    });
  } catch (error: any) {
    console.error('[Institutions API Failure]', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
