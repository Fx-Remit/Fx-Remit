import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function secret(): string {
  const value =
    process.env.ABANDON_TOKEN_SECRET?.trim() ||
    process.env.PRIVY_APP_SECRET?.trim() ||
    '';
  if (!value) {
    throw new Error('ABANDON_TOKEN_SECRET (or PRIVY_APP_SECRET) is required');
  }
  return value;
}

/**
 * Short-lived capability to cancel one reserved remittance without a Privy session.
 * Used for pagehide/keepalive abandon — never a substitute for interactive auth when available.
 */
export function mintAbandonToken(
  externalId: string,
  userId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const exp = Date.now() + ttlMs;
  const payload = `${externalId}.${userId}.${exp}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAbandonToken(
  token: string,
  expectedExternalId: string,
): { userId: string; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [externalId, userId, expStr, sig] = parts;
  if (!externalId || !userId || !expStr || !sig) return null;
  if (externalId !== expectedExternalId) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;

  const payload = `${externalId}.${userId}.${expStr}`;
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  return { userId, exp };
}
