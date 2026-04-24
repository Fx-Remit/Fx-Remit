'use client';

import React from 'react';
import { ArrowLeft, ArrowUpRight, Search, Filter } from 'lucide-react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { useQuery } from '@tanstack/react-query';

export default function HistoryPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const { profile: dbUser } = useUserStore();

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['transaction-history-full', dbUser?.id],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch('/api/user/history?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.json();
    },
    enabled: !!dbUser?.id && !!authenticated,
  });

  const transactions = historyData?.transactions || [];

  return (
    <div className="min-h-screen bg-[#F8FAFD] flex flex-col">
      {/* Header */}
      <div className="pt-16 px-6 pb-6 bg-white shrink-0">
        <div className="flex items-center justify-between mb-6">
          <Link 
            href="/home" 
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-[#1C1C1C]" />
          </Link>
          <h1 className="text-[20px] font-bold text-[#1C1C1C]">Transaction History</h1>
          <div className="w-10" />
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search transactions..."
            className="w-full bg-gray-50 border-none rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm font-medium">Fetching your history...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
              <FileText size={40} />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-gray-900">No transactions yet</h3>
              <p className="text-gray-400 text-sm max-w-[200px]">Your remittance activities will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Grouped by Date (Simplified list for now) */}
            <div className="bg-white rounded-[32px] shadow-sm border border-gray-100/50 overflow-hidden divide-y divide-gray-50">
              {transactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center gap-4 px-5 py-5 hover:bg-gray-50 transition-colors pointer-events-auto">
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
                    <p className="font-bold text-gray-900 text-[16px] truncate">
                      {tx.recipientName ? `Sent to ${tx.recipientName}` : 'Remittance Sent'}
                    </p>
                    <div className="flex items-center gap-2">
                       <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                         tx.status === 'COMPLETED' ? 'bg-green-100 text-green-600' : 
                         tx.status === 'FAILED' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                       }`}>
                         {tx.status}
                       </span>
                       <p className="text-gray-400 text-xs truncate">
                         {tx.txHash ? `${tx.txHash.slice(0, 10)}...` : 'Pending broadcast'}
                       </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900 text-[16px]">
                      ${Number(tx.amountUsd).toFixed(2)}
                    </p>
                    <p className="text-gray-400 text-[12px] font-medium">
                      {new Date(tx.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Icon surrogate since Lucide-react FileText was missing in imports
const FileText = ({ size, className }: { size: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);
