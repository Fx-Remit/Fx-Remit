import { TransactionService } from './transaction.service';
import { prisma } from '@fx-remit/database';
import {
  DEPOSIT_TOKENS,
  DEPOSIT_CHAIN_IDS,
  type DepositToken,
} from './deposit.tokens';

export type { DepositToken };
export { DEPOSIT_TOKENS, DEPOSIT_CHAIN_IDS };

const ALCHEMY_NETWORK: Record<number, string> = {
  8453: 'base-mainnet',
  42220: 'celo-mainnet',
};

type AlchemyTransfer = {
  hash: string;
  blockNum: string;
  uniqueId?: string;
  to?: string | null;
  from?: string | null;
  value?: number | null;
  asset?: string | null;
  category?: string;
  rawContract?: {
    address?: string | null;
    value?: string | null;
    decimal?: string | null;
  };
  metadata?: { blockTimestamp?: string };
};

export class DepositService {
  static getAllowlist(chainId: number): DepositToken[] {
    return DEPOSIT_TOKENS[chainId] ?? [];
  }

  static findToken(chainId: number, contractAddress: string): DepositToken | undefined {
    const addr = contractAddress.toLowerCase();
    return this.getAllowlist(chainId).find((t) => t.address.toLowerCase() === addr);
  }

  private static alchemyRpcUrl(chainId: number): string {
    const key =
      process.env.ALCHEMY_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_ALCHEMY_API_KEY?.trim();
    if (!key) {
      throw new Error('Missing ALCHEMY_API_KEY / NEXT_PUBLIC_ALCHEMY_API_KEY');
    }
    const network = ALCHEMY_NETWORK[chainId];
    if (!network) {
      throw new Error(`Unsupported chainId for deposits: ${chainId}`);
    }
    return `https://${network}.g.alchemy.com/v2/${key}`;
  }

  /**
   * Pull recent ERC-20 transfers TO the wallet via Alchemy and credit allowlisted deposits.
   * Idempotent on txHash via TransactionService.creditInboundDeposit.
   */
  static async syncWalletDeposits(params: {
    walletAddress: string;
    chainId: number;
    /** Look back this many blocks (default ~2h on Base / ~1h on Celo). */
    lookbackBlocks?: number;
  }) {
    const { walletAddress, chainId } = params;
    const allowlist = this.getAllowlist(chainId);
    if (allowlist.length === 0) {
      return { credited: 0, skipped: 0, transfers: 0 };
    }

    const lookback =
      params.lookbackBlocks ??
      (chainId === 8453 ? 3_600 : 1_800); // ~2h Base / ~1h Celo at ~2s

    const rpcUrl = this.alchemyRpcUrl(chainId);

    const blockHex = await this.rpc<string>(rpcUrl, 'eth_blockNumber', []);
    const latest = BigInt(blockHex);
    const fromBlock = latest > BigInt(lookback) ? latest - BigInt(lookback) : 0n;

    const result = await this.rpc<{ transfers: AlchemyTransfer[] }>(
      rpcUrl,
      'alchemy_getAssetTransfers',
      [
        {
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: 'latest',
          toAddress: walletAddress,
          category: ['erc20'],
          contractAddresses: allowlist.map((t) => t.address),
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: '0x28',
          order: 'desc',
        },
      ],
    );

    const transfers = result?.transfers ?? [];
    let credited = 0;
    let skipped = 0;

    for (const transfer of transfers) {
      const outcome = await this.creditTransfer({
        chainId,
        walletAddress,
        transfer,
      });
      if (outcome === 'credited') credited += 1;
      else skipped += 1;
    }

    return { credited, skipped, transfers: transfers.length };
  }

  /**
   * Handle Alchemy ADDRESS_ACTIVITY webhook activities.
   */
  static async handleAlchemyActivity(params: {
    network?: string;
    activity: Array<{
      fromAddress?: string;
      toAddress?: string;
      hash?: string;
      blockNum?: string;
      value?: number;
      asset?: string;
      category?: string;
      log?: { index?: number | string; logIndex?: number | string };
      rawContract?: {
        address?: string;
        rawValue?: string;
        decimals?: number;
      };
    }>;
  }) {
    const chainId = this.networkToChainId(params.network);
    if (!chainId) {
      return { credited: 0, skipped: 0, message: `Unsupported network ${params.network}` };
    }

    let credited = 0;
    let skipped = 0;

    for (const item of params.activity ?? []) {
      if (!item.toAddress || !item.hash || !item.blockNum) {
        skipped += 1;
        continue;
      }
      if (item.category && item.category !== 'token' && item.category !== 'erc20') {
        skipped += 1;
        continue;
      }

      const contract = item.rawContract?.address;
      if (!contract || !this.findToken(chainId, contract)) {
        skipped += 1;
        continue;
      }

      const decimals =
        item.rawContract?.decimals ??
        this.findToken(chainId, contract)?.decimals ??
        6;

      let amountUsd = item.value;
      if (
        (amountUsd === undefined || amountUsd === null) &&
        item.rawContract?.rawValue
      ) {
        amountUsd = Number(BigInt(item.rawContract.rawValue)) / 10 ** decimals;
      }
      if (amountUsd === undefined || amountUsd === null || amountUsd <= 0) {
        skipped += 1;
        continue;
      }

      const logIndexRaw = item.log?.logIndex ?? item.log?.index ?? 0;
      const logIndex =
        typeof logIndexRaw === 'string'
          ? Number.parseInt(logIndexRaw, 16) || 0
          : Number(logIndexRaw) || 0;

      const transfer: AlchemyTransfer = {
        hash: item.hash,
        blockNum: item.blockNum,
        to: item.toAddress,
        from: item.fromAddress,
        value: amountUsd,
        asset: item.asset,
        rawContract: {
          address: contract,
          value: item.rawContract?.rawValue,
          decimal: `0x${decimals.toString(16)}`,
        },
      };

      const outcome = await this.creditTransfer({
        chainId,
        walletAddress: item.toAddress,
        transfer,
        logIndex,
      });
      if (outcome === 'credited') credited += 1;
      else skipped += 1;
    }

    return { credited, skipped };
  }

