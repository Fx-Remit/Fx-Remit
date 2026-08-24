import { prisma } from '@fx-remit/database';
import { PaycrestClient } from './paycrest.client';

/**
 * Paycrest sender offramp settlement rail.
 * Providers are active on Base. Use the token enabled in the Paycrest sender dashboard
 * (Fee + Refund addresses must be set — zero addresses → "token is not configured").
 */
export const PAYCREST_SETTLEMENT = {
  network: 'base' as const,
  chainId: 8453,
  token: 'USDC' as const,
  tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  decimals: 6,
};

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
    /** Override settlement network (default: Base). */
    network?: string;
  }) {
    const requested = (params.sourceToken || '').toUpperCase();
    const settlementToken = PAYCREST_SETTLEMENT.token;
    const network = (params.network || PAYCREST_SETTLEMENT.network).toLowerCase();

    if (requested && requested !== settlementToken) {
      console.warn(
        `[PayoutService] Remapping ${requested} → ${settlementToken} on ${network} for Paycrest settlement`,
      );
    }

    console.log(
      `[PayoutService] Creating Paycrest Order: ${params.amount} ${settlementToken} (${network}) -> ${params.destinationCurrency}`,
    );

    if (!params.refundAddress) {
      return {
        success: false as const,
        error: 'Missing refund address for Paycrest order',
        status: 400,
      };
    }

    try {
      const order = await this.client.createOrder({
        amount: params.amount,
        source: {
          type: "crypto",
          currency: settlementToken,
          network,
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

      // Only advance still-open reserves. If the client abandoned (FAILED) while
      // Paycrest was in flight, do not resurrect the row to PROCESSING.
      // Link pending-{orderId} in the same write so cancel/expire can gate on
      // provider status before the route's attachPaycrestOrder call (#89).
      if (params.externalId && order?.id) {
        await prisma.transaction.updateMany({
          where: {
            externalId: params.externalId,
            status: { in: ["PENDING", "PROCESSING"] },
            txHash: { startsWith: "pending-" },
          },
          data: {
            status: "PROCESSING",
            sourceToken: settlementToken,
            txHash: `pending-${order.id}`,
            updatedAt: new Date(),
          },
        });
      } else if (params.externalId) {
        await prisma.transaction.updateMany({
          where: {
            externalId: params.externalId,
            status: { in: ["PENDING", "PROCESSING"] },
          },
          data: {
            status: "PROCESSING",
            sourceToken: settlementToken,
            updatedAt: new Date(),
          },
        });
      }

      return {
        success: true as const,
        order,
        settlement: {
          network,
          chainId: PAYCREST_SETTLEMENT.chainId,
          token: settlementToken,
          tokenAddress: PAYCREST_SETTLEMENT.tokenAddress,
          decimals: PAYCREST_SETTLEMENT.decimals,
        },
      };
    } catch (error: any) {
      console.error("[PayoutService] Paycrest Order Error:", error.message);
      if (error.paycrestData) {
        console.error(
          "[PayoutService] Paycrest Order Details:",
          JSON.stringify(error.paycrestData),
        );
      }
      return { 
        success: false as const, 
        error: error.message,
        status: error.status || 500
      };
    }
  }

  /**
   * Resume an in-flight Paycrest order (e.g. after client failed to receive create-pending JSON).
   */
  static async getSettlementOrder(paycrestOrderId: string) {
    try {
      const order = await this.client.getOrder(paycrestOrderId);
      if (!order?.id) {
        return {
          success: false as const,
          error: "Paycrest order not found",
          status: 404,
        };
      }
      return {
        success: true as const,
        order,
        settlement: {
          network: PAYCREST_SETTLEMENT.network,
          chainId: PAYCREST_SETTLEMENT.chainId,
          token: PAYCREST_SETTLEMENT.token,
          tokenAddress: PAYCREST_SETTLEMENT.tokenAddress,
          decimals: PAYCREST_SETTLEMENT.decimals,
        },
      };
    } catch (error: any) {
      console.error("[PayoutService] getSettlementOrder Error:", error.message);
      return {
        success: false as const,
        error: error.message,
        status: error.status || 500,
      };
    }
  }

  /**
   * Verified account details before payment.
   */
  static async verifyBeneficiary(accountNumber: string, bankCode: string, countryCode: string) {
    try {
      const verification = await this.client.verifyAccount({
        institution: bankCode,
        accountIdentifier: accountNumber,
      });
      return { 
        success: true, 
        data: {
          account_name: typeof verification === 'string' ? verification : (verification.account_name || verification)
        }
      };
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
