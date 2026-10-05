import { waitUntil } from '@vercel/functions';

/** A money-path alert. `alert` is the stable code; extra fields (orderId, txHash, ...) are context. */
export type AlertEvent = {
  alert: string;
  severity: 'high' | 'medium';
  message?: string;
  [key: string]: unknown;
};

/** The same alert about the same subject is delivered at most once per window, per server instance. */
const DEDUPE_MS = 30 * 60_000;
const DELIVERY_TIMEOUT_MS = 4_000;
const recent = new Map<string, number>();

/** Network seams; tests replace these. */
export const alertDeps = {
  fetch: (url: string, init: RequestInit) => fetch(url, init),
  now: () => Date.now(),
};

function subjectOf(event: AlertEvent): string {
  for (const key of ['orderId', 'transactionId', 'txHash', 'chainId', 'network']) {
    if (event[key] != null) return `${key}=${String(event[key])}`;
  }
  return '';
}

function textOf(event: AlertEvent): string {
  const { alert, severity, message, ...context } = event;
  const lines = [`🚨 ${alert} (${severity})`];
  if (message) lines.push(message);
  for (const [key, value] of Object.entries(context)) {
    lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  }
  return lines.join('\n').slice(0, 3_500);
}

function post(url: string, body: unknown): Promise<void> {
  return alertDeps
    .fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
}

/**
 * Report a money-path alert. Always writes the JSON log line (Vercel log search keeps working),
 * then delivers it to the configured channels:
 * - Telegram: ALERT_TELEGRAM_BOT_TOKEN + ALERT_TELEGRAM_CHAT_ID;
 * - any Slack/Discord-style incoming webhook: ALERT_WEBHOOK_URL.
 * Never throws: an alert must not break the payout path. Delivery runs in the background
 * (waitUntil on Vercel); callers don't need to await it.
 */
export function reportAlert(event: AlertEvent): Promise<void> {
  console.error(JSON.stringify(event));

  const now = alertDeps.now();
  const key = `${event.alert}|${subjectOf(event)}`;
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) return Promise.resolve();
  recent.set(key, now);

  const text = textOf(event);
  const deliveries: Promise<void>[] = [];
  const botToken = process.env.ALERT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID?.trim();
  if (botToken && chatId) {
    deliveries.push(post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text }));
  }
  const webhook = process.env.ALERT_WEBHOOK_URL?.trim();
  if (webhook) {
    // Slack reads `text`, Discord reads `content`.
    deliveries.push(post(webhook, { text, content: text }));
  }
  if (!deliveries.length) return Promise.resolve();

  const task = Promise.allSettled(deliveries).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[Alerts] delivery failed', {
          alert: event.alert,
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }
  });
  try {
    waitUntil(task);
  } catch {
    // Not on Vercel: the promise still runs.
  }
  return task;
}

/** Tests only. */
export function resetAlertDedupe(): void {
  recent.clear();
}
