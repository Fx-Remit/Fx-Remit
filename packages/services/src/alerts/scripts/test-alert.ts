#!/usr/bin/env node
/**
 * Ops: send one test alert through the configured channels (Telegram and/or ALERT_WEBHOOK_URL)
 * to confirm delivery end to end.
 *
 * Usage (from packages/services):
 *   pnpm exec node --import tsx --env-file=../../apps/pwa/.env.local src/alerts/scripts/test-alert.ts
 */
import { reportAlert } from '../alert.service.js';

const channels = [
  process.env.ALERT_TELEGRAM_BOT_TOKEN?.trim() && process.env.ALERT_TELEGRAM_CHAT_ID?.trim() ? 'telegram' : null,
  process.env.ALERT_WEBHOOK_URL?.trim() ? 'webhook' : null,
].filter(Boolean);

if (!channels.length) {
  console.error('No alert channel configured: set ALERT_TELEGRAM_BOT_TOKEN + ALERT_TELEGRAM_CHAT_ID and/or ALERT_WEBHOOK_URL.');
  process.exit(1);
}

await reportAlert({
  alert: 'TEST_ALERT',
  severity: 'high',
  message: 'Test alert from FX Remit. If you can read this, money-path alerts reach you.',
  sentAt: new Date().toISOString(),
});
console.log(`Sent to: ${channels.join(', ')} (check the channel; delivery errors are logged above).`);
