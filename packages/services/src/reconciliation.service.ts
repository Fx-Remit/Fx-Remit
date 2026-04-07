import { prisma, Status } from '@fx-remit/database';
import { PayoutService } from './payout.service';

export class ReconciliationService {
  /**
   * Identifies and recovers stuck transactions.
   * Target: Transactions in 'VERIFIED' status older than 10 minutes.
   */
  static async reconcileStuckTransactions() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    console.log(`[ReconciliationService] Starting reconciliation for transactions older than ${tenMinutesAgo.toISOString()}`);

    // 1. Fetch stuck transactions
    const stuckTransactions = await prisma.transaction.findMany({
      where: {
        status: 'VERIFIED',
        updatedAt: { lte: tenMinutesAgo },
      },
    });

    console.log(`[ReconciliationService] Found ${stuckTransactions.length} potential stuck transactions`);

    const results = {
      recovered: 0,
      flagged: 0,
      failed: 0,
    };

    for (const tx of stuckTransactions) {
      try {
        // 2. Deterministic Check: Can we auto-retry?
        // We need recipient data and an externalId (Paycrest Idempotency Key)
        if (tx.externalId && tx.recipientAcc && tx.recipientName && tx.recipientBank) {
          console.log(`[ReconciliationService] Attempting recovery for Order #${tx.orderId.toString()}`);

          const recoveryResult = await PayoutService.createPaycrestOrder({
            amount: tx.amountUsd.toString(),
            sourceAsset: tx.sourceToken,
            destinationAsset: 'NGN', // Should be dynamic based on targetCurrency if stored
            externalId: tx.externalId,
            recipient: {
              account_number: tx.recipientAcc,
              beneficiary_name: tx.recipientName,
              bank_code: tx.recipientBank,
            },
          });

          if (recoveryResult.success) {
            results.recovered++;
          } else {
            console.error(`[ReconciliationService] Recovery failed for Order #${tx.orderId.toString()}: ${recoveryResult.error}`);
            results.failed++;
          }
        } else {
          // 3. Flag for manual intervention if we lack data (Orphan transaction)
          console.warn(`[ReconciliationService] Flagging Transaction ${tx.id} for manual refund (missing recipient data)`);
          
          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              status: 'REFUND_REQUIRED',
              updatedAt: new Date(),
            },
          });
          
          results.flagged++;
        }
      } catch (error: any) {
        console.error(`[ReconciliationService] Critical error processing Tx ${tx.id}:`, error.message);
        results.failed++;
      }
    }

    return results;
  }
}
