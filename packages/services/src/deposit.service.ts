import { TransactionService } from './transaction.service';

export type DepositToken = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

/** Allowlisted deposit assets — never credit unknown ERC-20s. */
export const DEPOSIT_TOKENS: Record<number, DepositToken[]> = {
  // Base
  8453: [
    {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
    },
    {
      address: '0xfde4C96c8593536E31F787dA9eA5d40bB7C2F4FF',
      symbol: 'USDT',
      decimals: 6,
    },
  ],
  // Celo
  42220: [
    {
      address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
      symbol: 'USDC',
      decimals: 6,
    },
    {
      address: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
      symbol: 'cUSD',
      decimals: 18,
    },
    {
      address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
      symbol: 'USDT',
      decimals: 6,
    },
  ],
};

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
