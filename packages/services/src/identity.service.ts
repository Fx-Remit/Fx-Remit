import { prisma } from '@fx-remit/database';
import { PrivyClient } from '@privy-io/node';

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

export class IdentityService {
  /**
   * High-fidelity synchronization of Privy Identity events.
   * Ensures the Stockholm DB reflects the latest user credentials.
   */
  static async syncUser(event: any) {
    const { type, data: user } = event;
    const did = user.id;

    console.log(`[IdentityService] Syncing User: DID[${did}] | Event[${type}]`);

    // Extracting mapped identity fields
    const email = user.linked_accounts.find((a: any) => a.type === 'email')?.address;

    const walletAddress = user.linked_accounts.find(
      (a: any) => a.type === 'wallet' || a.type === 'smart_wallet',
    )?.address;

    // Atomic Supabase Sync via Prisma
    return await prisma.user.upsert({
      where: { privyDid: did },
      update: {
        email: email || undefined,
        walletAddress: walletAddress || undefined,
        lastLoginAt: new Date(),
        displayName: user.displayName || undefined,
      },
      create: {
        privyDid: did,
        email: email || '',
        walletAddress: walletAddress || '',
        displayName: user.displayName || 'New User',
        lastLoginAt: new Date(),
      },
    });
  }

  /**
   * Verifies the Privy webhook signature with high-fidelitySvix validation.
   */
  static async verifyWebhook(body: string, headers: any) {
    return await privy.webhooks().verify({
      payload: body,
      svix: {
        id: headers.id,
        timestamp: headers.timestamp,
        signature: headers.signature,
      },
      signing_secret: process.env.PRIVY_WEBHOOK_SECRET,
    });
  }
}
