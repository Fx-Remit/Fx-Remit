'use client';

import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ConfirmTransactionSheet,
  type PrefetchPhase,
} from './ConfirmTransactionSheet';
import { useUserStore } from '@/store/user-store';
import { SettlementPrefetchSession } from '@/lib/cash-out/settlement-prefetch';
import {
  abandonPrefetchSession,
  postCreatePending,
  RESERVED_STILL_LIVE_MESSAGE,
} from '@/lib/cash-out/create-pending-client';
import { spendableLedgerUsd } from '@/lib/cash-out/spendable-balance';
import { fetchFreshQuoteValidUntil } from '@/lib/cash-out/fetch-retail-quote';

function CashOutConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getAccessToken, authenticated } = usePrivy();
  const queryClient = useQueryClient();

  const [session, setSession] = useState<SettlementPrefetchSession | null>(null);
  const [prefetchPhase, setPrefetchPhase] = useState<PrefetchPhase>('preparing');
  const [prefetchError, setPrefetchError] = useState<string | null>(null);
  /** Server-bound fiat from create-pending; overrides URL estimate for display. */
  const [boundPayoutFiat, setBoundPayoutFiat] = useState<number | null>(null);
  /** Shown on the confirm page when open fails before the sheet mounts. */
  const [openError, setOpenError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  /** Mirrors sendingRef for disabling header/edit while Send (incl. Instant Send grant) is in flight. */
  const [sending, setSending] = useState(false);

  /** Bumps on every open/close so stale prefetch .then handlers cannot update UI. */
  const generationRef = useRef(0);
  const sendingRef = useRef(false);
  /** Mirror of session for pagehide / back not tied to React render. */
  const sessionRef = useRef<SettlementPrefetchSession | null>(null);
  /**
   * Privy JWT kept only until abandonToken arrives (covers pagehide during
   * in-flight create-pending). Cleared as soon as the capability token exists.
   */
  const bridgeAccessTokenRef = useRef<string | null>(null);
  const unloadBoundRef = useRef(false);
  const pageHideHandlerRef = useRef<() => void>(() => {});
  /** Bumped on each open so delayed abandon retries cannot cancel a new session. */
  const abandonEpochRef = useRef(0);

  // Stable listener identities so add/removeEventListener match.
  const stablePageHide = useRef(() => {
    pageHideHandlerRef.current();
  }).current;
  const stableBeforeUnload = useRef(() => {
    pageHideHandlerRef.current();
  }).current;

  const sendAmount = searchParams.get('send') || '0';
  const receiveAmount = searchParams.get('receive') || '0';
  const token = searchParams.get('token') || 'USDT';
  const currency = searchParams.get('currency') || 'NGN';

  const accountNumber = searchParams.get('accNum') || '0000000000';
  const accountName = searchParams.get('accName') || 'Account Owner';
  const bankName = searchParams.get('bank') || 'Bank Name';
  const bankCode = searchParams.get('bankCode') || '';
  const type = searchParams.get('type') || 'bank';
  const idempotencyKey = searchParams.get('idempotencyKey') || '';

  const rate = searchParams.get('rate') || '0';
  const spread = searchParams.get('spread') || '75';

  const { profile: dbUser } = useUserStore();

  const { data: balanceData } = useQuery({
    queryKey: ['live-wallet-balance', dbUser?.walletAddress],
    queryFn: async () => {
      const accessToken = await getAccessToken();
      const res = await fetch('/api/deposit/balance', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Balance fetch failed: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!dbUser?.walletAddress && !!authenticated,
    staleTime: 5_000,
    retry: 1,
  });

  const spendable = spendableLedgerUsd({
    balanceData,
    fallbackWalletBalance: (dbUser as { walletBalance?: { toString(): string } })
      ?.walletBalance,
  });
  const availableBalance = spendable.amount;
  const displayReceiveAmount =
    boundPayoutFiat != null ? boundPayoutFiat : Number(receiveAmount);

  const isBank = type === 'bank';
  const feePercentText = `${(Number(spread) / 100).toFixed(2)}%`;
  const formattedRate =
    Number(rate) > 0
      ? `1 ${token} = ${Number(rate).toLocaleString()} ${currency}`
      : '-';

  const resolveAbandonAccessToken = async (): Promise<string | null> => {
    try {
      return (await getAccessToken()) || null;
    } catch (e) {
      console.error('[CONFIRM] getAccessToken for abandon failed:', e);
      return null;
    }
  };

  const unbindUnloadHandlers = () => {
    if (!unloadBoundRef.current || typeof window === 'undefined') return;
    window.removeEventListener('pagehide', stablePageHide);
    window.removeEventListener('beforeunload', stableBeforeUnload);
    unloadBoundRef.current = false;
  };

  const clearConfirmSessionUi = () => {
    generationRef.current += 1;
    sessionRef.current = null;
    sendingRef.current = false;
    setSending(false);
    setSession(null);
    setPrefetchPhase('preparing');
    setPrefetchError(null);
    setBoundPayoutFiat(null);
    unbindUnloadHandlers();
  };

  const abandonActiveSession = async (opts?: {
    keepalive?: boolean;
    /** Tear down sheet only after cancel succeeds (default true). */
    clearUi?: boolean;
    /** Header back: navigate only when the reserve was released. */
    navigateBack?: boolean;
  }) => {
    const current = sessionRef.current;
    // Gate on broadcast only — never skip cancel because Privy modal is open.
    if (!current || current.wasConsumed()) {
      if (opts?.navigateBack) router.back();
      return;
    }

    // Review-only: create-pending never started — free exit, nothing on ledger.
    // Do NOT tear down while Send is mid-flight (e.g. awaiting Instant Send addSigners):
    // handleSend still holds the session closure and would create+broadcast after navigate.
    if (!current.hasStartedCreate()) {
      if (sendingRef.current) {
        return;
      }
      if (opts?.clearUi !== false) {
        clearConfirmSessionUi();
      }
      if (opts?.navigateBack) router.back();
      return;
    }

    setClosing(true);
    const epoch = abandonEpochRef.current;
    try {
      // Interactive close: fresh Privy token. Capability token is fallback for keepalive.
      const accessToken = await resolveAbandonAccessToken();
      const result = await abandonPrefetchSession({
        session: current,
        accessToken,
        abandonToken: current.getAbandonToken(),
        keepalive: opts?.keepalive,
        shouldRetry: () => abandonEpochRef.current === epoch,
      });

      if (result.stillLive) {
        // Fail-closed cancel: keep sheet so user can finish Send.
        setPrefetchError(RESERVED_STILL_LIVE_MESSAGE);
        setOpenError(RESERVED_STILL_LIVE_MESSAGE);
        queryClient.invalidateQueries({ queryKey: ['live-wallet-balance'] });
        queryClient.invalidateQueries({ queryKey: ['transaction-history'] });
        queryClient.invalidateQueries({ queryKey: ['transaction-history-full'] });

        // If abandon aborted an in-flight create before parse, re-start create (same externalId → resume).
        try {
          await current.awaitPrepared();
          setPrefetchPhase('ready');
        } catch {
          const access = (await resolveAbandonAccessToken()) || accessToken;
          if (access) {
            setPrefetchPhase('preparing');
            current.start(async (body, signal) =>
              postCreatePending(body, access, signal),
            );
            void current
              .awaitPrepared()
              .then((prepared) => {
                if (sessionRef.current !== current) return;
                if (prepared.payoutFiat != null && Number.isFinite(prepared.payoutFiat)) {
                  setBoundPayoutFiat(prepared.payoutFiat);
                }
                setPrefetchPhase('ready');
              })
              .catch((err: unknown) => {
                if (sessionRef.current !== current) return;
                if (err instanceof DOMException && err.name === 'AbortError') return;
                setPrefetchPhase('error');
                setPrefetchError(
                  err instanceof Error ? err.message : RESERVED_STILL_LIVE_MESSAGE,
                );
              });
          } else {
            setPrefetchPhase('error');
          }
        }
        return;
      }

      if (result.cancelled) {
        queryClient.invalidateQueries({ queryKey: ['transaction-history'] });
        queryClient.invalidateQueries({ queryKey: ['transaction-history-full'] });
        queryClient.invalidateQueries({ queryKey: ['user-profile'] });
        queryClient.invalidateQueries({ queryKey: ['live-wallet-balance'] });
      }

      if (opts?.clearUi !== false) {
        clearConfirmSessionUi();
      }
      if (opts?.navigateBack) {
        router.back();
      }
    } catch (e) {
      console.error('[CONFIRM] abandon cancel failed:', e);
      setPrefetchError(
        'Could not release this payout yet — tap Send to finish, or try again shortly.',
      );
    } finally {
      setClosing(false);
      bridgeAccessTokenRef.current = null;
    }
  };

  pageHideHandlerRef.current = () => {
    const current = sessionRef.current;
    if (!current || current.wasConsumed()) return;
    // Privy consent / broadcast in flight — pagehide must not cancel-pending
    // (would leave Paycrest live + next open creates a second reserve).
    if (sendingRef.current) return;
    // Review-only sheet: nothing reserved.
    if (!current.hasStartedCreate()) {
      sessionRef.current = null;
      bridgeAccessTokenRef.current = null;
      return;
    }
    const epoch = abandonEpochRef.current;
    const capability = current.getAbandonToken();
    const bridge = bridgeAccessTokenRef.current;
    current.abortInFlight();
    void abandonPrefetchSession({
      session: current,
      abandonToken: capability,
      accessToken: capability ? null : bridge,
      keepalive: true,
      retryMs: 2500,
      shouldRetry: () => abandonEpochRef.current === epoch,
    });
    sessionRef.current = null;
    bridgeAccessTokenRef.current = null;
  };

  const bindUnloadHandlers = () => {
    if (unloadBoundRef.current || typeof window === 'undefined') return;
    window.addEventListener('pagehide', stablePageHide);
    window.addEventListener('beforeunload', stableBeforeUnload);
    unloadBoundRef.current = true;
  };

  // Unmount-only safety net for in-app SPA navigation (does not start create-pending).
  useEffect(() => {
    return () => {
      const current = sessionRef.current;
      if (!current || current.wasConsumed()) return;
      if (sendingRef.current) return;
      if (!current.hasStartedCreate()) {
        sessionRef.current = null;
        bridgeAccessTokenRef.current = null;
        if (typeof window !== 'undefined') {
          window.removeEventListener('pagehide', stablePageHide);
          window.removeEventListener('beforeunload', stableBeforeUnload);
        }
        return;
      }
      const epoch = abandonEpochRef.current;
      const capability = current.getAbandonToken();
      const bridge = bridgeAccessTokenRef.current;
      current.abortInFlight();
      void abandonPrefetchSession({
        session: current,
        abandonToken: capability,
        accessToken: capability ? null : bridge,
        keepalive: true,
        retryMs: 2500,
        shouldRetry: () => abandonEpochRef.current === epoch,
      });
      sessionRef.current = null;
      bridgeAccessTokenRef.current = null;
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', stablePageHide);
        window.removeEventListener('beforeunload', stableBeforeUnload);
      }
    };
  }, [stablePageHide, stableBeforeUnload]);

  const openConfirmSheet = async () => {
    if (session || closing) return;

    abandonEpochRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setOpenError(null);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setOpenError('Session expired — refresh the page and try again');
      return;
    }

    let quoteValidUntil: number;
    try {
      quoteValidUntil = await fetchFreshQuoteValidUntil({
        sourceToken: token,
        destinationCurrency: currency,
      });
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Failed to refresh quote');
      return;
    }

    generationRef.current += 1;
    const next = new SettlementPrefetchSession({
      amountUsd: sendAmount,
      quoteValidUntil,
      destinationCurrency: currency,
      recipientName: accountName,
      recipientBank: bankName,
      recipientAcc: accountNumber,
      bankCode: bankCode || undefined,
      recipientType: type === 'mobile' ? 'mobile' : 'bank',
      token,
      externalId: idempotencyKey || undefined,
    });

    bridgeAccessTokenRef.current = null;
    setPrefetchPhase('ready');
    setPrefetchError(null);
    setBoundPayoutFiat(null);
    sessionRef.current = next;
    setSession(next);
    bindUnloadHandlers();
  };

  const closeConfirmSheet = async () => {
    // Allow close/abandon anytime until a real broadcast marks the session consumed.
    // If Paycrest is still fundable, sheet stays open with a reserved message.
    await abandonActiveSession({ keepalive: false, clearUi: true });
  };

  const handleHeaderBack = () => {
    if (sendingRef.current) return;
    if (sessionRef.current && !sessionRef.current.wasConsumed()) {
      void abandonActiveSession({
        keepalive: false,
        clearUi: true,
        navigateBack: true,
      });
      return;
    }
    router.back();
  };

  const navigationLocked = sending || closing;

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col">
      <div className="px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50 bg-white">
        <button
          type="button"
          onClick={handleHeaderBack}
          disabled={navigationLocked}
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-bold text-[#1C1C1C]">
          Cash out
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center pt-8 overflow-y-auto w-full px-5">
        <div
          className="mb-8 flex w-full max-w-[390px] flex-col justify-between rounded-[15px] border border-gray-100 bg-white p-6 shadow-[0px_8px_30px_rgba(0,0,0,0.04)] min-h-[280px]"
        >
          <div className="flex-1 flex flex-col justify-between py-2">
            <div className="space-y-3">
              <p className="text-[#1C1C1C] text-[16px] font-medium opacity-80">You send</p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-[32px] font-bold text-[#1C1C1C]">${sendAmount}</div>
                <div className="flex items-center gap-2 px-3 py-2 bg-[#E1EFFF] rounded-full text-[#2261FE] font-bold text-[13px] border border-[#2261FE]/10 whitespace-nowrap">
                  <img
                    src={`/${token.toLowerCase()}.svg`}
                    alt=""
                    className="w-5 h-5 rounded-full object-contain"
                  />
                  {token}
                  <ChevronDown size={16} />
                </div>
              </div>
              <p className="text-[#888888] text-[14px] font-medium">
                Available: ${availableBalance}
              </p>
            </div>

            <div className="flex justify-center flex-1 py-2">
              <div className="h-full w-[2px] border-l-2 border-dashed border-[#E1EFFF]" />
            </div>

            <div className="space-y-3">
              <p className="text-[#1C1C1C] text-[16px] font-medium opacity-80">
                Recipient receives
              </p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-[32px] font-bold text-[#1C1C1C]">
                  {displayReceiveAmount.toLocaleString()}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-[#E1EFFF] rounded-full text-[#2261FE] font-bold text-[13px] whitespace-nowrap border border-[#2261FE]/10 min-w-[120px] justify-center">
                  {currency}
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-8 w-full max-w-[370px] mx-auto">
          <div className="flex items-center justify-between">
            <span className="text-[#888888] text-[14px] font-medium">Fees</span>
            <span className="text-[#1C1C1C] text-[14px] font-bold">{feePercentText}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#888888] text-[14px] font-medium">Exchange rate</span>
            <span className="text-[#1C1C1C] text-[14px] font-bold uppercase whitespace-nowrap text-right">
              {formattedRate}
            </span>
          </div>
        </div>

        <div className="w-full max-w-[390px] mx-auto bg-white rounded-[15px] p-4 border border-[#B8D8FF] flex items-center gap-4 relative shadow-sm">
          <div className="w-[45px] h-[45px] rounded-full bg-[#E1EFFF] flex items-center justify-center overflow-hidden flex-shrink-0">
            <img
              src="/bank2.svg"
              alt={isBank ? 'Bank' : 'Mobile Money'}
              className="w-[45px] h-[45px] object-contain"
            />
          </div>

          <div className="flex-1 space-y-0.5 min-w-0">
            <p className="text-[#1C1C1C] text-[16px] font-bold truncate">{accountNumber}</p>
            <p className="text-[#888888] text-[14px] font-medium truncate">{bankName}</p>
            <p className="text-[#888888] text-[14px] font-medium truncate">{accountName}</p>
          </div>

          <button
            type="button"
            onClick={handleHeaderBack}
            disabled={navigationLocked}
            className="p-1 hover:bg-gray-50 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 disabled:pointer-events-none"
          >
            <img src="/retry.svg" alt="Edit" className="w-[36px] h-[36px]" />
          </button>
        </div>
      </div>

      <div className="p-6 pb-12 bg-white mt-auto w-full flex flex-col items-center gap-3">
        {openError && (
          <div className="max-w-[430px] w-full p-4 bg-red-50 border border-red-100 rounded-[12px]">
            <p className="text-red-600 text-[13px] font-medium leading-tight text-center">
              {openError}
            </p>
          </div>
        )}
        <button
          onClick={() => {
            void openConfirmSheet();
          }}
          disabled={!!session || closing || !spendable.ready}
          className="max-w-[430px] w-full h-[65px] bg-[#2261FE] text-white rounded-[7px] text-[18px] font-bold shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          Confirm & Send
        </button>
      </div>

      {session && (
        <ConfirmTransactionSheet
          session={session}
          prefetchPhase={prefetchPhase}
          prefetchError={prefetchError}
          onClose={() => {
            void closeConfirmSheet();
          }}
          onSendingChange={(next) => {
            // Send / Instant Send grant in flight — block free-exit and pagehide cancel.
            sendingRef.current = next;
            setSending(next);
          }}
          sendAmount={sendAmount}
          receiveAmount={displayReceiveAmount}
          token={token}
          currency={currency}
          accNum={accountNumber}
          accName={accountName}
          bankName={bankName}
          spreadBps={Number(spread)}
          onPayoutFiatBound={(payoutFiat) => {
            setBoundPayoutFiat(payoutFiat);
          }}
        />
      )}
    </div>
  );
}

export default function CashOutConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FDFDFD]" />}>
      <CashOutConfirmContent />
    </Suspense>
  );
}
