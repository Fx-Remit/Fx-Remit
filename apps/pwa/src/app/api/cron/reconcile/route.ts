import { NextResponse } from 'next/server';
import { ReconciliationService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron: remittance recovery + deposit catch-up.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');

    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('[Cron Reconcile] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Cron Reconcile] Running remittance + deposit reconciliation…');

    const results = await ReconciliationService.reconcileAll();

    console.log('[Cron Reconcile] Process complete:', results);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    console.error('[Cron Reconcile Failure]:', error.message);
    return NextResponse.json(
      { error: 'Internal reconciliation error', details: error.message },
      { status: 500 },
    );
  }
}