  private static networkToChainId(network?: string): number | null {
    const n = (network || '').toUpperCase();
    if (n.includes('BASE')) return 8453;
    if (n.includes('CELO')) return 42220;
    return null;
  }

  private static async creditTransfer(params: {
    chainId: number;
    walletAddress: string;
    transfer: AlchemyTransfer;
    logIndex?: number;
  }): Promise<'credited' | 'skipped'> {
    const { chainId, transfer } = params;
    const contract = transfer.rawContract?.address;
    if (!contract) return 'skipped';

    const token = this.findToken(chainId, contract);
    if (!token) return 'skipped';

    const to = transfer.to?.toLowerCase();
    if (!to || to !== params.walletAddress.toLowerCase()) return 'skipped';

    let amount = transfer.value;
    if ((amount === undefined || amount === null) && transfer.rawContract?.value) {
      const raw = BigInt(transfer.rawContract.value);
      const decimals = transfer.rawContract.decimal
        ? Number.parseInt(transfer.rawContract.decimal, 16)
        : token.decimals;
      amount = Number(raw) / 10 ** decimals;
    }
    if (amount === undefined || amount === null || !Number.isFinite(amount) || amount <= 0) {
      return 'skipped';
    }

    // Ignore dust under $0.01
    if (amount < 0.01) return 'skipped';

    const blockNumber = BigInt(transfer.blockNum);
    // Derive stable log index from Alchemy uniqueId when present (…:log:N)
    let logIndex = params.logIndex ?? 0;
    if (params.logIndex === undefined && transfer.uniqueId?.includes(':log:')) {
      const part = transfer.uniqueId.split(':log:')[1];
      const parsed = Number.parseInt(part, 10);
      if (!Number.isNaN(parsed)) logIndex = parsed;
    }

    const result = await TransactionService.creditInboundDeposit({
      walletAddress: params.walletAddress,
      txHash: transfer.hash,
      chainId,
      blockNumber,
      logIndex,
      sourceToken: token.symbol,
      amountUsd: amount.toFixed(6),
      status: 'COMPLETED',
    });

    return result.created ? 'credited' : 'skipped';
  }

  /**
   * Live allowlisted stable balances across Base + Celo (1:1 USD).
   * Used for home display; DB wallet_balance remains the spendable ledger.
   */
  static async getLiveBalances(walletAddress: string) {
    const perChain: Array<{
      chainId: number;
      tokens: Array<{ symbol: string; balanceUsd: number }>;
      totalUsd: number;
    }> = [];

    let totalUsd = 0;

    for (const chainId of DEPOSIT_CHAIN_IDS) {
      const allowlist = this.getAllowlist(chainId);
      const rpcUrl = this.alchemyRpcUrl(chainId);
      const tokens: Array<{ symbol: string; balanceUsd: number }> = [];
      let chainTotal = 0;

      for (const token of allowlist) {
        try {
          const result = await this.rpc<{
            tokenBalances: Array<{ contractAddress: string; tokenBalance: string | null }>;
          }>(rpcUrl, 'alchemy_getTokenBalances', [
            walletAddress,
            [token.address],
          ]);

          const raw = result?.tokenBalances?.[0]?.tokenBalance;
          if (!raw || raw === '0x') continue;
          const amount = Number(BigInt(raw)) / 10 ** token.decimals;
          if (!Number.isFinite(amount) || amount < 0.000001) continue;
          tokens.push({ symbol: token.symbol, balanceUsd: amount });
          chainTotal += amount;
        } catch (err) {
          console.warn(`[DepositService] balance read failed ${chainId} ${token.symbol}`, err);
        }
      }

      perChain.push({ chainId, tokens, totalUsd: chainTotal });
      totalUsd += chainTotal;
    }

    return {
      walletAddress,
      totalUsd,
      perChain,
    };
  }

  /**
   * Cron: re-scan recent inbound transfers for all users with wallets.
   */
  static async reconcileAllWallets(params?: { limit?: number }) {
    const users = await prisma.user.findMany({
      where: { walletAddress: { not: null } },
      select: { id: true, walletAddress: true },
      take: params?.limit ?? 200,
      orderBy: { updatedAt: 'desc' },
    });

    let credited = 0;
    let scanned = 0;
    const errors: string[] = [];

    for (const user of users) {
      if (!user.walletAddress) continue;
      for (const chainId of DEPOSIT_CHAIN_IDS) {
        try {
          const result = await this.syncWalletDeposits({
            walletAddress: user.walletAddress,
            chainId,
            lookbackBlocks: chainId === 8453 ? 12_000 : 6_000, // ~6h / ~3h
          });
          credited += result.credited;
          scanned += 1;
        } catch (err) {
          errors.push(
            `${user.id}:${chainId}:${err instanceof Error ? err.message : 'error'}`,
          );
        }
      }
    }

    return { users: users.length, scanned, credited, errors: errors.slice(0, 20) };
  }

  private static async rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) {
      throw new Error(`Alchemy RPC HTTP ${res.status}`);
    }
    const json = (await res.json()) as { result?: T; error?: { message?: string } };
    if (json.error) {
      throw new Error(json.error.message || 'Alchemy RPC error');
    }
    return json.result as T;
  }
}
