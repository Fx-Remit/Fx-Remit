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
  const network = searchParams.get('network') || 'base';

  if (!source || !destination) {
    return NextResponse.json({ error: 'Source and destination currencies required' }, { status: 400 });
  }

  try {
    // Always fetch rate using a stable reference amount to avoid Paycrest 404s
    // for amounts outside provider liquidity range (e.g. 0.40, 0, 10000+).
    // The per-unit rate is returned and the UI multiplies by the user's amount.
    const RATE_REFERENCE_AMOUNT = '1';
    const wholesaleResp = await PayoutService.fetchRate(network, source as string, destination as string, RATE_REFERENCE_AMOUNT);

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
