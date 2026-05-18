import axios, { AxiosInstance } from "axios";

export interface PaycrestRate {
  source_currency: string;
  destination_currency: string;
  rate: number;
  fixed_fee: number;
  variable_fee: number;
}

export interface VerifyAccountParams {
  Institution: string;
  AccountIdentifier: string;
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
    try {
      const response = await this.client.get(
        `/rates/${network.toLowerCase()}/${sourceCurrency}/${amount}/${destinationCurrency}`,
      );
      
      const rawRate = response.data.data?.sell?.rate || 
                      response.data.data?.rate || 
                      response.data.rate || 
                      response.data.data?.buy?.rate;
                      
      if (!rawRate) {
        throw new Error("Invalid response format from Paycrest rates API");
      }

      return {
        source_currency: sourceCurrency,
        destination_currency: destinationCurrency,
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
    try {
      const response = await this.client.get(`/institutions/${countryCode}`);
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
      // Paycrest v2 requires PascalCase field names
      const response = await this.client.post("/verify-account", {
        Institution: params.Institution,
        AccountIdentifier: params.AccountIdentifier,
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
   * Creates a payment order (Paycrest v2 - PascalCase required).
   */
  public async createOrder(orderData: any): Promise<PaycrestOrderResult> {
    try {
      // Paycrest v2 requires all field names in PascalCase
      const payload = {
        Amount: orderData.amount,
        Source: {
          Type: orderData.source?.type,
          Currency: orderData.source?.currency,
          Network: orderData.source?.network,
          RefundAddress: orderData.source?.refundAddress,
        },
        Destination: {
          Type: orderData.destination?.type,
          Currency: orderData.destination?.currency,
          Recipient: {
            Institution: orderData.destination?.recipient?.institution,
            AccountIdentifier: orderData.destination?.recipient?.accountIdentifier,
            AccountName: orderData.destination?.recipient?.accountName,
            Memo: orderData.destination?.recipient?.memo,
          },
        },
        Reference: orderData.reference,
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
    try {
      const response = await this.client.get(`/sender/orders/${orderId}`);
      return response.data.data || response.data;
    } catch (error) {
      this.handleError(error);
    }
  }
}
