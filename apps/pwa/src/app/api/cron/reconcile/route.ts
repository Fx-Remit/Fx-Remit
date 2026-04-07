import { NextResponse } from 'next/server';
import { ReconciliationService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron: Transaction Reconciliation
 * This endpoint catches transactions that were verified on-chain
 * but failed to initiate a payout due to provider downtime or server errors.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');

    // Secure the endpoint using Vercel's CRON_SECRET or a custom environment variable
    if (process.env.NODE_ENV === 'production') {
      if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        console.warn('[Cron Reconcile] Unauthorized access attempt');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('[Cron Reconcile] Triggering stuck transaction recovery...');
    
    const results = await ReconciliationService.reconcileStuckTransactions();

    console.log('[Cron Reconcile] Process complete:', results);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    console.error('[Cron Reconcile Failure]:', error.message);
    return NextResponse.json({ error: 'Internal reconciliation error', details: error.message }, { status: 500 });
  }
}
