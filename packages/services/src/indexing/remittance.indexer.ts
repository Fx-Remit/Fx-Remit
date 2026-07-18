import { decodeEventLog } from 'viem';
import routerAbi from '../abi/FXRemitRouter.json';
import { TransactionService } from '../transaction.service';
import {
  alchemyNetworkToChainId,
  tokenDecimals,
  DEPOSIT_TOKENS,
} from '../deposit.tokens';
import { prisma, Prisma } from '@fx-remit/database';

const ROUTER_CHAIN_ID: Record<string, number> = {
  '0x767b35703c98f63e71ab61d68a406931addb3feb': 42220, // Celo
  '0x785a7a71642b68a87debeedbf2151c51501fe408': 8453, // Base
};

export type RawRemittanceLog = {
  address?: string;
  data?: string;
  topics?: string | string[];
  block_number?: string | number;
  blockNumber?: string | number;
  log_index?: string | number;
  logIndex?: string | number;
  index?: string | number;
  transaction_hash?: string;
  transactionHash?: string;
  chain_id?: string | number;
  chainId?: string | number;
};

/**
 * RemittanceIndexer — only RemittanceInitiated (router / cash-out path).
 * Deposit detection lives in DepositService / DepositIndexer.
 */
export class RemittanceIndexer {
  static async handleAlchemyLogs(payload: {
    event?: {
      network?: string;
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

    const networkChainId = alchemyNetworkToChainId(payload.event?.network);
    let synced = 0;
    const errors: string[] = [];

    for (const log of block.logs) {
      try {
        const result = await this.processRawLog({
          data: log.data,
          topics: log.topics,
          block_number: block.number,
          log_index: log.index,
          transaction_hash: log.transactionHash,
          chain_id: networkChainId ?? undefined,
        });
        if (result) synced += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'log-error');
      }
    }

    return { success: true as const, synced, errors: errors.slice(0, 10) };
  }

  /**
   * Goldsky Mirror raw_logs webhook rows (single or batch).
   */
  static async handleGoldskyRawLogs(rows: RawRemittanceLog[]) {
    let synced = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const result = await this.processRawLog(row);
        if (result) synced += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'log-error');
      }
    }

    return { success: true as const, synced, errors: errors.slice(0, 10) };
  }

  private static normalizeTopics(
    topics: string | string[] | undefined,
  ): [] | [`0x${string}`, ...`0x${string}`[]] {
    if (!topics) return [];
    if (Array.isArray(topics)) {
      return topics as [] | [`0x${string}`, ...`0x${string}`[]];
    }
    // Goldsky sometimes serializes topics as a comma/space joined string
    const parts = topics
      .replace(/^\{|\}$/g, '')
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean) as `0x${string}`[];
    return parts as [] | [`0x${string}`, ...`0x${string}`[]];
  }

  private static async processRawLog(log: RawRemittanceLog): Promise<boolean> {
    const data = log.data as `0x${string}` | undefined;
    const topics = this.normalizeTopics(log.topics);
    if (!data || !topics.length) return false;

    const decoded = decodeEventLog({
      abi: routerAbi,
      data,
      topics,
    });

    if (decoded.eventName !== 'RemittanceInitiated') return false;

    const args = decoded.args as any;
    const {
      orderId,
      sender,
      amountToRemit,
      amountIn,
      fromToken,
      toToken,
      chainId: eventChainId,
    } = args;

    const router = (log.address || '').toLowerCase();
    const chainId = Number(
      eventChainId ??
        log.chain_id ??
        log.chainId ??
        ROUTER_CHAIN_ID[router] ??
        process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ??
        8453,
    );

    const senderAddress = String(sender);
    const user = await prisma.user.findFirst({
      where: {
        walletAddress: { equals: senderAddress, mode: 'insensitive' },
      },
    });

    if (!user) {
      console.warn(
        `[RemittanceIndexer] No user for sender ${senderAddress} — skipping (no SYSTEM_ORPHAN)`,
      );
      return false;
    }

    const outToken = String(toToken || fromToken || '');
    const outDecimals = tokenDecimals(outToken, chainId);
    const rawOut = amountToRemit ?? amountIn;
    const amountUsd = new Prisma.Decimal(rawOut.toString())
      .div(10 ** outDecimals)
      .toString();

    const fromAddr = String(fromToken || '').toLowerCase();
    const listed = DEPOSIT_TOKENS[chainId]?.find(
      (t) => t.address.toLowerCase() === fromAddr,
    );
    const sourceToken =
      listed?.symbol ||
      (fromAddr === '0x0000000000000000000000000000000000000000'
        ? chainId === 42220
          ? 'CELO'
          : 'ETH'
        : String(fromToken));

    const blockNumber = log.block_number ?? log.blockNumber ?? 0;
    const logIndex = Number(log.log_index ?? log.logIndex ?? log.index ?? 0);
    const txHash =
      log.transaction_hash ||
      log.transactionHash ||
      `unknown-${orderId}-${chainId}`;

    console.log(
      `[RemittanceIndexer] Order #${orderId.toString()} | chain=${chainId} | Sender: ${senderAddress}`,
    );

    await TransactionService.updateFromIndexer({
      orderId: BigInt(orderId.toString()),
      txHash,
      chainId,
      blockNumber: BigInt(blockNumber),
      logIndex,
      sender: senderAddress,
      fromToken: sourceToken,
      amountUsd,
    });

    return true;
  }
}
