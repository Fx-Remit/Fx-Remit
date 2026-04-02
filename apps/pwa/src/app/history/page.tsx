"use client";

import { Home, FileText, User, Clock, FileSearch } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TransactionDetailSheet } from "./TransactionDetailSheet";

type TransactionStatus = "All" | "Completed" | "Pending" | "Failed";

interface Transaction {
  id: string;
  type: string;
  pair: string;
  date: string;
  status: "completed" | "pending" | "failed";
  sentAmount: string;
  sentToken: string;
  receivedAmount: string;
  receivedToken: string;
}

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "1",
    type: "Withdrawal",
    pair: "USDT - KSh",
    date: "22/04/2025",
    status: "completed",
    sentAmount: "-$20",
    sentToken: "USDT",
    receivedAmount: "8.90",
    receivedToken: "cKES",
  },
  {
    id: "2",
    type: "Withdrawal",
    pair: "cUSD - cKES",
    date: "22/04/2025",
    status: "failed",
    sentAmount: "$0.07",
    sentToken: "cUSD",
    receivedAmount: "8.90",
    receivedToken: "cKES",
  },
  {
    id: "3",
    type: "Withdrawal",
    pair: "USDT - KSh",
    date: "22/04/2025",
    status: "completed",
    sentAmount: "-$20",
    sentToken: "USDT",
    receivedAmount: "8.90",
    receivedToken: "cKES",
  },
  {
    id: "4",
    type: "Withdrawal",
    pair: "USDC - UGX",
    date: "21/04/2025",
    status: "pending",
    sentAmount: "-$150",
    sentToken: "USDC",
    receivedAmount: "560,000",
    receivedToken: "UGX",
  },
];

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<TransactionStatus>("All");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const filteredTransactions = MOCK_TRANSACTIONS.filter((tx) => {
    if (activeTab === "All") return true;
    return tx.status.toLowerCase() === activeTab.toLowerCase().trim();
  });

  const handleTransactionClick = (tx: Transaction) => {
    setSelectedTransaction(tx);
    setIsDetailOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#f8fafd] flex flex-col items-center">
      <div className="w-full max-w-[430px] flex flex-col min-h-screen bg-[#f8fafd] relative">
        <div className="fixed top-0 z-40 w-full max-w-[430px] bg-[#f8fafd] pt-12 pb-4 px-5 flex flex-col items-center border-b border-gray-100/50">
          <h1 className="text-[20px] font-bold text-[#1C1C1C] mb-6">History</h1>

          {/* Tabs */}
          <div className="flex w-full items-center">
            {(["All", "Completed", "Pending", "Failed"] as TransactionStatus[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex flex-col items-center pb-3 px-1 relative transition-all ${activeTab === tab ? "text-[#1C1C1C] font-bold" : "text-[#888888] font-medium"
                  }`}
              >
                <span className="text-[14px] sm:text-[16px] capitalize whitespace-nowrap">{tab === "All" ? "All" : tab}</span>
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#2261FE] rounded-full animate-in fade-in slide-in-from-bottom-1" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[180px] w-full" />

        {/* Transaction List Card (Scrollable Area) */}
        <div
          className="w-full max-w-[390px] mx-auto bg-white rounded-[15px] shadow-[0px_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/50 mb-32 z-0"
          style={{ minHeight: '816px' }}
        >
          <div className="px-6 py-8 space-y-8">
            {filteredTransactions.map((tx) => (
              <button
                key={tx.id}
                onClick={() => handleTransactionClick(tx)}
                className="w-full flex justify-between items-start pb-8 border-b border-[#00000033] last:border-0 last:pb-0 gap-4 text-left active:opacity-70 transition-opacity"
              >
                {/* Left Side */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <p className="text-[#05050580] text-[16px] font-semibold leading-none">{tx.type}</p>
                  <h3 className="text-[#1C1C1C] text-[18px] font-medium leading-none">{tx.pair}</h3>
                  <p className="text-[#05050580] text-[16px] font-semibold leading-none pt-2">{tx.date}</p>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-1.5 pt-4">
                    {tx.status === "completed" && (
                      <>
                        <div className="w-[18px] h-[18px] rounded-md bg-[#EBF9F1] flex items-center justify-center border border-[#27A227]/20">
                          <div className="w-1.5 h-2.5 border-r-2 border-b-2 border-[#27A227] rotate-45 mb-0.5" />
                        </div>
                        <span className="text-[#27A227] text-[18px] font-semibold leading-none">Completed</span>
                      </>
                    )}
                    {tx.status === "failed" && (
                      <>
                        <div className="w-[18px] h-[18px] rounded-md bg-red-50 flex items-center justify-center border border-red-100">
                          <span className="text-red-500 font-bold text-[10px]">✕</span>
                        </div>
                        <span className="text-red-500 text-[18px] font-semibold leading-none">Failed</span>
                      </>
                    )}
                    {tx.status === "pending" && (
                      <>
                        <div className="w-[18px] h-[18px] rounded-md bg-yellow-50 flex items-center justify-center border border-yellow-100">
                          <Clock size={12} className="text-yellow-600" />
                        </div>
                        <span className="text-yellow-600 text-[18px] font-semibold leading-none">Pending</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Side */}
                <div className="text-right space-y-2">
                  <div className="space-y-1">
                    <p className="text-[#6D6D6D] text-[16px] font-normal leading-none">You sent</p>
                    <p className="text-[#1C1C1C] text-[18px] font-semibold leading-none">{tx.sentAmount}{tx.sentToken}</p>
                  </div>
                  <div className="pt-4 space-y-1">
                    <p className="text-[#6D6D6D] text-[16px] font-normal leading-none">They receive</p>
                    <p className="text-[#1C1C1C] text-[18px] font-semibold leading-none font-inter">{tx.receivedToken}{tx.receivedAmount}</p>
                  </div>
                </div>
              </button>
            ))}

            {filteredTransactions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 opacity-30">
                <FileText size={60} strokeWidth={1} />
                <p className="mt-4 font-medium">No transactions found</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-5 flex justify-center max-w-[430px]">
          <div
            className="w-full max-w-[320px] bg-[#D8E9FF] rounded-[70px] py-[15px] px-[30px] flex items-center justify-between shadow-[0px_4px_4px_0px_#00000040]"
            style={{ height: "75px" }}
          >
            <Link
              href="/home"
              className="flex flex-col items-center gap-1 text-[#1C1C1C]/40 hover:text-[#1C1C1C] transition-colors"
            >
              <Home size={28} />
              <span className="font-semibold text-[13px]">Home</span>
            </Link>
            <Link
              href="/history"
              className="flex flex-col items-center gap-1 text-[#1C1C1C]"
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
      </div>

      {/* Transaction Detail Sheet (Moved outside constrained relative parent) */}
      <TransactionDetailSheet
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        transaction={selectedTransaction}
      />
    </div>
  );
}
