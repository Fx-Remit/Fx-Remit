import axios from 'axios';
import type {
  AnchorConfig,
  Sep38IndicativePrice,
  Sep38Price,
  StellarWholesaleQuote,
  StellarCorridor,
} from '../types/types.js';
import { fetchAnchorToml } from '../config/anchor-toml.js';
import { TEST_ANCHOR } from '../config/anchors.config.js';

export interface Sep38QuoteParams {
  anchor: AnchorConfig;
  sellAmount: string;
  destinationFiat: StellarCorridor;
  authToken?: string;
}

export interface Sep38BuyAssetResolution {
  /** ISO code used for matching / display (e.g. USD, NGN) */
  buyAssetCode: string;
  /** Full SEP-38 asset string (e.g. iso4217:USD) */
  buyAsset: string;
  isDemoFiat: boolean;
  demoNote?: string;
}

/**
 * SDF testanchor only supports USD/CAD off-chain — map product corridors to USD for sandbox quotes.
 */
export function resolveSep38BuyAsset(
  anchor: AnchorConfig,
  corridor: StellarCorridor,
): Sep38BuyAssetResolution {
  const isTestAnchor =
    anchor.id === TEST_ANCHOR.id || anchor.homeDomain === TEST_ANCHOR.homeDomain;

  if (isTestAnchor) {
    return {
      buyAssetCode: 'USD',
      buyAsset: 'iso4217:USD',
      isDemoFiat: true,
      demoNote:
        'SDF testanchor only supports USD/CAD; product corridor is demoted to a USD stand-in rate (not NGN/KES).',
    };
  }

  return {
    buyAssetCode: corridor,
    buyAsset: `iso4217:${corridor}`,
    isDemoFiat: false,
  };
}

/**
 * Exact buy-asset match — avoids `USD` matching `USDT` / `USDC` via substring.
 */
export function buyAssetMatchesCode(
  buyAsset: string | undefined,
  buyAssetCode: string,
): boolean {
  if (!buyAsset) return false;
  const asset = buyAsset.trim().toUpperCase();
  const code = buyAssetCode.trim().toUpperCase();
  if (!code) return false;
  if (asset === code) return true;
  if (asset === `ISO4217:${code}`) return true;
  const parts = asset.split(':');
  return parts.length === 2 && parts[0] === 'ISO4217' && parts[1] === code;
}

/**
 * Convert SEP-38 indicative /price into fiat-per-USDC.
 * Spec `price` is sell_asset per 1 buy_asset; prefer buy_amount/sell_amount when present.
 */
export function indicativeRateToFiatPerUsdc(data: Sep38IndicativePrice): number {
  const sellAmt = data.sell_amount !== undefined ? Number(data.sell_amount) : NaN;
  const buyAmt = data.buy_amount !== undefined ? Number(data.buy_amount) : NaN;
  if (Number.isFinite(sellAmt) && sellAmt > 0 && Number.isFinite(buyAmt) && buyAmt > 0) {
    return buyAmt / sellAmt;
  }

  const sellPerBuy = Number(data.price);
  if (!Number.isFinite(sellPerBuy) || sellPerBuy <= 0) {
    throw new Error('Invalid SEP-38 indicative price');
  }
  return 1 / sellPerBuy;
}

/**
 * Rate from a GET /prices row for production-style corridor quotes.
 * Prefer amount fields (SEP-38); otherwise treat `price` as fiat-per-USDC (NGN/KES convention).
 */
export function listPriceToFiatPerUsdc(row: Sep38Price): number {
  if (row.sell_amount !== undefined && row.buy_amount !== undefined) {
    return indicativeRateToFiatPerUsdc(row);
  }
  const rate = Number(row.price);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid SEP-38 list price');
  }
  return rate;
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

  async fetchPrices(
    quoteServer: string,
    sellAsset: string,
    sellAmount = '1',
    authToken?: string,
  ): Promise<Sep38Price[]> {
    const url = new URL(`${quoteServer}/prices`);
    url.searchParams.set('sell_asset', sellAsset);
    url.searchParams.set('sell_amount', sellAmount);

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
   * GET /price — required by SDF testanchor (context + sell_amount + buy_asset).
   * Tries sep6 then sep31 contexts.
   */
  async fetchIndicativePrice(
    quoteServer: string,
    sellAsset: string,
    buyAsset: string,
    sellAmount: string,
    authToken?: string,
  ): Promise<Sep38IndicativePrice> {
    const contexts = ['sep6', 'sep31'] as const;
    let lastError: unknown;

    for (const context of contexts) {
      const url = new URL(`${quoteServer}/price`);
      url.searchParams.set('context', context);
      url.searchParams.set('sell_asset', sellAsset);
      url.searchParams.set('buy_asset', buyAsset);
      url.searchParams.set('sell_amount', sellAmount);

      try {
        const { data } = await axios.get<Sep38IndicativePrice>(url.toString(), {
          timeout: 15_000,
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        });

        if (data?.price) {
          return data;
        }
      } catch (err) {
        lastError = err;
      }
    }

    const detail =
      lastError instanceof Error ? lastError.message : 'no successful /price response';
    throw new Error(`SEP-38 /price failed for ${sellAsset} → ${buyAsset}: ${detail}`);
  }

  private findPriceForBuyAsset(prices: Sep38Price[], buyAssetCode: string): Sep38Price | undefined {
    return prices.find((p) => buyAssetMatchesCode(p.buy_asset, buyAssetCode));
  }

  /**
   * Resolves a wholesale unit rate (fiat per 1 USDC) for a corridor.
   * Production anchors: GET /prices (corridor fiat). SDF testanchor: skip /prices and use
   * GET /price with USD stand-in so rates always go through indicativeRateToFiatPerUsdc.
   */
  async getWholesaleQuote(params: Sep38QuoteParams): Promise<StellarWholesaleQuote> {
    const { anchor, destinationFiat, authToken, sellAmount } = params;
    const quoteServer = await this.getQuoteServer(anchor);
    const sellAsset = `stellar:${anchor.usdcAssetCode}:${anchor.usdcIssuer}`;
    const buy = resolveSep38BuyAsset(anchor, destinationFiat);

    // Demo/testanchor: /prices is unreliable and would use a different rate convention than /price.
    if (!buy.isDemoFiat) {
      let prices: Sep38Price[] = [];
      try {
        prices = await this.fetchPrices(quoteServer, sellAsset, sellAmount, authToken);
      } catch {
        prices = [];
      }

      const match = this.findPriceForBuyAsset(prices, buy.buyAssetCode);
      if (match?.price) {
        const rate = listPriceToFiatPerUsdc(match);
        return {
          source_currency: anchor.usdcAssetCode,
          destination_currency: buy.buyAssetCode,
          corridor: destinationFiat,
          rate,
          anchor_id: anchor.id,
          wholesale_price: String(rate),
          expires_at: match.expires_at,
        };
      }
    }

    const indicative = await this.fetchIndicativePrice(
      quoteServer,
      sellAsset,
      buy.buyAsset,
      sellAmount,
      authToken,
    );
    const rate = indicativeRateToFiatPerUsdc(indicative);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Invalid SEP-38 price from anchor ${anchor.id}`);
    }

    return {
      source_currency: anchor.usdcAssetCode,
      destination_currency: buy.buyAssetCode,
      corridor: destinationFiat,
      rate,
      anchor_id: anchor.id,
      wholesale_price: String(rate),
      expires_at: indicative.expires_at,
      ...(buy.isDemoFiat
        ? { demo_fiat: buy.buyAssetCode, demo_note: buy.demoNote }
        : {}),
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
