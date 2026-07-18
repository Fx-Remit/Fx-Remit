import { prisma, Prisma } from '@fx-remit/database';
import { decodeEventLog } from 'viem';
import routerAbi from './abi/FXRemitRouter.json';
import { DepositService } from './deposit.service';

export class AlchemyService {
  /**
   * Alchemy webhook entrypoint.
   * - ADDRESS_ACTIVITY → inbound wallet deposits (ERC-20 allowlist)
   * - GRAPHQL / mined tx logs → RemittanceInitiated (cash-out path)
   */
  static async handleWebhook(payload: any) {
    const type = String(payload?.type || '').toUpperCase();

    if (type === 'ADDRESS_ACTIVITY' || payload?.event?.activity) {
      const activity = payload?.event?.activity ?? [];
      const result = await DepositService.handleAlchemyActivity({
        network: payload?.event?.network,
        activity,
      });
      return {
        success: true,
        message: 'Deposit activity processed',
        synced: result.credited,
        skipped: result.skipped,
      };
    }

    const { event } = payload;

    if (!event || !event.data || !event.data.block) {
      return { success: true, message: 'No event data' };
    }

    const logs = event.data.block.logs || [];
    const syncResults = [];

    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: routerAbi,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'RemittanceInitiated') {
          const args = decoded.args as any;
          const { orderId, sender, amountToRemit, amountIn, fromToken } = args;

          console.log(`[AlchemyService] Mapping Order #${orderId.toString()} | Sender: ${sender}`);

          const user = await prisma.user.findUnique({
            where: { walletAddress: sender },
          });

          const normalizedAmountUsd = new Prisma.Decimal(amountIn.toString()).div(1_000_000);
          const normalizedPayoutFiat = new Prisma.Decimal(amountToRemit.toString()).div(1_000_000);

          const blockNumber = BigInt(event.data.block.number);
          const logIndex = Number(log.index);
          const chainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 8453);

          const result = await prisma.transaction.upsert({
            where: {
              orderId_chainId: {
                orderId: orderId,
                chainId: chainId,
              },
            },
            update: {
              status: 'VERIFIED',
              txHash: log.transactionHash,
              blockNumber,
              updatedAt: new Date(),
            },
            create: {
              orderId: orderId,
              userId: user?.id || 'SYSTEM_ORPHAN',
              txHash: log.transactionHash,
              chainId,
              blockNumber,
              logIndex,
              sourceToken: fromToken,
              amountUsd: normalizedAmountUsd,
              payoutFiat: normalizedPayoutFiat,
              status: 'VERIFIED',
              recipientName: 'Processing',
              createdAt: new Date(),
            },
          });

          syncResults.push(result);

          return { success: true, event: decoded, transaction: result, synced: 1 };
        }
      } catch {
        continue;
      }
    }

    return { success: true, synced: syncResults.length };
  }
}
