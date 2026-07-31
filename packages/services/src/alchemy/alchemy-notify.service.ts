/**
 * Alchemy Notify — Address Activity webhook address registration.
 *
 */
const NOTIFY_URL = 'https://dashboard.alchemy.com/api/update-webhook-addresses';

function webhookIds(): string[] {
  return [
    process.env.ALCHEMY_ADDRESS_ACTIVITY_WEBHOOK_ID_BASE?.trim(),
    process.env.ALCHEMY_ADDRESS_ACTIVITY_WEBHOOK_ID_CELO?.trim(),
    // Optional single-webhook fallback
    process.env.ALCHEMY_ADDRESS_ACTIVITY_WEBHOOK_ID?.trim(),
  ].filter((id): id is string => Boolean(id));
}

export class AlchemyNotifyService {
  static isConfigured(): boolean {
    return Boolean(process.env.ALCHEMY_AUTH_TOKEN?.trim()) && webhookIds().length > 0;
  }

  static async registerAddress(address: string): Promise<void> {
    await this.updateAddress(address, 'add');
  }

  static async deregisterAddress(address: string): Promise<void> {
    await this.updateAddress(address, 'remove');
  }

  /**
   * When a wallet changes: remove previous, add next (idempotent).
   */
  static async syncWalletChange(params: {
    previousAddress?: string | null;
    nextAddress?: string | null;
  }): Promise<void> {
    const prev = params.previousAddress?.trim();
    const next = params.nextAddress?.trim();

    if (prev && (!next || prev.toLowerCase() !== next.toLowerCase())) {
      await this.deregisterAddress(prev);
    }
    if (next) {
      await this.registerAddress(next);
    }
  }

  private static async updateAddress(
    address: string,
    op: 'add' | 'remove',
  ): Promise<void> {
    const token = process.env.ALCHEMY_AUTH_TOKEN?.trim();
    const ids = webhookIds();

    if (!token || ids.length === 0) {
      console.warn(
        '[AlchemyNotify] Skipped — set ALCHEMY_AUTH_TOKEN and Address Activity webhook IDs',
      );
      return;
    }

    const normalized = address.toLowerCase();

    for (const webhookId of ids) {
      const body = {
        webhook_id: webhookId,
        addresses_to_add: op === 'add' ? [normalized] : [],
        addresses_to_remove: op === 'remove' ? [normalized] : [],
      };

      const res = await fetch(NOTIFY_URL, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Alchemy-Token': token,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(
          `[AlchemyNotify] ${op} failed webhook=${webhookId} status=${res.status} ${text}`,
        );
      } else {
        console.log(`[AlchemyNotify] ${op} ${normalized} on ${webhookId}`);
      }
    }
  }
}
