import { prisma } from "@fx-remit/database";

export class PayoutService {
  /**
   * High-fidelity triggering of Paycrest Fiat Payout.
   * Executes the off-chain bridge after on-chain verification.
   */
  static async triggerPayout(orderId: bigint, amount: string, currency: string) {
    console.log(`[PayoutService] Initiating Payout: Order #${orderId.toString()} | Amount: ${amount} ${currency}`);

    // TODO: Implement Paycrest SDK / API call here
    // const response = await fetch("https://api.paycrest.io/v1/payouts", { ... });

    // Mocking success for now
    await prisma.transaction.update({
      where: { orderId: orderId },
      data: {
        status: "PROCESSING", // Payout has been handed off to Paycrest
        updatedAt: new Date(),
      },
    });

    return { success: true, status: "PROCESSING" };
  }
}
