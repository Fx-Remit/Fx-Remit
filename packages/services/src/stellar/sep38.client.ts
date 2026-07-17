import axios from 'axios';
import type { AnchorConfig, Sep38Price, StellarWholesaleQuote, StellarCorridor } from './types.js';
import { fetchAnchorToml } from './anchor-toml.js';

export interface Sep38QuoteParams {
  anchor: AnchorConfig;
  sellAmount: string;
  destinationFiat: StellarCorridor;
  authToken?: string;
}

/**
 * SEP-38: Request-for-quote between Stellar assets and off-chain fiat.
 */
export class Sep38Client {
  async getQuoteServer(anchor: AnchorConfig): Promise<string> {
    const toml = await fetchAnchorToml(anchor.homeDomain);
    if (!toml.sep38QuoteServer) {
      throw new Error(`Anchor ${anchor.id} has no SEP-38 quote server in stellar.toml`);
    }
    return toml.sep38QuoteServer.replace(/\/$/, '');
  }

  async fetchPrices(quoteServer: string, sellAsset: string, authToken?: string): Promise<Sep38Price[]> {
    const url = new URL(`${quoteServer}/prices`);
    url.searchParams.set('sell_asset', sellAsset);

    const { data } = await axios.get<{ price?: Sep38Price[]; prices?: Sep38Price[] }>(
      url.toString(),
      {
        timeout: 15_000,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      },
    );

    return data.prices ?? data.price ?? [];
  }

  /**
   * Resolves a wholesale unit rate (fiat per 1 USDC) for a corridor.
   * Falls back to best matching SEP-38 price row for the fiat asset code.
   */
  async getWholesaleQuote(params: Sep38QuoteParams): Promise<StellarWholesaleQuote> {
    const { anchor, sellAmount, destinationFiat, authToken } = params;
    const quoteServer = await this.getQuoteServer(anchor);
    const sellAsset = `stellar:${anchor.usdcAssetCode}:${anchor.usdcIssuer}`;
    const prices = await this.fetchPrices(quoteServer, sellAsset, authToken);

    const buyAssetCode = destinationFiat;
    const match =
      prices.find((p) => p.buy_asset?.toUpperCase().includes(buyAssetCode)) ??
      prices.find((p) => p.buy_asset?.toLowerCase().includes(destinationFiat.toLowerCase()));

    if (!match?.price) {
      throw new Error(
        `No SEP-38 price for ${sellAsset} → ${destinationFiat} on anchor ${anchor.id}`,
      );
    }

    const rate = Number(match.price);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Invalid SEP-38 price from anchor ${anchor.id}`);
    }

    return {
      source_currency: anchor.usdcAssetCode,
      destination_currency: destinationFiat,
      corridor: destinationFiat,
      rate,
      anchor_id: anchor.id,
      wholesale_price: match.price,
      expires_at: match.expires_at,
    };
  }

  async getWholesaleQuoteForCorridor(
    anchor: AnchorConfig,
    corridor: StellarCorridor,
    sellAmount = '1',
    authToken?: string,
  ): Promise<StellarWholesaleQuote> {
    return this.getWholesaleQuote({
      anchor,
      sellAmount,
      destinationFiat: corridor,
      authToken,
    });
  }
}
