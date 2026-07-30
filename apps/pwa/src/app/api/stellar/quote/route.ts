import { NextRequest, NextResponse } from 'next/server';
import { getStellarRetailQuote, type StellarCorridor } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

const CORRIDORS: StellarCorridor[] = ['NGN', 'KES'];

/**
 * Stellar SEP-38 quote (read-only). Dual-rail: does not affect EVM /api/quote.
 *
 * GET /api/stellar/quote?corridor=NGN|KES&amount=1
 */
export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_STELLAR_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Stellar rail disabled' }, { status: 404 });
  }

  const corridor = req.nextUrl.searchParams.get('corridor')?.toUpperCase() as StellarCorridor;
  const amount = req.nextUrl.searchParams.get('amount') ?? '1';

  if (!corridor || !CORRIDORS.includes(corridor)) {
    return NextResponse.json(
      { error: 'corridor required (NGN or KES)' },
      { status: 400 },
    );
  }

  try {
    const { wholesale, retail } = await getStellarRetailQuote(corridor, amount);

    return NextResponse.json({
      success: true,
      rail: 'STELLAR',
      quote: {
        corridor,
        anchor_id: wholesale.anchor_id,
        source_currency: wholesale.source_currency,
        destination_currency: wholesale.destination_currency,
        wholesale_rate: wholesale.rate,
        retail_rate: retail.retail_rate,
        spread_bps: retail.markup_bps,
        valid_until: retail.valid_until,
        expires_at: wholesale.expires_at,
        demo_fiat: wholesale.demo_fiat,
        demo_note: wholesale.demo_note,
        formatted_rate: `1 ${wholesale.source_currency} = ${retail.retail_rate} ${wholesale.destination_currency}`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Stellar quote failed';
    console.error('[Stellar Quote API]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
