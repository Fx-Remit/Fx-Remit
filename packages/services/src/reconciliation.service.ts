import { prisma } from '@fx-remit/database';
import { PayoutService } from './payout.service';
import { DepositService } from './deposit.service';

export class ReconciliationService {
  /**
   * Identifies and recovers stuck remittance transactions.
   * Target: Transactions in 'VERIFIED' status older than 10 minutes.
   */
  static async reconcileStuckTransactions() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    console.log(
      `[ReconciliationService] Starting reconciliation for transactions older than ${tenMinutesAgo.toISOString()}`,
    );

    const stuckTransactions = await prisma.transaction.findMany({
      where: {
        status: 'VERIFIED',
        type: 'REMITTANCE',
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
        if (
          tx.externalId &&
          tx.recipientAcc &&
          tx.recipientName &&
          tx.recipientBank
        ) {
          console.log(
            `[ReconciliationService] Attempting recovery for Order #${tx.orderId.toString()}`,
          );

          const refundAddress =
            tx.user?.walletAddress || process.env.SUSPENSE_WALLET_ADDRESS;

          if (
            !refundAddress ||
            refundAddress === '0x0000000000000000000000000000000000000000'
          ) {
            throw new Error(
              `Critical: No valid refund address for Order #${tx.orderId.toString()}. Recovery aborted.`,
            );
          }

          const recoveryResult = await PayoutService.createPaycrestOrder({
            amount: tx.amountUsd.toString(),
            sourceToken: tx.sourceToken,
            destinationCurrency: 'NGN',
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
          console.warn(
            `[ReconciliationService] Flagging Transaction ${tx.id} for manual refund (missing recipient data)`,
          );

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
        console.error(
          `[ReconciliationService] Critical error processing Tx ${tx.id}:`,
          error.message,
        );
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Re-scan inbound ERC-20 transfers for user wallets (ledger ↔ chain catch-up).
   */
  static async reconcileDeposits() {
    console.log('[ReconciliationService] Scanning wallets for missed deposits…');
    return DepositService.reconcileAllWallets();
  }

  /**
   * Full cron pass: remittance recovery + deposit catch-up + Notify wallet backfill.
   */
  static async reconcileAll() {
    const remittances = await this.reconcileStuckTransactions();
    const deposits = await this.reconcileDeposits();

    let notifyRegistered = 0;
    try {
      const { AlchemyNotifyService } = await import('./alchemy-notify.service');
      if (AlchemyNotifyService.isConfigured()) {
        const users = await prisma.user.findMany({
          where: { walletAddress: { not: null } },
          select: { walletAddress: true },
          take: 500,
        });
        for (const u of users) {
          if (!u.walletAddress) continue;
          await AlchemyNotifyService.registerAddress(u.walletAddress);
          notifyRegistered += 1;
        }
      }
    } catch (err) {
      console.error('[ReconciliationService] Notify backfill failed', err);
    }

    return { remittances, deposits, notifyRegistered };
  }
}
