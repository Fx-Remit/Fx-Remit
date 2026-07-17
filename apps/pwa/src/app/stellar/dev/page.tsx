'use client';

import { useCallback, useState } from 'react';
import { isStellarEnabled } from '@/lib/stellar/constants';
import {
  connectFreighterWithBalance,
  getFreighterPublicKey,
  fetchUsdcBalance,
  type FreighterConnection,
} from '@/lib/stellar/wallet';

export default function StellarDevPage() {
  const [connection, setConnection] = useState<FreighterConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);

  const enabled = isStellarEnabled();

  const onConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await connectFreighterWithBalance();
      setConnection(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pk = connection?.publicKey ?? (await getFreighterPublicKey());
      if (!pk) {
        throw new Error('Connect Freighter first');
      }
      const balance = await fetchUsdcBalance(pk);
      setConnection((prev) =>
        prev
          ? { ...prev, usdcBalance: balance }
          : { publicKey: pk, usdcBalance: balance, network: 'testnet' },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  }, [connection?.publicKey]);

  const fetchQuote = useCallback(async (corridor: 'NGN' | 'KES') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stellar/quote?corridor=${corridor}&amount=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Quote failed');
      setQuote(data.quote);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quote failed');
    } finally {
      setLoading(false);
    }
  }, []);

  if (!enabled) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Stellar (disabled)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set <code>NEXT_PUBLIC_STELLAR_ENABLED=true</code> to use this dev page.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Stellar rail (dev)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dual-rail preview — EVM cash-out unchanged. Freighter + SEP quote API.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <button
          type="button"
          onClick={onConnect}
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? 'Working…' : 'Connect Freighter'}
        </button>
        {connection && (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Account:</span>{' '}
              <span className="break-all font-mono text-xs">{connection.publicKey}</span>
            </p>
            <p>
              <span className="text-muted-foreground">USDC:</span> {connection.usdcBalance}
            </p>
            <p>
              <span className="text-muted-foreground">Network:</span> {connection.network}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-sm text-primary underline disabled:opacity-50"
        >
          Refresh balance
        </button>
      </div>

      <div className="space-y-2 rounded-xl border p-4">
        <p className="text-sm font-medium">SEP-38 quote (read-only)</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fetchQuote('NGN')}
            disabled={loading}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            NGN
          </button>
          <button
            type="button"
            onClick={() => fetchQuote('KES')}
            disabled={loading}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            KES
          </button>
        </div>
        {quote && (
          <pre className="overflow-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(quote, null, 2)}
          </pre>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </main>
  );
}
