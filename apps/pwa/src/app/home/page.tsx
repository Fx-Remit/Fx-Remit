'use client';

import { ArrowUpRight, Bell, Eye, EyeOff, FileText, Home, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CashOutSheet } from '../cash-out/CashOutSheet';

const MOCK_USER = {
  name: 'Callme_stone',
  avatar: 'https://api.dicebear.com/8.x/lorelei/svg?seed=callme_stone&backgroundColor=b6e3f4',
  balance: '897.00',
};

const MOCK_TRANSACTIONS = [
  {
    id: 'tx1',
    type: 'sent',
    label: 'You sent money',
    address: '0x1a8F...bee650',
    amount: '230.86',
    currency: 'cKES',
    date: 'Today, 4:22 PM',
  },
  {
    id: 'tx2',
    type: 'received',
    label: 'You received USDC',
    address: '0xB3c2...4f91',
    amount: '+150.00',
    currency: 'USDC',
    date: 'Yesterday, 10:11 AM',
  },
];

export default function HomePage() {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [cashOutOpen, setCashOutOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafd] pb-28">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={MOCK_USER.avatar}
            alt={MOCK_USER.name}
            className="w-12 h-12 rounded-full border-2 border-blue-100 bg-blue-50"
          />
          <div>
            <p className="font-bold text-gray-900 text-[16px] leading-tight">{MOCK_USER.name}</p>
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
                  {balanceVisible ? `$${MOCK_USER.balance}` : '••••••'}
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
            <button className="text-blue-500 text-sm font-medium hover:underline">See all</button>
          </div>

          <div className="bg-white rounded-3xl shadow-sm overflow-hidden divide-y divide-gray-50">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {MOCK_TRANSACTIONS.map((tx) => (
              <div key={tx.id} className="flex items-center gap-4 px-4 py-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    tx.type === 'sent' ? 'bg-red-50' : 'bg-green-50'
                  }`}
                >
                  {tx.type === 'sent' ? (
                    <ArrowUpRight size={22} className="text-red-500 rotate-0" />
                  ) : (
                    <ArrowUpRight size={22} className="text-green-500 rotate-180" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-[15px] truncate">{tx.label}</p>
                  <p className="text-gray-400 text-sm truncate">{tx.address}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-gray-900 text-[15px]">
                    {tx.amount} {tx.currency}
                  </p>
                  <p className="text-gray-400 text-xs">{tx.date}</p>
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
