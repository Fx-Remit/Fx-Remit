export type StellarCorridor = 'NGN' | 'KES';

export type StellarNetwork = 'public' | 'testnet';

export interface StellarTomlEndpoints {
  webAuthEndpoint?: string;
  transferServerSep24?: string;
  transferServerSep6?: string;
  kycServerUrl?: string;
  sep38QuoteServer?: string;
}

export interface AnchorConfig {
  id: string;
  name: string;
  homeDomain: string;
  corridors: StellarCorridor[];
  /** Stellar asset code for USDC on this anchor's network */
  usdcAssetCode: string;
  /** Circle USDC issuer (mainnet) — override per anchor in sandbox */
  usdcIssuer: string;
  priority: number;
  methods: Array<'bank' | 'mobile_money' | 'cash_pickup'>;
}

export interface Sep10ChallengeResponse {
  transaction: string;
  network_passphrase: string;
}

export interface Sep10TokenResponse {
  token: string;
}

export interface Sep38Price {
  id?: string;
  sell_asset: string;
  buy_asset: string;
  price: string;
  total_price?: string;
  expires_at?: string;
  sell_amount?: string;
  buy_amount?: string;
}

/** Single-pair SEP-38 GET /price response */
export interface Sep38IndicativePrice {
  price: string;
  total_price?: string;
  sell_amount?: string;
  buy_amount?: string;
  expires_at?: string;
}

export interface StellarWholesaleQuote {
  source_currency: string;
  /** Actual fiat quoted by the anchor (may be USD on SDF testanchor). */
  destination_currency: string;
  /** Product corridor requested by FX Remit (NGN | KES). */
  corridor: StellarCorridor;
  /** Fiat units per 1 USDC (destination per source). */
  rate: number;
  anchor_id: string;
  wholesale_price: string;
  expires_at?: string;
  /** When set, anchor quoted this fiat instead of the product corridor (testnet demo). */
  demo_fiat?: string;
  demo_note?: string;
}

export interface Sep24WithdrawInteractiveResponse {
  id: string;
  url: string;
  type: string;
}

export interface Sep24Transaction {
  id: string;
  status: string;
  status_eta?: number;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  started_at?: string;
  completed_at?: string;
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: string;
}
