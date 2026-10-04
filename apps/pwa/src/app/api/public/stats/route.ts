import { NextResponse } from 'next/server';
import { PublicStatsService } from '@fx-remit/services';

/** Public on-chain activity for the website's stats page. No auth: USD sent, short wallets, tx links only. */
// Vercel's CDN caches it for 10 minutes via s-maxage; dynamic so the build never queries the DB.
export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export async function GET() {
  try {
    const stats = await PublicStatsService.get();
    return NextResponse.json(stats, {
      headers: { ...CORS, 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('[PUBLIC_STATS] Error:', error);
    return NextResponse.json({ error: 'Stats unavailable' }, { status: 503, headers: CORS });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
