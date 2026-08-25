import axios, { AxiosInstance } from "axios";

export interface PaycrestRate {
  source_currency: string;
  destination_currency: string;
  rate: number;
  fixed_fee: number;
  variable_fee: number;
}

export interface VerifyAccountParams {
  institution: string;
  accountIdentifier: string;
}

export interface PaycrestOrderResult {
  id: string;
  payment_link?: string;
  status: string;
  providerAccount?: {
    receiveAddress?: string;
    validUntil?: string;
    amountToTransfer?: string;
  };
}

export interface PaycrestInstitution {
  id: string;
  name: string;
  code: string;
  type: string;
}

/**
 * Barrier against SSRF / path injection in relative axios URLs.
 * Rejects absolute URLs, traversal, and non-allowlisted characters before
 * they can alter the request host or escape `/v2/...` path segments.
 */
function sanitizePathSegment(
  value: string,
  kind: string,
  pattern: RegExp,
): string {
  const v = String(value ?? "").trim();
  if (
    !v ||
    /:\/\//.test(v) ||
    v.startsWith("//") ||
    v.includes("..") ||
    /[/\\?#@]/.test(v)
  ) {
    throw new Error(`Invalid ${kind} for Paycrest request`);
  }
  if (!pattern.test(v)) {
    throw new Error(`Invalid ${kind} for Paycrest request`);
  }
  return encodeURIComponent(v);
}

const NETWORK_SEGMENT = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const CURRENCY_SEGMENT = /^[A-Za-z]{2,10}$/;
const AMOUNT_SEGMENT = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const COUNTRY_SEGMENT = /^[A-Za-z]{2}$/;
const ORDER_ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export class PaycrestClient {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    const baseURL = "https://api.paycrest.io/v2";

    this.client = axios.create({
      baseURL,
      timeout: 10000, // 10-second timeout to prevent hangs
      headers: {
        "API-Key": apiKey,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Centralized error handler for Paycrest v2 API Error Formats
   */
  private handleError(error: any): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      // Extract human-readable message from provider error format
      let message =
        data.message || "An unexpected error occurred while processing your request";

      if (status === 503) {
        message =
          "Liquidity Provider Unavailable: No providers can handle this request right now. Try a different amount or currency.";
      } else if (status === 429) {
        message =
          "Rate limit exceeded: Please wait a moment before trying again.";
      } else if (
        data.data &&
        Array.isArray(data.data) &&
        data.data.length > 0
      ) {
        const firstError = data.data[0];
        message = `${firstError.field}: ${firstError.message}`;
      } else if (
        data.data &&
        typeof data.data === "object" &&
        !Array.isArray(data.data) &&
        (data.data as any).field
      ) {
        const fieldErr = data.data as { field: string; message: string };
        message = `${fieldErr.field}: ${fieldErr.message}`;
      } else if (data.errors && typeof data.errors === "object") {
        const entries = Object.entries(data.errors as Record<string, string>);
        if (entries.length > 0) {
          message = entries
            .map(([field, msg]) => `${field}: ${msg}`)
            .join("; ");
        }
      }

      const err = new Error(message);
      (err as any).status = status;
      (err as any).paycrestData = data;
      throw err;
    }
    throw error;
  }

  /**
   * Fetches the current exchange rate for a currency pair (v2 format).
   * Pattern: /rates/{network}/{token}/{amount}/{fiat}
   */
  public async getRate(
    network: string,
    sourceCurrency: string,
    amount: string,
    destinationCurrency: string,
  ): Promise<PaycrestRate> {
    const safeNetwork = sanitizePathSegment(
      network.toLowerCase(),
      "network",
      NETWORK_SEGMENT,
    );
    const safeSource = sanitizePathSegment(
      sourceCurrency.toUpperCase(),
      "source currency",
      CURRENCY_SEGMENT,
    );
    const safeAmount = sanitizePathSegment(amount, "amount", AMOUNT_SEGMENT);
    const safeDest = sanitizePathSegment(
      destinationCurrency.toUpperCase(),
      "destination currency",
      CURRENCY_SEGMENT,
    );

    try {
      const response = await this.client.get(
        `/rates/${safeNetwork}/${safeSource}/${safeAmount}/${safeDest}`,
      );

      const rawRate =
        response.data.data?.sell?.rate ||
        response.data.data?.rate ||
        response.data.rate ||
        response.data.data?.buy?.rate;

      if (!rawRate) {
        throw new Error("Invalid response format from Paycrest rates API");
      }

      return {
        source_currency: sourceCurrency.toUpperCase(),
        destination_currency: destinationCurrency.toUpperCase(),
        rate: Number(rawRate),
        fixed_fee: response.data.fixed_fee || 0,
        variable_fee: response.data.variable_fee || 0,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Fetches supported institutions for a country.
   */
  public async getInstitutions(countryCode: string): Promise<PaycrestInstitution[]> {
    const safeCountry = sanitizePathSegment(
      countryCode.toUpperCase(),
      "country code",
      COUNTRY_SEGMENT,
    );
    try {
      const response = await this.client.get(`/institutions/${safeCountry}`);
      return response.data.data || response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Verifies a bank account or mobile wallet.
   */
  public async verifyAccount(params: VerifyAccountParams) {
    try {
      // Paycrest v2 uses camelCase field names
      const response = await this.client.post("/verify-account", {
        institution: params.institution,
        accountIdentifier: params.accountIdentifier,
      });
      // Paycrest returns account_name as a plain string in data field
      return response.data.data || response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Fetches the Aggregator Public Key for RSA encryption (Gateway flows).
   */
  public async getAggregatorPublicKey(): Promise<string> {
    try {
      const response = await this.client.get("/pubkey");
      return response.data.public_key || response.data.data?.public_key;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Creates a payment order (Paycrest v2 — camelCase per OpenAPI).
   */
  public async createOrder(orderData: any): Promise<PaycrestOrderResult> {
    try {
      const payload = {
        amount: orderData.amount,
        source: {
          type: orderData.source?.type,
          currency: orderData.source?.currency,
          network: orderData.source?.network,
          refundAddress: orderData.source?.refundAddress,
        },
        destination: {
          type: orderData.destination?.type,
          currency: orderData.destination?.currency,
          recipient: {
            institution: orderData.destination?.recipient?.institution,
            accountIdentifier: orderData.destination?.recipient?.accountIdentifier,
            accountName: orderData.destination?.recipient?.accountName,
            memo: orderData.destination?.recipient?.memo,
          },
        },
        reference: orderData.reference,
      };
      const response = await this.client.post("/sender/orders", payload);
      return response.data.data || response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Fetches an order's status by its ID.
   */
  public async getOrder(orderId: string): Promise<any> {
    const safeOrderId = sanitizePathSegment(
      orderId,
      "order id",
      ORDER_ID_SEGMENT,
    );
    try {
      const response = await this.client.get(`/sender/orders/${safeOrderId}`);
      return response.data.data || response.data;
    } catch (error) {
      this.handleError(error);
    }
  }
}
