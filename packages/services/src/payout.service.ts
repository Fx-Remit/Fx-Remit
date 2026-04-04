import { prisma } from '@fx-remit/database';
import { PaycrestClient } from './paycrest.client';

export class PayoutService {
  private static API_KEY = process.env.NEXT_PUBLIC_PAYCREST_API_KEY!;

  private static client = new PaycrestClient(this.API_KEY);

  /**
   * Refined execution of a Paycrest Order (v2).
   * This handles creating the order via the API for direct transfer flows.
   */
  static async createPaycrestOrder(params: {
    amount: string;
    sourceAsset: string;
    destinationAsset: string;
    recipient: any;
    externalId?: string;
  }) {
    console.log(`[PayoutService] Creating Paycrest Order: ${params.amount} ${params.sourceAsset} -> ${params.destinationAsset}`);

    try {
      const order = await this.client.createOrder({
        source: {
          asset: params.sourceAsset,
          amount: params.amount,
          type: 5, // Crypto
        },
        destination: {
          asset: params.destinationAsset,
          type: 3, // Local Bank
          recipient: params.recipient.account_number,
          meta: {
            beneficiary_name: params.recipient.beneficiary_name,
            bank_code: params.recipient.bank_code,
          },
        },
        external_id: params.externalId,
      });

      // If we have an external ID, update the transaction record
      if (params.externalId) {
        await prisma.transaction.updateMany({
          where: { externalId: params.externalId },
          data: {
            status: 'PROCESSING',
            updatedAt: new Date(),
          },
        });
      }

      return { success: true, order };
    } catch (error: any) {
      console.error('[PayoutService] Paycrest Order Error:', error.message);
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
  static async fetchRate(source: string, destination: string, amount: string = '1') {
    try {
      const rate = await this.client.getRate(source, amount, destination);
      return { success: true, rate };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message,
        status: error.status || 500
      };
    }
  }
}
