"use client";

import { X } from "lucide-react";
import React, { useState } from "react";
import Link from "next/link";

interface ConfirmTransactionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  sendAmount: string;
  receiveAmount: number;
  token: string;
  currency: string;
  accNum: string;
  accName: string;
  bankName: string;
}

export function ConfirmTransactionSheet({
  isOpen,
  onClose,
  sendAmount,
  receiveAmount,
  token,
  currency,
  accNum,
  accName,
  bankName
}: ConfirmTransactionSheetProps) {
  const [status, setStatus] = useState<"idle" | "processing" | "success">("idle");

  if (!isOpen) return null;

  // Calculations (1.0% fee)
  const feePercent = 1.0;
  const netAmount = receiveAmount * (1 - feePercent / 100);
  const currencyName = currency === "NGN" ? "Naira" : currency;

  // Dynamic Name Logic
  const firstName = accName.split(" ")[0];

  const handleSend = () => {
    setStatus("processing");
    setTimeout(() => {
      setStatus("success");
    }, 2500);
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
          onClick={status === "idle" ? onClose : undefined}
        />

        {/* Sheet Container */}
        <div
          className="relative flex flex-col items-center pb-12 pt-4 px-5 animate-in slide-in-from-bottom duration-300 bg-[#F8F9FB] rounded-t-[20px]"
          style={{ width: '430px', height: '738px', margin: "0 auto" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center mb-5">
            <div className="w-12 h-1 bg-gray-300/30 rounded-full" />
          </div>

          {/* Transaction Detail Card */}
          <div 
            className="bg-white rounded-[20px] overflow-hidden shadow-[0px_4px_25px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col relative mb-4"
            style={{ width: '390px', height: '480px', paddingTop: '15px' }}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              disabled={status !== "idle"}
              className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-30"
            >
              <X size={20} />
            </button>

            {/* Title */}
            <div className="text-center px-6 pb-4 border-b border-gray-200/60">
              <h2 className="text-[18px] font-[600] text-[#1C1C1C] leading-none text-center">
                Confirm transaction
              </h2>
            </div>

            <div className="flex flex-col flex-1 px-6">
              {/* Total Amount Section */}
              <div className="flex flex-col items-center justify-center py-8 border-b border-gray-200/60">
                <p className="text-[#4F4F4F] text-[14px] font-[500] leading-none mb-4">Total amount</p>
                <h1 className="text-[36px] font-[500] text-[#1C1C1C] leading-none text-center">
                  ${sendAmount}
                </h1>
              </div>

              {/* Details List */}
              <div className="flex-1 flex flex-col items-center justify-center py-6 gap-6">
                <DetailRow label="Recipient" value={accName} />
                <DetailRow label="Account no" value={accNum} />
                <div className="flex items-center justify-between" style={{ width: '350px', height: '17px' }}>
                  <span className="text-[#888888] text-[14px] font-[500] leading-none">Bank</span>
                  <div className="flex items-center gap-2">
                    <div className="w-[20px] h-[20px] rounded-full overflow-hidden flex items-center justify-center">
                      <img src="/bank icon.svg" alt="Bank" className="w-[20px] h-[20px]" />
                    </div>
                    <span className="text-[#3D3D3D] text-[14px] font-[500] leading-none">{bankName}</span>
                  </div>
                </div>
                <DetailRow 
                  label={`Amount in ${currency}`} 
                  value={`${receiveAmount.toLocaleString()} ${currencyName} only`} 
                />
                <DetailRow label="Processing fee" value="1.0%" />
                <DetailRow 
                  label="Recipient gets" 
                  value={`${netAmount.toLocaleString()} ${currencyName} only`} 
                  isHighlight 
                />
              </div>
            </div>
          </div>

          {/* Action Buttons (Outside the detail card) */}
          <div className="w-[390px] max-w-full space-y-4 mt-auto">
            <button
              onClick={handleSend}
              disabled={status !== "idle"}
              className="w-full h-[65px] bg-[#2261FE] text-white rounded-[7px] text-[18px] font-bold shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
            >
              Send
            </button>
            <button
              onClick={onClose}
              disabled={status !== "idle"}
              className="w-full h-[65px] bg-white text-[#2261FE] border-2 border-[#2261FE]/10 rounded-[7px] text-[18px] font-bold active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
            >
              Edit details
            </button>
          </div>
        </div>
      </div>

      {/* Processing State Overlay */}
      {status === "processing" && (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-[430px] flex flex-col items-center">
            <div className="mb-12">
              <h2 className="text-[24px] font-bold text-[#1C1C1C]">Sending...</h2>
            </div>
            <div className="mt-10 mb-20">
              <div className="w-16 h-16 border-4 border-[#2261FE]/20 border-t-[#2261FE] rounded-full animate-spin" />
            </div>
          </div>
        </div>
      )}

      {/* Success State Overlay */}
      {status === "success" && (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div 
            className="bg-white rounded-[20px] p-8 flex flex-col items-center relative shadow-[0px_4px_30px_rgba(0,0,0,0.05)] border border-gray-100 translate-y-[-20px]"
            style={{ width: '392px', height: '449px' }}
          >
            <div className="w-full flex justify-between items-center mb-6">
              <h2 className="text-[22px] font-bold text-[#1C1C1C]">Success!</h2>
              <Link href="/home" className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors">
                <X size={20} className="text-gray-400" />
              </Link>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-[80px] h-[80px] bg-green-50 rounded-full flex items-center justify-center mb-8">
                <div className="w-[40px] h-[40px] bg-green-500 rounded-full flex items-center justify-center text-white">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>

              <h3 
                className="font-[700] leading-[120%] text-center px-4 mb-4"
                style={{ color: '#464446', fontSize: '24px' }}
              >
                You have successfully sent money to {firstName}
              </h3>

              <p className="text-[#888888] text-[15px] font-medium max-w-[280px]">
                The transaction is being processed. It should reflect in {firstName}'s account shortly.
              </p>
            </div>

            <div className="w-full mt-8">
              <Link
                href="/home"
                className="w-full h-[65px] bg-[#2261FE] text-white font-bold text-[18px] flex items-center justify-center rounded-[7px] shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value, isHighlight }: { label: string; value: string; isHighlight?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ width: '350px', height: '17px' }}>
      <span className="text-[#888888] text-[14px] font-[500] leading-none">{label}</span>
      <span className="text-[#3D3D3D] text-[14px] font-[500] leading-none truncate ml-4">
        {value}
      </span>
    </div>
  );
}
