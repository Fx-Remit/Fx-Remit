import { prisma } from '@fx-remit/database';
import { decodeEventLog } from 'viem';
import routerAbi from './abi/FXRemitRouter.json';

export class AlchemyService {
  /**
   * High-fidelity processing of Alchemy Webhook payloads.
   * Links on-chain 'RemittanceInitiated' events to local user identities.
   */
  static async handleWebhook(payload: any) {
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
          const { orderId, sender, amountToRemit, targetCurrency, amountIn, fromToken } = args;

          console.log(`[AlchemyService] Mapping Order #${orderId.toString()} | Sender: ${sender}`);

          // Identity Bridging: Link on-chain sender to Stockholm DB user
          const user = await prisma.user.findUnique({
            where: { walletAddress: sender },
          });

          // Atomic DB Upsert
          const normalizedAmountUsd = (Number(amountIn) / 1e6).toString();
          const normalizedPayoutFiat = (Number(amountToRemit) / 1e6).toString();

          // Extract indexing metadata
          const blockNumber = BigInt(event.data.block.number);
          const logIndex = Number(log.index);
          const chainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 8453); // Base default

          const result = await prisma.transaction.upsert({
            where: { orderId: orderId },
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

          // TRIGGER: Return the event data for next-step processing (e.g. Paycrest)
          return { success: true, event: decoded, transaction: result };
        }
      } catch (e) {
        continue;
      }
    }

    return { success: true, synced: syncResults.length };
  }
}
