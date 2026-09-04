'use client';

import { ChevronLeft, ChevronDown, X, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebounce } from '@/hooks/use-debounce';
import { Decimal } from 'decimal.js';
import { spendableLedgerUsd } from '@/lib/cash-out/spendable-balance';
import {
  aggregateTokenBalancesUsd,
  BANK_SETTLEMENT_TOKENS,
  pickHighestBalanceToken,
} from '@/lib/cash-out/token-balances';

const TOKENS = [
  { symbol: 'USDT', icon: '/usdt.svg', bankSupported: true },
  { symbol: 'USDC', icon: '/usdc.svg', bankSupported: true },
];

const CURRENCIES = [
  { code: 'NGN', flag: '🇳🇬', name: 'Nigerian Naira' },
  { code: 'KES', flag: '🇰🇪', name: 'Kenyan Shilling' },
  { code: 'UGX', flag: '🇺🇬', name: 'Ugandan Shilling' },
  { code: 'TZS', flag: '🇹🇿', name: 'Tanzanian Shilling' },
];

/** Paycrest rejects smaller bank orders after fee — enforce before payment method. */
const MIN_SEND_USD = 1;

type QuoteResult = {
  comingSoon?: boolean;
  retail_rate?: number;
  wholesale_rate?: number;
  spread_bps?: number;
  valid_until?: number;
};

