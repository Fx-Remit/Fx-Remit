import { prisma } from '@fx-remit/database';
import { PayoutService } from '../paycrest/payout.service';
import { DepositService } from '../deposits/deposit.service';
import { TransactionService } from '../transactions/transaction.service';

export class ReconciliationService {
  /**
   * Identifies and recovers stuck remittance transactions.
   * Target: Transactions in 'VERIFIED' status older than 10 minutes.
   *
   * Dual-rail guard (#95): rows with a real on-chain RemittanceInitiated hash
   * already funded the Paycrest gateway — never call createPaycrestOrder again
   * (that would open a second API order). Claim VERIFIED→PROCESSING so cron
   * does not loop; fiat completion stays on Paycrest webhooks.
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
      restored: 0,
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

          // Skip crypto withdraws — they are not Paycrest offramps.
          if (tx.recipientBank?.startsWith('crypto:')) {
            console.warn(
              `[ReconciliationService] Skipping crypto withdraw ${tx.id} in Paycrest recovery`,
            );
            results.failed++;
            continue;
          }

          // Claim VERIFIED → PROCESSING before any recovery so a later cron
          // cannot double-handle the same row.
          const claimed = await prisma.transaction.updateMany({
            where: { id: tx.id, status: 'VERIFIED' },
            data: {
              status: 'PROCESSING',
              updatedAt: new Date(),
            },
          });
          if (claimed.count !== 1) {
            continue;
          }

          // Gateway-funded (#95): real 0x hash means RemittanceInitiated already
          // settled on-chain — do not open a second Paycrest API order.
          if (TransactionService.isOnChainTxHash(tx.txHash)) {
            console.log(
              `[ReconciliationService] Gateway-funded remittance ${tx.id}; skipping createPaycrestOrder (await webhooks)`,
            );
            results.recovered++;
            continue;
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

          if (recoveryResult.success && recoveryResult.order?.id) {
            // Keep real on-chain txHash; PROCESSING awaits Paycrest webhooks.
            results.recovered++;
          } else {
            // Revert claim so a later pass can retry recovery.
            await prisma.transaction.updateMany({
              where: { id: tx.id, status: 'PROCESSING' },
              data: {
                status: 'VERIFIED',
                updatedAt: new Date(),
              },
            });
            console.error(
              `[ReconciliationService] Recovery failed for Order #${tx.orderId.toString()}: ${
                recoveryResult.error
              }`,
            );
            results.failed++;
          }
        } else {
          console.warn(
            `[ReconciliationService] Orphan remittance ${tx.id} missing recipient data (#96)`,
          );

          const flagged = await TransactionService.flagOrphanRefundRequired({
            id: tx.id,
            userId: tx.userId,
            orderId: tx.orderId,
            amountUsd: tx.amountUsd,
            status: tx.status,
            txHash: tx.txHash,
            externalId: tx.externalId,
          });

          if (flagged.outcome === 'flagged') {
            results.flagged++;
          } else if (flagged.outcome === 'restored_failed') {
            results.restored++;
          } else {
            results.failed++;
          }
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
   * Full cron pass: expire abandoned pendings + REFUND_REQUIRED TTL + recovery +
   * deposits + Notify. Surfaces refundRequiredOpen for monitoring (#96).
   */
  static async reconcileAll() {
    const expiredPendings = await this.expireAbandonedPendings();
    const staleBroadcastClaims =
      await TransactionService.escalateStaleBroadcastClaims();
    const expiredRefundRequired =
      await TransactionService.expireStaleRefundRequired();
    const remittances = await this.reconcileStuckTransactions();
    const deposits = await this.reconcileDeposits();
    const refundRequiredOpen =
      await TransactionService.countOpenRefundRequired();

    if (refundRequiredOpen > 0) {
      console.error(
        JSON.stringify({
          alert: 'REFUND_REQUIRED_BACKLOG',
          severity: 'high',
          refundRequiredOpen,
          message:
            'Open REFUND_REQUIRED remittances — ops: restoreRefundRequired (write-off) or completeRefundRequiredAfterOnChainCredit (refund deposited)',
        }),
      );
    }

    let notifyRegistered = 0;
    try {
      const { AlchemyNotifyService } = await import('../alchemy/alchemy-notify.service');
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

    return {
      expiredPendings,
      staleBroadcastClaims,
      expiredRefundRequired,
      remittances,
      deposits,
      refundRequiredOpen,
      notifyRegistered,
    };
  }

  /**
   * Auto-cancel prefetched remittances stuck in PENDING/PROCESSING with no on-chain hash.
   * Default TTL: 30 minutes (override with PENDING_REMITTANCE_TTL_MS).
   */
  static async expireAbandonedPendings() {
    const olderThanMs = Number(
      process.env.PENDING_REMITTANCE_TTL_MS ?? 30 * 60 * 1000,
    );
    console.log(
      `[ReconciliationService] Expiring pending remittances older than ${olderThanMs}ms…`,
    );
    return TransactionService.expireStalePendingRemittances({ olderThanMs });
  }
}
