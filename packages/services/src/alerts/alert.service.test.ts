import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { alertDeps, reportAlert, resetAlertDedupe } from './alert.service.js';

const ENV = ['ALERT_TELEGRAM_BOT_TOKEN', 'ALERT_TELEGRAM_CHAT_ID', 'ALERT_WEBHOOK_URL'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetAlertDedupe();
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  mock.restoreAll();
});

const event = { alert: 'FORWARDER_RECEIPT_MISMATCH', severity: 'high' as const, orderId: '42', message: 'Receipt lacks legs' };

describe('reportAlert', () => {
  it('always writes the JSON log line, even with no channel configured', async () => {
    const fetchSpy = mock.method(alertDeps, 'fetch', async () => new Response('ok'));
    await reportAlert(event);
    assert.equal(fetchSpy.mock.callCount(), 0);
    const logged = (console.error as unknown as { mock: { calls: { arguments: unknown[] }[] } }).mock.calls[0].arguments[0];
    assert.deepEqual(JSON.parse(String(logged)), event);
  });

  it('delivers to Telegram and the webhook with the alert, message and context', async () => {
    process.env.ALERT_TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.ALERT_TELEGRAM_CHAT_ID = '123';
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/abc';
    const fetchSpy = mock.method(alertDeps, 'fetch', async () => new Response('ok'));
    await reportAlert(event);
    const calls = fetchSpy.mock.calls.map((c) => ({ url: c.arguments[0] as string, body: JSON.parse((c.arguments[1] as RequestInit).body as string) }));
    const telegram = calls.find((c) => c.url === 'https://api.telegram.org/botbot-token/sendMessage')!;
    assert.equal(telegram.body.chat_id, '123');
    assert.match(telegram.body.text, /FORWARDER_RECEIPT_MISMATCH \(high\)\nReceipt lacks legs\norderId: 42/);
    const webhook = calls.find((c) => c.url === 'https://hooks.example/abc')!;
    assert.equal(webhook.body.text, webhook.body.content);
  });

  it('sends the same alert about the same subject once per 30 minutes', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/abc';
    let now = 1_000_000;
    mock.method(alertDeps, 'now', () => now);
    const fetchSpy = mock.method(alertDeps, 'fetch', async () => new Response('ok'));
    await reportAlert(event);
    await reportAlert(event);
    await reportAlert({ ...event, orderId: '43' });
    assert.equal(fetchSpy.mock.callCount(), 2);
    now += 31 * 60_000;
    await reportAlert(event);
    assert.equal(fetchSpy.mock.callCount(), 3);
  });

  it('never throws when delivery fails', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/abc';
    mock.method(alertDeps, 'fetch', async () => {
      throw new Error('network down');
    });
    await assert.doesNotReject(reportAlert(event));
    mock.method(alertDeps, 'fetch', async () => new Response('nope', { status: 500 }));
    resetAlertDedupe();
    await assert.doesNotReject(reportAlert(event));
  });
});

describe('reportAlert guards (#194 review)', () => {
  it('does not mute an alert whose every delivery failed', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/abc';
    let fail = true;
    const fetchSpy = mock.method(alertDeps, 'fetch', async () => (fail ? new Response('busy', { status: 429 }) : new Response('ok')));
    await reportAlert(event);
    fail = false;
    await reportAlert(event);
    assert.equal(fetchSpy.mock.callCount(), 2);
  });

  it('never logs the delivery URL or error text (the bot token lives in the URL)', async () => {
    process.env.ALERT_TELEGRAM_BOT_TOKEN = 'secret-bot-token';
    process.env.ALERT_TELEGRAM_CHAT_ID = '1';
    mock.method(alertDeps, 'fetch', async () => {
      throw new TypeError('Failed to parse URL from https://api.telegram.org/botsecret-bot-token/sendMessage');
    });
    await reportAlert(event);
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: { arguments: unknown[] }[] } }).mock.calls.map((c) => c.arguments));
    assert.equal(logged.includes('secret-bot-token'), false);
    assert.match(logged, /"channel":"telegram"/);
  });

  it('treats different details as different alerts', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/abc';
    const fetchSpy = mock.method(alertDeps, 'fetch', async () => new Response('ok'));
    await reportAlert({ alert: 'PRICING_ENV_MISSING', severity: 'high', variable: 'PAYOUT_FEE_BPS' });
    await reportAlert({ alert: 'PRICING_ENV_MISSING', severity: 'high', variable: 'PAYOUT_SPREAD_BPS' });
    assert.equal(fetchSpy.mock.callCount(), 2);
  });
});
