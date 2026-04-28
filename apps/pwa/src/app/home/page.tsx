'use client';

import { ArrowUpRight, Bell, Eye, EyeOff, FileText, Home, User } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { CashOutSheet } from '../cash-out/CashOutSheet';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { useQuery } from '@tanstack/react-query';

export default function HomePage() {
  const { user: privyUser, ready, authenticated, getAccessToken } = usePrivy();
  const { profile: dbUser, isLoading: storeLoading, isHydrated } = useUserStore();

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['transaction-history', dbUser?.id],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch('/api/user/history?limit=10', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `History fetch failed: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!dbUser?.id && !!authenticated,
    retry: 1,
  });

  const transactions = historyData?.transactions || [];

  const [balanceVisible, setBalanceVisible] = useState(true);
  const [cashOutOpen, setCashOutOpen] = useState(false);

  const loading = !ready || !isHydrated || (authenticated && storeLoading && !dbUser);

  const displayName = dbUser?.displayName || dbUser?.fullName || privyUser?.id?.slice(0, 10);
  const avatar = dbUser?.avatarUrl || `https://api.dicebear.com/8.x/lorelei/svg?seed=${privyUser?.id}&backgroundColor=b6e3f4`;

  const balance = (dbUser as any)?.walletBalance?.toString() || '0.00';

  return (
    <div className="min-h-screen bg-[#f8fafd] pb-28">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={avatar}
              alt={displayName}
              className="w-12 h-12 rounded-full border-2 border-blue-100 bg-blue-50 object-cover"
            />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-[16px] leading-tight">
              {loading ? 'Loading...' : displayName}
            </p>
            <p className="text-gray-400 text-sm">Welcome back 👋</p>
          </div>
        </div>
        <button className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shadow-sm hover:bg-blue-100 transition-colors">
          <Bell size={20} />
        </button>
      </div>

      <div className="px-5 pt-6 space-y-8">
        {/* Balance Card */}
        <div
          className="relative overflow-hidden"
          style={{
            width: '100%',
            height: '166px',
            borderRadius: '15px',
            background: 'linear-gradient(180deg, #2261FE 0%, #143A98 154.82%)',
            boxShadow: '7px -5px 4px 0px #BBCFFF5C inset',
          }}
        >
          {/* bg.svg — full card background texture */}
          <img
            src="/bg.svg"
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            style={{ opacity: 1 }}
          />

          {/* img pattern.svg — right-side decorative pattern */}
          <img
            src="/img pattern.svg"
            alt=""
            aria-hidden
            className="absolute pointer-events-none select-none"
            style={{
              left: '226px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '253.59px',
              height: '288.99px',
            }}
          />

          {/* Card content */}
          <div className="relative z-10 p-5 flex flex-col justify-center h-full">
            {/* Balance group */}
            <div
              style={{
                width: '220px',
                height: '81px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <p className="text-blue-100 text-sm font-medium leading-none">Current balance</p>
              <div className="flex items-center gap-2">
                <span
                  className="tracking-tight"
                  style={{
                    fontSize: '46px',
                    fontWeight: 500,
                    lineHeight: '100%',
                    color: '#F6F6F6',
                  }}
                >
                  {balanceVisible ? `$${balance}` : '•••••'}
                </span>
                <button
                  onClick={() => setBalanceVisible((v) => !v)}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors flex-shrink-0"
                >
                  {balanceVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/add-cash"
            className="flex-1 h-[50px] bg-[#D8E9FF] rounded-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <img src="/add cash.svg" alt="" width={20} height={20} />
            <span className="font-semibold text-[#2261FE] text-sm whitespace-nowrap">Add cash</span>
          </Link>
          <button
            onClick={() => setCashOutOpen(true)}
            className="flex-1 h-[50px] bg-[#D8E9FF] rounded-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <img src="/cash out.svg" alt="" width={20} height={20} />
            <span className="font-semibold text-[#2261FE] text-sm whitespace-nowrap">Cash out</span>
          </button>
        </div>

        {/* Promo Banner */}
        <div className="w-full h-auto rounded-3xl overflow-hidden shadow-sm">
          <img
            src="/instant.svg"
            alt="Instant, Global and Secure"
            className="w-full h-auto object-cover"
          />
        </div>

        {/* Transaction History */}
        <div>
          <div className="flex items-center justify-between mb-3 mt-2">
            <h2 className="font-bold text-gray-900 text-lg">Transaction history</h2>
            <Link href="/history" className="text-blue-500 text-sm font-medium hover:underline">See all</Link>
          </div>

          <div className="bg-white rounded-3xl shadow-sm overflow-hidden divide-y divide-gray-50">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {historyLoading && (
              <div className="py-8 text-center text-gray-400 text-sm">Loading transactions...</div>
            )}

            {!historyLoading && transactions.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">No transactions yet</div>
            )}

            {transactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center gap-4 px-4 py-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    tx.status === 'FAILED' ? 'bg-red-50' : 'bg-green-50'
                  }`}
                >
                  <ArrowUpRight 
                    size={22} 
                    className={`${tx.status === 'FAILED' ? 'text-red-400' : 'text-blue-500'} rotate-0`} 
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-[15px] truncate">
                    {tx.recipientName ? `Sent to ${tx.recipientName}` : 'Remittance Sent'}
                  </p>
                  <p className="text-gray-400 text-sm truncate">
                    {tx.txHash ? `${tx.txHash.slice(0, 6)}...${tx.txHash.slice(-4)}` : 'Processing...'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-gray-900 text-[15px]">
                    ${Number(tx.amountUsd).toFixed(2)}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {new Date(tx.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-5 flex justify-center">
        <div
          className="w-full max-w-[320px] bg-[#D8E9FF] rounded-[70px] py-[15px] px-[30px] flex items-center justify-between shadow-[0px_4px_4px_0px_#00000040]"
          style={{ height: '75px' }}
        >
          <Link href="/home" className="flex flex-col items-center gap-1 text-[#1C1C1C]">
            <Home size={28} />
            <span className="font-semibold text-[13px]">Home</span>
          </Link>
          <Link
            href="/history"
            className="flex flex-col items-center gap-1 text-[#1C1C1C]/40 hover:text-[#1C1C1C] transition-colors"
          >
            <FileText size={28} />
            <span className="font-semibold text-[13px]">History</span>
          </Link>
          <Link
            href="/profile"
            className="flex flex-col items-center gap-1 text-[#1C1C1C]/40 hover:text-[#1C1C1C] transition-colors"
          >
            <User size={28} />
            <span className="font-semibold text-[13px]">Profile</span>
          </Link>
        </div>
      </div>

      <CashOutSheet isOpen={cashOutOpen} onClose={() => setCashOutOpen(false)} />
    </div>
  );
}
