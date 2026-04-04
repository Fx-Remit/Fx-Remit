import { NextRequest, NextResponse } from 'next/server';
import { PayoutService, PricingService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

/**
 * FX Remit Secure Quote Engine
 * 
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const source = searchParams.get('source');
  const destination = searchParams.get('destination');
  const amount = searchParams.get('amount');

  if (!source || !destination) {
    return NextResponse.json({ error: 'Source and destination currencies required' }, { status: 400 });
  }

  try {
    const wholesaleResp = await PayoutService.fetchRate(source as string, destination as string, (amount as string) || '1');

    if (!wholesaleResp.success || !wholesaleResp.rate) {
      return NextResponse.json(
        { error: wholesaleResp.error || 'Failed to fetch wholesale rates' }, 
        { status: (wholesaleResp as any).status || 500 }
      );
    }

    const retailQuote = PricingService.generateQuote(wholesaleResp.rate);

    return NextResponse.json({
      success: true,
      quote: {
        source_currency: source,
        destination_currency: destination,
        wholesale_rate: wholesaleResp.rate.rate, 
        retail_rate: retailQuote.retail_rate, 
        spread_bps: retailQuote.markup_bps,
        valid_until: retailQuote.valid_until,
        formatted_rate: `1 ${source} = ${retailQuote.retail_rate} ${destination}`,
      },
    });
  } catch (error: any) {
    console.error('[Quote API Failure]', error.message);
    return NextResponse.json({ error: 'Internal pricing error' }, { status: 500 });
  }
}
