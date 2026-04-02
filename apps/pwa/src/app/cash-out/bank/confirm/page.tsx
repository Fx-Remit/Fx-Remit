"use client";

import { ChevronLeft, ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ConfirmTransactionSheet } from "./ConfirmTransactionSheet";

function CashOutConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isConfirmSheetOpen, setIsConfirmSheetOpen] = useState(false);

  const sendAmount = searchParams.get("send") || "0";
  const receiveAmount = searchParams.get("receive") || "0";
  const token = searchParams.get("token") || "USDT";
  const currency = searchParams.get("currency") || "NGN";

  const accountNumber = searchParams.get("accNum") || "0000000000";
  const accountName = searchParams.get("accName") || "Account Owner";
  const bankName = searchParams.get("bank") || "Bank Name";
  const type = searchParams.get("type") || "bank";

  const isBank = type === "bank";

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50 bg-white">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-bold text-[#1C1C1C]">
          Cash out
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center pt-8 overflow-y-auto w-full px-5">
        {/* Exchange Card (Identical to Bank Page) */}
        <div
          className="bg-white rounded-[15px] p-6 shadow-[0px_8px_30px_rgba(0,0,0,0.04)] border border-gray-100 mb-8 flex flex-col justify-between"
          style={{ width: '390px', height: '359px', maxWidth: 'calc(100vw - 40px)' }}
        >
          <div className="flex-1 flex flex-col justify-between py-2">
            {/* You Send */}
            <div className="space-y-3">
              <p className="text-[#1C1C1C] text-[16px] font-medium opacity-80">You send</p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-[32px] font-bold text-[#1C1C1C]">
                  ${sendAmount}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-[#E1EFFF] rounded-full text-[#2261FE] font-bold text-[13px] border border-[#2261FE]/10 whitespace-nowrap">
                  <img src={`/${token.toLowerCase()}.svg`} alt="" className="w-5 h-5 rounded-full object-contain" />
                  {token}
                  <ChevronDown size={16} />
                </div>
              </div>
              <p className="text-[#888888] text-[14px] font-medium">Available: $874</p>
            </div>

            {/* Dashed Separator */}
            <div className="flex justify-center flex-1 py-2">
              <div className="h-full w-[2px] border-l-2 border-dashed border-[#E1EFFF]" />
            </div>

            {/* Recipient Receives */}
            <div className="space-y-3">
              <p className="text-[#1C1C1C] text-[16px] font-medium opacity-80">Recipient receives</p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-[32px] font-bold text-[#1C1C1C]">
                  {Number(receiveAmount).toLocaleString()}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-[#E1EFFF] rounded-full text-[#2261FE] font-bold text-[13px] whitespace-nowrap border border-[#2261FE]/10 min-w-[120px] justify-center">
                  {currency}
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fees & Exchange Rate */}
        <div
          className="flex flex-col justify-between mb-10"
          style={{ width: '370px', height: '54px', gap: '20px', margin: '0 auto 40px auto' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[#888888] text-[14px] font-medium">Fees</span>
            <span className="text-[#1C1C1C] text-[14px] font-bold">1.0%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#888888] text-[14px] font-medium">Exchange rate</span>
            <span className="text-[#1C1C1C] text-[14px] font-bold uppercase whitespace-nowrap">1 {token} = 1,460 {currency}</span>
          </div>
        </div>

        {/* Payment Detail Box */}
        <div className="bg-white rounded-[15px] p-4 border border-[#B8D8FF] flex items-center gap-4 relative shadow-sm">
          <div className="w-[45px] h-[45px] rounded-full bg-[#E1EFFF] flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src="/bank2.svg" alt={isBank ? "Bank" : "Mobile Money"} className="w-[45px] h-[45px] object-contain" />
          </div>

          <div className="flex-1 space-y-0.5 min-w-0">
            <p className="text-[#1C1C1C] text-[16px] font-bold truncate">{accountNumber}</p>
            <p className="text-[#888888] text-[14px] font-medium truncate">{bankName}</p>
            <p className="text-[#888888] text-[14px] font-medium truncate">{accountName}</p>
          </div>

          <button
            onClick={() => router.back()}
            className="p-1 hover:bg-gray-50 rounded-full transition-colors flex-shrink-0"
          >
            <img src="/retry.svg" alt="Edit" className="w-[36px] h-[36px]" />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 pb-12 bg-white mt-auto w-full flex justify-center">
        <button
          onClick={() => setIsConfirmSheetOpen(true)}
          className="max-w-[430px] w-full h-[65px] bg-[#2261FE] text-white rounded-[7px] text-[18px] font-bold shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          Confirm & Send
        </button>
      </div>

      {/* Final Confirm Bottom Sheet */}
      <ConfirmTransactionSheet
        isOpen={isConfirmSheetOpen}
        onClose={() => setIsConfirmSheetOpen(false)}
        sendAmount={sendAmount}
        receiveAmount={Number(receiveAmount)}
        token={token}
        currency={currency}
        accNum={accountNumber}
        accName={accountName}
        bankName={bankName}
      />
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
