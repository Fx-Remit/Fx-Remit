import type {
  CreatePendingRequestBody,
  SettlementPrefetchSession,
} from './settlement-prefetch';

/**
 * Shared create-pending HTTP call for confirm prefetch and Send retry.
 * Throws on non-OK; returns parsed JSON for SettlementPrefetchSession to validate.
 */
export async function postCreatePending(
  body: CreatePendingRequestBody,
  accessToken: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch('/api/transaction/create-pending', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'Failed to prepare settlement',
    );
  }
  return data;
}

export type CancelPendingResult = {
  ok: boolean;
  status: number;
  cancelled: boolean;
  reason?: string;
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
  };
  return {
    ok: response.ok,
    status: response.status,
    cancelled: data.cancelled === true,
    reason: typeof data.reason === 'string' ? data.reason : undefined,
  };
}

function shouldScheduleCancelRetry(result: CancelPendingResult): boolean {
  if (result.ok && result.cancelled) return false;
  if (result.ok && result.reason === 'not_found') return true;
  if (!result.ok) return true;
  return false;
}

/**
 * Abort in-flight prefetch, resolve externalId, cancel on server.
 * Prefer fresh Privy accessToken for interactive close; use abandonToken for pagehide.
 */
export async function abandonPrefetchSession(opts: {
  session: SettlementPrefetchSession;
  accessToken?: string | null;
  abandonToken?: string | null;
  keepalive?: boolean;
  retryMs?: number;
  shouldRetry?: () => boolean;
}): Promise<{ cancelled: boolean; externalId: string | null }> {
  const externalId = await opts.session.resolveAbandonExternalId();
  if (!externalId) {
    return { cancelled: false, externalId: null };
  }

  const abandonToken =
    opts.abandonToken ?? opts.session.getAbandonToken() ?? null;
  const accessToken = opts.accessToken ?? null;

  if (!accessToken && !abandonToken) {
    console.error(
      '[CONFIRM] abandon cancel skipped: no access or abandon token for',
      externalId,
    );
    return { cancelled: false, externalId };
  }

  const auth: CancelPendingAuth = accessToken
    ? { accessToken, abandonToken: abandonToken ?? undefined }
    : { abandonToken: abandonToken! };

  const first = await postCancelPending(externalId, auth, {
    keepalive: opts.keepalive,
  });

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

  return { cancelled: first.cancelled, externalId };
}
