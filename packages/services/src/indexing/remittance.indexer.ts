import { prisma, Prisma } from '@fx-remit/database';
import { decodeEventLog } from 'viem';
import routerAbi from '../abi/FXRemitRouter.json';

/**
 * RemittanceIndexer — only RemittanceInitiated (router / cash-out path).
 * Deposit detection lives in DepositService / DepositIndexer.
 */
export class RemittanceIndexer {
  static async handleAlchemyLogs(payload: {
    event?: {
      data?: {
        block?: {
          number?: string | number;
          logs?: Array<{
            data: `0x${string}`;
            topics: [] | [`0x${string}`, ...`0x${string}`[]];
            index?: number;
            transactionHash?: string;
          }>;
        };
      };
    };
  }) {
    const block = payload.event?.data?.block;
    if (!block?.logs?.length) {
      return { success: true as const, message: 'No event data', synced: 0 };
    }

    const logs = block.logs;
    let synced = 0;

    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: routerAbi,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName !== 'RemittanceInitiated') continue;

        const args = decoded.args as any;
        const { orderId, sender, amountToRemit, amountIn, fromToken } = args;

        console.log(
          `[RemittanceIndexer] Order #${orderId.toString()} | Sender: ${sender}`,
        );

        const user = await prisma.user.findUnique({
          where: { walletAddress: sender },
        });

        const normalizedAmountUsd = new Prisma.Decimal(amountIn.toString()).div(1_000_000);
        const normalizedPayoutFiat = new Prisma.Decimal(
          amountToRemit.toString(),
        ).div(1_000_000);

        const blockNumber = BigInt(block.number as string | number);
        const logIndex = Number(log.index ?? 0);
        const chainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 8453);

        const result = await prisma.transaction.upsert({
          where: {
            orderId_chainId: {
              orderId,
              chainId,
            },
          },
          update: {
            status: 'VERIFIED',
            txHash: log.transactionHash,
            blockNumber,
            updatedAt: new Date(),
          },
          create: {
            orderId,
            userId: user?.id || 'SYSTEM_ORPHAN',
            txHash: log.transactionHash || `unknown-${orderId}-${chainId}`,
            chainId,
            blockNumber,
            logIndex,
            sourceToken: fromToken,
            amountUsd: normalizedAmountUsd,
            payoutFiat: normalizedPayoutFiat,
            status: 'VERIFIED',
            recipientName: 'Processing',
            type: 'REMITTANCE',
            createdAt: new Date(),
          },
        });

        synced += 1;
        return {
          success: true as const,
          event: decoded,
          transaction: result,
          synced,
        };
      } catch {
        continue;
      }
    }

    return { success: true as const, synced };
  }
}
