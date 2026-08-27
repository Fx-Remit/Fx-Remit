import type {
  CreatePendingRequestBody,
  SettlementPrefetchSession,
} from './settlement-prefetch';

export class CreatePendingHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'CreatePendingHttpError';
    this.status = status;
    this.code = code;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared create-pending HTTP call for confirm prefetch and Send retry.
 * Retries ORDER_IN_FLIGHT briefly (create claim lease), then throws with code.
 */
export async function postCreatePending(
  body: CreatePendingRequestBody,
  accessToken: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const response = await fetch('/api/transaction/create-pending', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: unknown;
      code?: unknown;
    };
    if (response.ok) {
      return data;
    }
    const code = typeof data.code === 'string' ? data.code : undefined;
    const message =
      typeof data.error === 'string' ? data.error : 'Failed to prepare settlement';

    // Fresh PROCESSING claim: wait for attach / sibling create, then retry.
    if (code === 'ORDER_IN_FLIGHT' && attempt < maxAttempts - 1) {
      await sleep(1_500);
      continue;
    }

    throw new CreatePendingHttpError(message, response.status, code);
  }
  throw new CreatePendingHttpError('Failed to prepare settlement', 409);
}

export type CancelPendingResult = {
  ok: boolean;
  status: number;
  cancelled: boolean;
  reason?: string;
  code?: string;
};

export type CancelPendingAuth =
  | { accessToken: string; abandonToken?: string }
  | { abandonToken: string; accessToken?: string };

/** Best-effort abandon of a reserved remittance. */
export async function postCancelPending(
  externalId: string,
  auth: CancelPendingAuth,
  opts?: { keepalive?: boolean },
): Promise<CancelPendingResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }

  const body: { externalId: string; abandonToken?: string } = { externalId };
  if (auth.abandonToken) {
    body.abandonToken = auth.abandonToken;
  }

  const response = await fetch('/api/transaction/cancel-pending', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    keepalive: opts?.keepalive === true,
  });
  const data = (await response.json().catch(() => ({}))) as {
    cancelled?: unknown;
    reason?: unknown;
    code?: unknown;
  };
  return {
    ok: response.ok,
    status: response.status,
    cancelled: data.cancelled === true,
    reason: typeof data.reason === 'string' ? data.reason : undefined,
    code: typeof data.code === 'string' ? data.code : undefined,
  };
}

/** Do not spam cancel while Paycrest is still fundable / already on-chain. */
export function shouldScheduleCancelRetry(result: CancelPendingResult): boolean {
  if (result.code === 'PROVIDER_ORDER_STILL_LIVE') return false;
  if (result.code === 'ALREADY_ON_CHAIN') return false;
  if (result.ok && result.cancelled) return false;
  if (result.ok && result.reason === 'not_found') return true;
  if (!result.ok) return true;
  return false;
}

export const RESERVED_STILL_LIVE_MESSAGE =
  'Payout already prepared — tap Send to finish. Funds stay reserved until the receive window ends.';

/**
 * Abort in-flight prefetch, resolve externalId, cancel on server.
 * Prefer fresh Privy accessToken for interactive close; use abandonToken for pagehide.
 * Marks the session abandoned only when cancel released the reserve (or not_found).
 */
export async function abandonPrefetchSession(opts: {
  session: SettlementPrefetchSession;
  accessToken?: string | null;
  abandonToken?: string | null;
  keepalive?: boolean;
  retryMs?: number;
  shouldRetry?: () => boolean;
}): Promise<{
  cancelled: boolean;
  externalId: string | null;
  status: number;
  code?: string;
  reason?: string;
  stillLive: boolean;
}> {
  const externalId = await opts.session.resolveAbandonExternalId({
    commit: false,
  });
  if (!externalId) {
    return {
      cancelled: false,
      externalId: null,
      status: 0,
      stillLive: false,
    };
  }

  const abandonToken =
    opts.abandonToken ?? opts.session.getAbandonToken() ?? null;
  const accessToken = opts.accessToken ?? null;

  if (!accessToken && !abandonToken) {
    console.error(
      '[CONFIRM] abandon cancel skipped: no access or abandon token for',
      externalId,
    );
    return {
      cancelled: false,
      externalId,
      status: 0,
      stillLive: false,
    };
  }

  const auth: CancelPendingAuth = accessToken
    ? { accessToken, abandonToken: abandonToken ?? undefined }
    : { abandonToken: abandonToken! };

  const first = await postCancelPending(externalId, auth, {
    keepalive: opts.keepalive,
  });

  const stillLive = first.code === 'PROVIDER_ORDER_STILL_LIVE';

  if (stillLive) {
    // Keep prepared session so the user can tap Send and finish.
    return {
      cancelled: false,
      externalId,
      status: first.status,
      code: first.code,
      reason: first.reason,
      stillLive: true,
    };
  }

  // Reserve released, gone, or on-chain — session must not be reused for Send.
  opts.session.markAbandoned();

  const retryMs = opts.retryMs ?? 2500;
  if (
    retryMs > 0 &&
    shouldScheduleCancelRetry(first) &&
    typeof window !== 'undefined'
  ) {
    window.setTimeout(() => {
      if (opts.shouldRetry && !opts.shouldRetry()) return;
      void postCancelPending(externalId, auth, { keepalive: true }).catch((e) =>
        console.error('[CONFIRM] abandon cancel retry failed:', e),
      );
    }, retryMs);
  }

  return {
    cancelled: first.cancelled,
    externalId,
    status: first.status,
    code: first.code,
    reason: first.reason,
    stillLive: false,
  };
}
