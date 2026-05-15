import { prisma, Status } from '@fx-remit/database';
import { PayoutService } from './payout.service';

export class ReconciliationService {
  /**
   * Identifies and recovers stuck transactions.
   * Target: Transactions in 'VERIFIED' status older than 10 minutes.
   */
  static async reconcileStuckTransactions() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    console.log(
      `[ReconciliationService] Starting reconciliation for transactions older than ${tenMinutesAgo.toISOString()}`,
    );

    // Fetch stuck transactions
    const stuckTransactions = await prisma.transaction.findMany({
      where: {
        status: "VERIFIED",
        updatedAt: { lte: tenMinutesAgo },
      },
      include: {
        user: true,
      },
    });

    console.log(
      `[ReconciliationService] Found ${stuckTransactions.length} potential stuck transactions`,
    );

    const results = {
      recovered: 0,
      flagged: 0,
      failed: 0,
    };

    for (const tx of stuckTransactions) {
      try {
        // Deterministic Check: Can we auto-retry?
        // We need recipient data and an externalId (Paycrest Idempotency Key)
        if (
          tx.externalId &&
          tx.recipientAcc &&
          tx.recipientName &&
          tx.recipientBank
        ) {
          console.log(
            `[ReconciliationService] Attempting recovery for Order #${tx.orderId.toString()}`,
          );

          // Safely determine refund address: Prioritize user wallet, fallback to corporate suspense wallet.
          // NEVER fallback to zero-address (fund burn risk).
          const refundAddress = tx.user?.walletAddress || process.env.SUSPENSE_WALLET_ADDRESS;

          if (!refundAddress || refundAddress === "0x0000000000000000000000000000000000000000") {
            throw new Error(`Critical: No valid refund address for Order #${tx.orderId.toString()}. Recovery aborted.`);
          }

          const recoveryResult = await PayoutService.createPaycrestOrder({
            amount: tx.amountUsd.toString(),
            sourceToken: tx.sourceToken,
            destinationCurrency: "NGN", // Should be dynamic based on targetCurrency if stored
            externalId: tx.externalId,
            recipient: {
              accountIdentifier: tx.recipientAcc,
              accountName: tx.recipientName,
              institution: tx.recipientBank,
            },
            refundAddress,
          });

          if (recoveryResult.success) {
            results.recovered++;
          } else {
            console.error(
              `[ReconciliationService] Recovery failed for Order #${tx.orderId.toString()}: ${
                recoveryResult.error
              }`,
            );
            results.failed++;
          }
        } else {
          //  Flag for manual intervention if we lack data (Orphan transaction)
          console.warn(
            `[ReconciliationService] Flagging Transaction ${tx.id} for manual refund (missing recipient data)`,
          );

          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              status: "REFUND_REQUIRED",
              updatedAt: new Date(),
            },
          });

          results.flagged++;
        }
      } catch (error: any) {
        console.error(
          `[ReconciliationService] Critical error processing Tx ${tx.id}:`,
          error.message,
        );
        results.failed++;
      }
    }

    return results;
  }
}
