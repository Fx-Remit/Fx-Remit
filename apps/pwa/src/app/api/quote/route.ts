import { NextRequest, NextResponse } from 'next/server';
import {
  PayoutService,
  PricingService,
  PAYCREST_SETTLEMENT,
} from '@fx-remit/services';

export const dynamic = 'force-dynamic';

/**
 * FX Remit Secure Quote Engine
 *
 * Always quotes the Paycrest settlement token (USDC on Base). UI may show USDT
 * etc., but Paycrest has no USDT→UGX/TZS books those 404 unless remapped.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const source = searchParams.get('source');
  const destination = searchParams.get('destination');
  const network = (
    searchParams.get('network') || PAYCREST_SETTLEMENT.network
  ).toLowerCase();

  if (!source || !destination) {
    return NextResponse.json(
      { error: 'Source and destination currencies required' },
      { status: 400 },
    );
  }

  try {
    // Stable reference amount avoids Paycrest 404s for tiny/huge notional sizes.
    const RATE_REFERENCE_AMOUNT = '1';
    const settlementToken = PAYCREST_SETTLEMENT.token;
    const wholesaleResp = await PayoutService.fetchRate(
      network,
      settlementToken,
      destination.toUpperCase(),
      RATE_REFERENCE_AMOUNT,
    );

    if (!wholesaleResp.success || !wholesaleResp.rate) {
      return NextResponse.json(
        {
          error: wholesaleResp.error || 'Failed to fetch wholesale rates',
          code: 'QUOTE_UNAVAILABLE',
        },
        { status: (wholesaleResp as { status?: number }).status || 500 },
      );
    }

    const retailQuote = PricingService.generateQuote(wholesaleResp.rate);

    return NextResponse.json({
      success: true,
      quote: {
        source_currency: source.toUpperCase(),
        settlement_token: settlementToken,
        destination_currency: destination.toUpperCase(),
        wholesale_rate: wholesaleResp.rate.rate,
        retail_rate: retailQuote.retail_rate,
        spread_bps: retailQuote.markup_bps,
        valid_until: retailQuote.valid_until,
        formatted_rate: `1 ${source.toUpperCase()} = ${retailQuote.retail_rate} ${destination.toUpperCase()}`,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal pricing error';
    console.error('[Quote API Failure]', message);
    return NextResponse.json({ error: 'Internal pricing error' }, { status: 500 });
  }
}
