import {
  prisma,
  type Notification,
  type NotificationType,
  type PushSubscription,
} from '@fx-remit/database';
import { waitUntil } from '@vercel/functions';
import webpush from 'web-push';

export type NotifyInput = {
  userId: string;
  type: NotificationType | 'DEPOSIT_CREDITED' | 'REMITTANCE_COMPLETED' | 'REMITTANCE_FAILED';
  transactionId: string;
  title: string;
  body: string;
  url?: string;
};

export type NotificationResponse = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  transactionId: string;
  readAt: string | null;
  createdAt: string;
  url: string;
};

export type PushSubscribeInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

function deepLinkFor(type: NotifyInput['type'], transactionId: string): string {
  // History detail is client-selected by id; open history with highlight query.
  return `/history?tx=${encodeURIComponent(transactionId)}&kind=${encodeURIComponent(type)}`;
}

function serialize(row: Notification): NotificationResponse {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    transactionId: row.transactionId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    url: deepLinkFor(row.type, row.transactionId),
  };
}

function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
}

/**
 * Reject non-HTTPS / non-push hosts so subscribe cannot turn sendWebPush into SSRF.
 * Covers FCM, Mozilla Autopush, Apple Web Push, and WNS.
 */
export function isAllowedWebPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return (
    host === 'fcm.googleapis.com' ||
    host === 'fcmregistrations.googleapis.com' ||
    host.endsWith('.fcm.googleapis.com') ||
    host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') ||
    host === 'web.push.apple.com' ||
    host.endsWith('.push.apple.com') ||
    host.endsWith('.notify.windows.com') ||
    host.endsWith('.push.windows.com')
  );
}

function configureWebPush() {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!.trim(),
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  return true;
}

function scheduleBackground(task: Promise<unknown>): void {
  const guarded = task.catch((e) =>
    console.error('[NotificationService] background task failed:', e),
  );
  try {
    waitUntil(guarded);
  } catch {
    void guarded;
  }
}

export class NotificationService {
  static serialize = serialize;

  /**
   * Persist inbox row (awaited survives serverless freeze).
   * Fan-out web push only on insert, via waitUntil so the HTTP response can return.
   */
  static async notify(input: NotifyInput): Promise<Notification | null> {
    const type = input.type as NotificationType;
    const url = input.url || deepLinkFor(type, input.transactionId);

    let row: Notification;
    try {
      row = await prisma.notification.create({
        data: {
          userId: input.userId,
          type,
          title: input.title,
          body: input.body,
          transactionId: input.transactionId,
        },
      });
    } catch (err: any) {
      // Idempotent retries / duplicate webhooks — do not re-push.
      if (err?.code === 'P2002') return null;
      throw err;
    }

    scheduleBackground(
      this.sendWebPush(input.userId, {
        title: input.title,
        body: input.body,
        url,
        notificationId: row.id,
        transactionId: input.transactionId,
        type,
      }),
    );

    return row;
  }

  /**
   * Await durable inbox write; never throw to money-path callers.
   * Push is scheduled in the background (waitUntil on Vercel).
   */
  static async notifyDurableBestEffort(input: NotifyInput): Promise<Notification | null> {
    try {
      return await this.notify(input);
    } catch (e) {
      console.error('[NotificationService] notify failed:', e);
      return null;
    }
  }

  /** @deprecated Prefer notifyDurableBestEffort from async money-path callers. */
  static notifyBestEffort(input: NotifyInput): void {
    void this.notifyDurableBestEffort(input);
  }

  static async listForUser(
    userId: string,
    opts?: { limit?: number },
  ): Promise<{ notifications: NotificationResponse[]; unreadCount: number }> {
    const raw = opts?.limit;
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw as number, 1), 100) : 50;
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);
    return {
      notifications: rows.map(serialize),
      unreadCount,
    };
  }

  static async markRead(userId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const result = await prisma.notification.updateMany({
      where: { userId, id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  static async markAllRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  static async upsertPushSubscription(input: PushSubscribeInput): Promise<PushSubscription> {
    if (!isAllowedWebPushEndpoint(input.endpoint)) {
      throw new Error('Push endpoint host is not allowed');
    }
    return prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent || null,
      },
      update: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent || null,
      },
    });
  }

  /** Ownership-scoped delete never deletes another user's endpoint. */
  static async deletePushSubscription(userId: string, endpoint: string): Promise<boolean> {
    const result = await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return result.count > 0;
  }

  static async sendWebPush(
    userId: string,
    payload: {
      title: string;
      body: string;
      url: string;
      notificationId: string;
      transactionId: string;
      type: string;
    },
  ): Promise<void> {
    if (!configureWebPush()) {
      console.warn('[NotificationService] VAPID not configured — skipping web push');
      return;
    }

    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (err: any) {
          const status = err?.statusCode;
          // Gone / expired subscription — drop it.
          if (status === 404 || status === 410) {
            await prisma.pushSubscription
              .deleteMany({ where: { id: sub.id } })
              .catch(() => undefined);
            return;
          }
          console.error('[NotificationService] push send error:', status || err);
        }
      }),
    );
  }

  static async notifyDepositCredited(input: {
    userId: string;
    transactionId: string;
    amountUsd: string | number;
    isRefund?: boolean;
  }): Promise<void> {
    const amount = Number(input.amountUsd).toFixed(2);
    await this.notifyDurableBestEffort({
      userId: input.userId,
      type: 'DEPOSIT_CREDITED',
      transactionId: input.transactionId,
      title: input.isRefund ? 'Refund received' : 'Deposit received',
      body: input.isRefund
        ? `$${amount} was credited back to your balance`
        : `$${amount} USDC added to your balance`,
    });
  }

  static async notifyRemittanceStatus(input: {
    userId: string;
    transactionId: string;
    status: string;
    amountUsd: string | number;
    payoutFiat?: string | number | null;
    recipientName?: string | null;
  }): Promise<void> {
    const status = input.status.toUpperCase();
    const name = input.recipientName?.trim() || 'recipient';
    const usd = Number(input.amountUsd).toFixed(2);
    const fiat =
      input.payoutFiat != null && Number(input.payoutFiat) > 0
        ? Number(input.payoutFiat).toLocaleString(undefined, { maximumFractionDigits: 0 })
        : null;

    if (status === 'COMPLETED') {
      await this.notifyDurableBestEffort({
        userId: input.userId,
        type: 'REMITTANCE_COMPLETED',
        transactionId: input.transactionId,
        title: 'Money delivered',
        body: fiat
          ? `₦${fiat} sent to ${name}`
          : `$${usd} delivered to ${name}`,
      });
      return;
    }

    if (status === 'FAILED' || status === 'REFUND_REQUIRED') {
      await this.notifyDurableBestEffort({
        userId: input.userId,
        type: 'REMITTANCE_FAILED',
        transactionId: input.transactionId,
        title: 'Transfer needs attention',
        body: `Your $${usd} send to ${name} did not complete`,
      });
    }
  }
}
