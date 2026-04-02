"use client";

import { X, Copy, ExternalLink, Check, Clock, AlertCircle } from "lucide-react";
import React from "react";

interface TransactionDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: {
    id: string;
    type: string;
    pair: string;
    date: string;
    status: "completed" | "pending" | "failed";
    sentAmount: string;
    sentToken: string;
    receivedAmount: string;
    receivedToken: string;
    orderId?: string;
    network?: string;
    provider?: string;
    rate?: string;
  } | null;
}

export function TransactionDetailSheet({
  isOpen,
  onClose,
  transaction
}: TransactionDetailSheetProps) {
  if (!isOpen || !transaction) return null;

  // Mock data for missing fields if not provided
  const orderId = transaction.orderId || "FX-" + Math.random().toString(36).substr(2, 9).toUpperCase();
  const network = transaction.network || "Celo Network";
  const provider = transaction.provider || "YellowCard";
  const rate = transaction.rate || "1 USDT = 1,460 NGN";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Add a toast notification here in the future
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
          onClick={onClose}
        />

        {/* Sheet Container */}
        <div
          className="relative flex flex-col animate-in slide-in-from-bottom duration-300 bg-[#F8F9FB] rounded-t-[30px] w-full max-w-[430px] overflow-hidden"
          style={{ height: '85vh', maxHeight: '90vh' }}
        >
          {/* Sticky Header Section */}
          <div className="sticky top-0 z-50 bg-[#F8F9FB] pt-4 pb-2 px-5 w-full flex flex-col items-center">
            {/* Drag handle */}
            <div className="flex justify-center mb-6">
              <div className="w-12 h-1.5 bg-gray-300/40 rounded-full" />
            </div>

            {/* Header Title */}
            <div className="w-full flex justify-between items-center mb-4 px-2">
              <h2 className="text-[20px] font-bold text-[#1C1C1C]">Transaction Details</h2>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Subtle separator when content scrolls under */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gray-100/50" />
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto px-5 pb-12 pt-2 scrollbar-hide">
            {/* Amount Card */}
            <div className="w-full bg-white rounded-[25px] p-6 sm:p-8 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] border border-gray-100 mb-6 flex flex-col items-center">
              <p className="text-[#6D6D6D] text-[15px] sm:text-[16px] font-medium mb-2 text-center">Total amount sent</p>
              <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1C1C1C] mb-6 text-center leading-tight">
                {transaction.sentAmount}{transaction.sentToken}
              </h1>

              {/* Fluid Progress Tracker */}
              <div className="w-full pt-4 flex items-center justify-between relative px-2 sm:px-4 mt-2">
                {/* Progress Line Background */}
                <div className="absolute top-[18px] left-[15%] right-[15%] h-[2px] bg-gray-100 -z-0" />
                
                {/* Progress Line Active */}
                <div 
                  className="absolute top-[18px] left-[15%] h-[2px] bg-[#2261FE] transition-all duration-1000 origin-left ease-out"
                  style={{ 
                    width: transaction.status === 'completed' 
                      ? '70%' 
                      : transaction.status === 'pending' 
                      ? '35%' 
                      : '0%' 
                  }}
                />

                {/* Steps */}
                <div className="flex flex-col items-center gap-2 relative z-10 w-1/3">
                  <div className="w-9 h-9 rounded-full bg-[#2261FE] flex items-center justify-center text-white shadow-lg shadow-[#2261FE]/20">
                    <Check size={18} strokeWidth={3} />
                  </div>
                  <span className="text-[11px] sm:text-[12px] font-bold text-[#1C1C1C] whitespace-nowrap">Initiated</span>
                </div>

                <div className="flex flex-col items-center gap-2 relative z-10 w-1/3 text-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                    transaction.status === 'completed' 
                      ? "bg-[#2261FE] border-[#2261FE] text-white" 
                      : transaction.status === 'pending'
                      ? "bg-white border-[#2261FE] text-[#2261FE]"
                      : "bg-white border-gray-100 text-gray-300"
                  }`}>
                    {transaction.status === 'completed' ? <Check size={18} strokeWidth={3} /> : <Clock size={18} />}
                  </div>
                  <span className={`text-[11px] sm:text-[12px] font-bold ${
                    transaction.status === 'pending' || transaction.status === 'completed' ? "text-[#1C1C1C]" : "text-gray-300"
                  } whitespace-nowrap`}>Processing</span>
                </div>

                <div className="flex flex-col items-center gap-2 relative z-10 w-1/3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                    transaction.status === 'completed' 
                      ? "bg-[#2261FE] border-[#2261FE] text-white" 
                      : transaction.status === 'failed'
                      ? "bg-red-50 border-red-500 text-red-500"
                      : "bg-white border-gray-100 text-gray-300"
                  }`}>
                    {transaction.status === 'completed' ? <Check size={18} strokeWidth={3} /> : transaction.status === 'failed' ? <AlertCircle size={18} /> : <Clock size={18} />}
                  </div>
                  <span className={`text-[11px] sm:text-[12px] font-bold ${
                    transaction.status === 'completed' ? "text-[#1C1C1C]" : transaction.status === 'failed' ? "text-red-500" : "text-gray-300"
                  } whitespace-nowrap`}>{transaction.status === 'failed' ? "Failed" : "Success"}</span>
                </div>
              </div>
            </div>

            {/* Details Card */}
            <div className="w-full bg-white rounded-[25px] p-6 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] border border-gray-100 space-y-6">
              <DetailRow 
                label="Order ID" 
                value={transaction.orderId || "FX-RANDOM"} 
                onCopy={() => transaction.orderId ? navigator.clipboard.writeText(transaction.orderId) : null}
              />
              <DetailRow 
                label="Exchange rate" 
                value={transaction.rate || "1 USDT = 1,460 NGN"} 
              />
              <DetailRow 
                label="Recipient gets" 
                value={`${transaction.receivedToken}${transaction.receivedAmount} only`} 
                isBold 
              />
              <DetailRow 
                label="Network" 
                value={transaction.network || "Celo Network"} 
                showIcon 
              />
              <DetailRow 
                label="Off-ramp Provider" 
                value={transaction.provider || "YellowCard"} 
              />
            </div>

            {/* Action Buttons */}
            <div className="w-full mt-10 space-y-4">
              <button
                className="w-full h-[65px] bg-[#2261FE] text-white rounded-[12px] text-[18px] font-bold shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <ExternalLink size={20} />
                View on Scan
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({ 
  label, 
  value, 
  onCopy, 
  isBold, 
  showIcon 
}: { 
  label: string; 
  value: string; 
  onCopy?: () => void;
  isBold?: boolean;
  showIcon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#888888] text-[15px] font-medium">{label}</span>
      <div className="flex items-center gap-2 max-w-[60%]">
        {showIcon && <img src="/celo.svg" alt="" className="w-5 h-5 rounded-full" />}
        <span className={`${isBold ? 'text-[#1C1C1C] font-bold' : 'text-[#3D3D3D] font-semibold'} text-[15px] truncate`}>
          {value}
        </span>
        {onCopy && (
          <button onClick={onCopy} className="text-blue-500 hover:text-blue-600 transition-colors">
            <Copy size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
