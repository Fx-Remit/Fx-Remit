import axios from 'axios';
import type {
  AnchorConfig,
  Sep24Transaction,
  Sep24WithdrawInteractiveResponse,
  StellarCorridor,
} from './types.js';
import { fetchAnchorToml } from './anchor-toml.js';

export interface Sep24WithdrawParams {
  anchor: AnchorConfig;
  authToken: string;
  account: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  destinationAsset?: string;
  lang?: string;
}

/**
 * SEP-24: Hosted interactive deposit and withdrawal.
 */
export class Sep24Client {
  async getTransferServer(anchor: AnchorConfig): Promise<string> {
    const toml = await fetchAnchorToml(anchor.homeDomain);
    if (!toml.transferServerSep24) {
      throw new Error(`Anchor ${anchor.id} has no SEP-24 transfer server in stellar.toml`);
    }
    return toml.transferServerSep24.replace(/\/$/, '');
  }

  async getInfo(transferServer: string): Promise<Record<string, unknown>> {
    const { data } = await axios.get(`${transferServer}/info`, { timeout: 15_000 });
    return data;
  }

  /**
   * Start an interactive withdraw (cash-out). Returns hosted URL for KYC / bank details.
   */
  async startWithdrawInteractive(
    params: Sep24WithdrawParams,
  ): Promise<Sep24WithdrawInteractiveResponse> {
    const transferServer = await this.getTransferServer(params.anchor);
    const body: Record<string, string> = {
      asset_code: params.assetCode,
      asset_issuer: params.assetIssuer,
      account: params.account,
      amount: params.amount,
    };

    if (params.destinationAsset) {
      body.destination_asset = params.destinationAsset;
    }
    if (params.lang) {
      body.lang = params.lang;
    }

    const { data } = await axios.post<Sep24WithdrawInteractiveResponse>(
      `${transferServer}/transactions/withdraw/interactive`,
      body,
      {
        timeout: 30_000,
        headers: {
          Authorization: `Bearer ${params.authToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!data.id || !data.url) {
      throw new Error('SEP-24 withdraw response missing id or url');
    }

    return data;
  }

  async getTransaction(
    transferServer: string,
    authToken: string,
    transactionId: string,
  ): Promise<Sep24Transaction> {
    const { data } = await axios.get<Sep24Transaction>(
      `${transferServer}/transaction`,
      {
        timeout: 15_000,
        params: { id: transactionId },
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    return data;
  }

  /** Map corridor to off-chain asset hint for withdraw body */
  corridorToDestinationAsset(corridor: StellarCorridor): string {
    return corridor;
  }
}
