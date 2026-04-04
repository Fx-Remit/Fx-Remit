import axios, { AxiosInstance } from "axios";

export interface PaycrestRate {
  source_currency: string;
  destination_currency: string;
  rate: number;
  fixed_fee: number;
  variable_fee: number;
}

export interface VerifyAccountParams {
  account_number: string;
  bank_code: string;
  country_code: string;
}

export interface PaycrestOrderResult {
  order_id: string;
  payment_link: string;
  status: string;
  receive_address?: string; // For Onramp/Gateway flows
}

export class PaycrestClient {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    const baseURL = "https://api.paycrest.io/v2";

    this.client = axios.create({
      baseURL,
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
   * Pattern: /rates/{token}/{amount}/{fiat}
   */
  public async getRate(
    sourceCurrency: string,
    amount: string,
    destinationCurrency: string,
  ): Promise<PaycrestRate> {
    try {
      const response = await this.client.get(
        `/rates/${sourceCurrency}/${amount}/${destinationCurrency}`,
      );
      return {
        source_currency: sourceCurrency,
        destination_currency: destinationCurrency,
        rate: response.data.rate || response.data.data?.rate,
        fixed_fee: response.data.fixed_fee || 0,
        variable_fee: response.data.variable_fee || 0,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Verifies a bank account or mobile wallet.
   */
  public async verifyAccount(params: any) {
    try {
      const response = await this.client.post("/verify-account", params);
      return response.data;
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
   * Creates a payment order .
   */
  public async createOrder(orderData: any): Promise<PaycrestOrderResult> {
    try {
      const response = await this.client.post("/sender/orders", orderData);
      return response.data.data || response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Fetches an order's status by its ID.
   */
  public async getOrder(orderId: string): Promise<any> {
    try {
      const response = await this.client.get(`/sender/orders/${orderId}`);
      return response.data.data || response.data;
    } catch (error) {
      this.handleError(error);
    }
  }
}