export default function BankCashOutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amountInput, setAmountInput] = useState('');
  const [lastEdited, setLastEdited] = useState<'send' | 'receive'>('send');

  const debouncedAmount = useDebounce(amountInput, 500);

  const [token, setToken] = useState('USDC');
  const [currency, setCurrency] = useState('NGN');
  const tokenTouchedRef = useRef(false);

  const [isTokenSheetOpen, setIsTokenSheetOpen] = useState(false);
  const [isCurrencySheetOpen, setIsCurrencySheetOpen] = useState(false);
  const [isPaymentMethodSheetOpen, setIsPaymentMethodSheetOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<'bank' | 'mobile'>('bank');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { getAccessToken, authenticated } = usePrivy();
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

  type SavedRecipientRow = {
    id: string;
    type: 'BANK' | 'MOBILE';
    currency: string;
    institutionCode: string;
    institutionName: string;
    accountIdentifier: string;
    accountName: string;
  };

  const { data: recipientsData, isLoading: isLoadingRecipients } = useQuery({
    queryKey: ['saved-recipients', currency, paymentType],
    queryFn: async () => {
      const accessToken = await getAccessToken();
      const params = new URLSearchParams({
        currency,
        type: paymentType === 'mobile' ? 'MOBILE' : 'BANK',
      });
      const res = await fetch(`/api/user/recipients?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load saved accounts');
      }
      return (data.recipients || []) as SavedRecipientRow[];
    },
    enabled: isPaymentMethodSheetOpen && !!authenticated && !!currency,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const savedRecipients = recipientsData || [];

  const removeSavedRecipient = async (row: SavedRecipientRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (removingId) return;
    setRemovingId(row.id);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`/api/user/recipients/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove account');
      }
      await queryClient.invalidateQueries({ queryKey: ['saved-recipients'] });
    } catch (err) {
      console.error('[BANK] remove recipient failed:', err);
    } finally {
      setRemovingId(null);
    }
  };

  const tokenBalances = aggregateTokenBalancesUsd(balanceData?.perChain);

  // Default to the settlement token with the highest live balance (once).
  useEffect(() => {
    if (tokenTouchedRef.current || !balanceData?.perChain) return;
    const best = pickHighestBalanceToken(
      balanceData.perChain,
      BANK_SETTLEMENT_TOKENS,
      'USDC',
    );
    setToken(best);
  }, [balanceData?.perChain]);

  const spendable = spendableLedgerUsd({
    balanceData,
    fallbackWalletBalance: (dbUser as { walletBalance?: { toString(): string } })
      ?.walletBalance,
  });
  const availableBalance = spendable.amount;

  // For tiered wholesale rates, we pass the send amount if available, otherwise fallback to 1 unit.
  const queryAmount = lastEdited === 'send' && debouncedAmount ? debouncedAmount : '1';

  // Fetch rate — unsupported Paycrest corridors surface as Coming soon (no throw/retry spam).
  const { data: quote, isLoading: isLoadingRate } = useQuery({
    queryKey: ['quote', token, currency, queryAmount],
    queryFn: async (): Promise<QuoteResult> => {
      const res = await fetch(
        `/api/quote?source=${token}&destination=${currency}&amount=${queryAmount}`,
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 404 || data?.code === 'COMING_SOON') {
        return { comingSoon: true };
      }
      if (!data.success) throw new Error(data.error || 'Failed to fetch quote');
      return data.quote as QuoteResult;
    },
    enabled: !!currency && !!token,
    retry: false,
  });

  const comingSoon = quote?.comingSoon === true;
  const rate =
    !comingSoon && typeof quote?.retail_rate === 'number' ? quote.retail_rate : null;

  // Derived bidirectional state
  const sendAmount =
    lastEdited === 'send'
      ? amountInput
      : rate && amountInput && !isNaN(Number(amountInput))
        ? new Decimal(amountInput).div(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN).toString()
        : '';

  const receiveAmount =
    lastEdited === 'receive'
      ? amountInput
      : rate && amountInput && !isNaN(Number(amountInput))
        ? new Decimal(amountInput).mul(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN).toString()
        : '';

  const sendUsd = Number(sendAmount);
  const hasSendAmount = Number.isFinite(sendUsd) && sendUsd > 0;
  const belowMinimum = hasSendAmount && sendUsd < MIN_SEND_USD;
  const canChoosePayment = !comingSoon && hasSendAmount && !belowMinimum;

  const buildCashOutParams = () =>
    new URLSearchParams({
      type: paymentType,
      send: sendAmount || '0',
      receive: receiveAmount || '0',
      token: token,
      currency: currency || 'NGN',
      rate: rate?.toString() || '0',
      wholesaleRate: !comingSoon ? quote?.wholesale_rate?.toString() || '0' : '0',
      spread: !comingSoon ? quote?.spread_bps?.toString() || '75' : '75',
    });

  const goToAddAccount = () => {
    setIsPaymentMethodSheetOpen(false);
    router.push(`/cash-out/bank/add?${buildCashOutParams().toString()}`);
  };

  const selectSavedRecipient = (row: SavedRecipientRow) => {
    setIsPaymentMethodSheetOpen(false);
    const params = buildCashOutParams();
    params.set('accNum', row.accountIdentifier);
    params.set('accName', row.accountName);
    params.set('bank', row.institutionName);
    params.set('bankCode', row.institutionCode);
    params.set(
      'idempotencyKey',
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `idk_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    );
    router.push(`/cash-out/bank/confirm?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50 bg-white shadow-sm">
        <Link
          href="/home"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-bold text-[#1C1C1C]">
          Cash out
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center pt-8 overflow-y-auto w-full px-[20px]">
        {/* Exchange Card */}
        <div
          className="bg-white rounded-[15px] p-6 shadow-[0px_8px_30px_rgba(0,0,0,0.04)] border border-gray-100 mb-8 flex flex-col justify-between w-full max-w-[390px] min-h-[280px] sm:min-h-[320px]"
        >
          <div className="flex-1 flex flex-col justify-between py-2">
            {/* You Send */}
            <div className="space-y-3">
              <p className="text-[#1C1C1C] text-[16px] font-medium opacity-80">You send</p>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  placeholder="0"
                  value={sendAmount}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setLastEdited('send');
                  }}
                  className="w-0 flex-1 bg-transparent text-[32px] font-bold text-[#1C1C1C] placeholder:text-gray-200 focus:outline-none min-w-0"
                />
                <button
                  onClick={() => setIsTokenSheetOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E1EFFF] rounded-full text-[#2261FE] font-bold text-[13px] border border-[#2261FE]/10 whitespace-nowrap"
                >
                  <img
                    src={`/${token.toLowerCase()}.svg`}
                    alt=""
                    className="w-5 h-5 rounded-full object-contain"
                  />
                  {token}
                  <ChevronDown size={16} />
                </button>
              </div>
              <p className="text-[#888888] text-[14px] font-medium">
                Available: ${availableBalance}
              </p>
              {belowMinimum && (
                <p className="text-[#E11D48] text-[13px] font-medium">
                  Minimum send is ${MIN_SEND_USD}
                </p>
              )}
            </div>

            {/* Dashed Separator */}
            <div className="flex justify-center flex-1 py-2">
              <div className="h-full w-[2px] border-l-2 border-dashed border-[#E1EFFF]" />
            </div>

            {/* Recipient Receives */}
            <div className="space-y-3">
              <p className="text-[#1C1C1C] text-[16px] font-medium opacity-80">
                Recipient receives
              </p>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  placeholder="0"
                  value={receiveAmount}
                  disabled={comingSoon}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setLastEdited('receive');
                  }}
                  className="w-0 flex-1 bg-transparent text-[32px] font-bold text-[#1C1C1C] placeholder:text-gray-200 focus:outline-none min-w-0 disabled:opacity-50"
                />
                <button
                  onClick={() => setIsCurrencySheetOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E1EFFF] rounded-full text-[#2261FE] font-bold text-[13px] whitespace-nowrap border border-[#2261FE]/10 min-w-[120px] justify-center"
                >
                  {CURRENCIES.find((c) => c.code === currency) && (
                    <span className="text-[16px]">
                      {CURRENCIES.find((c) => c.code === currency)?.flag}
                    </span>
                  )}
                  {currency || 'Choose currency'}
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-2 w-full max-w-[389px]">
          <div className="flex items-center justify-between">
            <span className="text-[#888888] text-[15px] font-medium">Fees</span>
            <span className="text-[#1C1C1C] text-[15px] font-bold">
              {comingSoon
                ? '—'
                : quote?.spread_bps
                  ? `${(quote.spread_bps / 100).toFixed(2)}%`
                  : '0.75%'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#888888] text-[15px] font-medium">Exchange rate</span>
            <span className="text-[#1C1C1C] text-[15px] font-bold">
              {comingSoon
                ? 'Coming soon'
                : isLoadingRate
                  ? 'Updating...'
                  : rate
                    ? `1 ${token} = ${rate.toLocaleString()} ${currency}`
                    : '-'}
            </span>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="mt-12 w-full flex justify-center px-[20px]">
          <button
            onClick={() => {
              if (!canChoosePayment) return;
              setIsPaymentMethodSheetOpen(true);
            }}
            disabled={!canChoosePayment}
            className="w-full max-w-[390px] rounded-[15px] border-2 border-dashed border-[#89C1FF] bg-white flex flex-col items-center justify-center gap-1 hover:bg-[#F8FBFF] transition-colors group active:scale-[0.99] duration-200 disabled:opacity-50 disabled:pointer-events-none"
            style={{ height: '126px' }}
          >
            <span className="text-[#1C1C1C] text-[18px] font-bold group-hover:text-[#2261FE]">
              {comingSoon
                ? 'Coming soon'
                : belowMinimum
                  ? `Minimum send is $${MIN_SEND_USD}`
                  : 'Choose payment method'}
            </span>
            <span className="text-[#888888] text-[14px] font-medium">
              {comingSoon
                ? `${currency} payouts are not available yet`
                : belowMinimum
                  ? 'Enter at least $1 to continue'
                  : 'Bank account or mobile money'}
            </span>
          </button>
        </div>
      </div>

      {/* Selection Sheets */}
      <SelectionSheet
        isOpen={isTokenSheetOpen}
        onClose={() => setIsTokenSheetOpen(false)}
        title="Select token"
      >
        <div className="space-y-1">
          {TOKENS.map((t) => {
            const bal = tokenBalances[t.symbol] ?? 0;
            const supported = t.bankSupported;
            return (
              <button
                key={t.symbol}
                disabled={!supported}
                onClick={() => {
                  if (!supported) return;
                  tokenTouchedRef.current = true;
                  setToken(t.symbol);
                  setIsTokenSheetOpen(false);
                }}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-55 disabled:hover:bg-transparent"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                    <img src={t.icon} alt="" className="w-7 h-7 object-contain" />
                  </div>
                  <div className="text-left">
                    <span
                      className={`text-[17px] font-bold ${
                        token === t.symbol ? 'text-[#2261FE]' : 'text-[#1C1C1C]'
                      }`}
                    >
                      {t.symbol}
                    </span>
                    <p className="text-[13px] text-[#888888] font-medium">
                      {supported
                        ? `$${bal.toFixed(2)}`
                        : 'Coming soon'}
                    </p>
                  </div>
                </div>
                {token === t.symbol && supported && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#2261FE]" />
                )}
                {!supported && (
                  <span className="text-[12px] font-semibold text-[#888888]">Coming soon</span>
                )}
              </button>
            );
          })}
        </div>
      </SelectionSheet>

      <SelectionSheet
        isOpen={isCurrencySheetOpen}
        onClose={() => setIsCurrencySheetOpen(false)}
        title="Select currency"
      >
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setCurrency(c.code);
                setIsCurrencySheetOpen(false);
              }}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-[24px]">
                  {c.flag}
                </div>
                <div className="text-left">
                  <p
                    className={`text-[17px] font-bold ${currency === c.code ? 'text-[#2261FE]' : 'text-[#1C1C1C]'}`}
                  >
                    {c.code}
                  </p>
                  <p className="text-[13px] text-[#888888] font-medium">{c.name}</p>
                </div>
              </div>
              {currency === c.code && <div className="w-2.5 h-2.5 rounded-full bg-[#2261FE]" />}
            </button>
          ))}
        </div>
      </SelectionSheet>

      {/* Payment Method Sheet */}
      <SelectionSheet
        isOpen={isPaymentMethodSheetOpen}
        onClose={() => setIsPaymentMethodSheetOpen(false)}
        title={savedRecipients.length > 0 ? 'Choose payment method' : 'Add payment method'}
      >
        <div className="px-6 flex flex-col items-center">
          <div className="flex gap-2 w-full mb-6">
            <button
              onClick={() => setPaymentType('bank')}
              className={`flex-1 py-3 px-4 rounded-full text-[14px] font-bold transition-all duration-200 border ${
                paymentType === 'bank'
                  ? 'bg-[#E1EFFF] text-[#2261FE] border-[#2261FE]/20'
                  : 'bg-white text-gray-400 border-gray-100'
              }`}
            >
              Bank account
            </button>
            <button
              onClick={() => setPaymentType('mobile')}
              className={`flex-1 py-3 px-4 rounded-full text-[14px] font-bold transition-all duration-200 border ${
                paymentType === 'mobile'
                  ? 'bg-[#E1EFFF] text-[#2261FE] border-[#2261FE]/20'
                  : 'bg-white text-gray-400 border-gray-100'
              }`}
            >
              Mobile money
            </button>
          </div>

          {isLoadingRecipients ? (
            <p className="py-10 text-[15px] font-medium text-[#888888]">Loading accounts…</p>
          ) : savedRecipients.length === 0 ? (
            <div className="flex w-full flex-col items-center justify-center py-6">
              <img
                src="/non added.svg"
                alt="No payment methods"
                className="mb-6 h-auto w-[240px] max-w-full opacity-90"
              />
              <p className="text-center text-[16px] font-medium text-[#888888]">
                No payment method added yet
              </p>
            </div>
          ) : (
            <div className="mb-4 max-h-[40dvh] w-full space-y-2 overflow-y-auto">
              {savedRecipients.map((row) => (
                <div
                  key={row.id}
                  className="flex w-full items-center gap-2 rounded-[16px] border border-gray-100 bg-[#F8FBFF]"
                >
                  <button
                    type="button"
                    onClick={() => selectSavedRecipient(row)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[#E1EFFF]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E1EFFF] text-[14px] font-bold text-[#2261FE]">
                      {row.institutionName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-[#1C1C1C]">
                        {row.accountName}
                      </p>
                      <p className="truncate text-[13px] font-medium text-[#888888]">
                        {row.institutionName} · ···{row.accountIdentifier.slice(-4)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${row.accountName}`}
                    disabled={removingId === row.id}
                    onClick={(e) => void removeSavedRecipient(row, e)}
                    className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#888888] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={goToAddAccount}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-[#2261FE]/10 bg-[#E1EFFF] py-4 text-[16px] font-bold text-[#2261FE] transition-colors hover:bg-[#D1E5FF]"
          >
            {savedRecipients.length > 0 ? 'Add another' : 'Add account'} <Plus size={20} />
          </button>
        </div>
      </SelectionSheet>
    </div>
  );
}

// Internal SelectionSheet component
function SelectionSheet({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-[430px] bg-white rounded-t-[40px] pt-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="flex justify-between items-center px-6 mb-6">
          <h2 className="text-[20px] font-bold text-[#1C1C1C]">{title}</h2>
          <button onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-500">
            <X size={20} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
