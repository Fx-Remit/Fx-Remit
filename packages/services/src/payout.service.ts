import { prisma } from '@fx-remit/database';
import { PaycrestClient } from './paycrest.client';

export class PayoutService {
  private static API_KEY = process.env.PAYCREST_API_KEY || process.env.NEXT_PUBLIC_PAYCREST_API_KEY!;

  private static client = new PaycrestClient(this.API_KEY);

  /**
   * Refined execution of a Paycrest Order (v2).
   * This handles creating the order via the API for direct transfer flows.
   */
  static async createPaycrestOrder(params: {
    amount: string;
    sourceToken: string;
    destinationCurrency: string;
    recipient: {
      institution: string;
      accountIdentifier: string;
      accountName: string;
      memo?: string;
    };
    refundAddress: string;
    externalId?: string;
  }) {
    console.log(`[PayoutService] Creating Paycrest Order: ${params.amount} ${params.sourceToken} -> ${params.destinationCurrency}`);

    try {
      const order = await this.client.createOrder({
        amount: params.amount,
        source: {
          type: "crypto",
          currency: params.sourceToken,
          network: "celo", // Defaulting to Celo for now as per project focus
          refundAddress: params.refundAddress,
        },
        destination: {
          type: "fiat",
          currency: params.destinationCurrency,
          recipient: {
            institution: params.recipient.institution,
            accountIdentifier: params.recipient.accountIdentifier,
            accountName: params.recipient.accountName,
            memo: params.recipient.memo || "FX Remit Cash Out",
          },
        },
        reference: params.externalId,
      });

      // If we have an external ID, update the transaction record
      if (params.externalId) {
        await prisma.transaction.updateMany({
          where: { externalId: params.externalId },
          data: {
            status: "PROCESSING",
            updatedAt: new Date(),
          },
        });
      }

      return { success: true, order };
    } catch (error: any) {
      console.error("[PayoutService] Paycrest Order Error:", error.message);
      return { 
        success: false, 
        error: error.message,
        status: error.status || 500
      };
    }
  }

  /**
   * Verified account details before payment.
   */
  static async verifyBeneficiary(accountNumber: string, bankCode: string, countryCode: string) {
    try {
      const verification = await this.client.verifyAccount({
        account_number: accountNumber,
        bank_code: bankCode,
        country_code: countryCode,
      });
      return { success: true, data: verification };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message,
        status: error.status || 500
      };
    }
  }

  /**
   * Fetches latest rates for the UI/quoting.
   */
  static async fetchRate(network: string, source: string, destination: string, amount: string = '1') {
    try {
      const rate = await this.client.getRate(network, source, amount, destination);
      return { success: true, rate };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message,
        status: error.status || 500
      };
    }
  }

  /**
   * Fetches supported institutions for a country.
   */
  static async getInstitutions(countryCode: string) {
    try {
      const institutions = await this.client.getInstitutions(countryCode);
      return { success: true, data: institutions };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message,
        status: error.status || 500
      };
    }
  }
}
