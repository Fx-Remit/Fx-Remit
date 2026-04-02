"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function AddAccountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") || "bank";
  const send = searchParams.get("send") || "0";
  const receive = searchParams.get("receive") || "0";
  const token = searchParams.get("token") || "USDT";
  const currency = searchParams.get("currency") || "NGN";
  
  // Form states
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");

  const isBank = type === "bank";

  const handleContinue = () => {
    const params = new URLSearchParams({
      type,
      send,
      receive,
      token,
      currency,
      accNum: accountNumber || "0000000000",
      accName: accountName || "Unnamed Account",
      bank: bankName || "Unknown Institution"
    });
    router.push(`/cash-out/bank/confirm?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50 bg-white">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-bold text-[#1C1C1C] whitespace-nowrap">
          {isBank ? "Add bank account" : "Add mobile money"}
        </h1>
      </div>

      <div className="flex-1 px-6 pt-10 space-y-8">
        {/* Account Number / Phone Number */}
        <div className="space-y-2">
          <label className="text-[16px] font-medium text-[#1C1C1C]">
            {isBank ? "Account number" : "Phone number"}
          </label>
          <input
            type="text"
            placeholder={isBank ? "Account number" : "Phone number"}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="w-full h-[58px] px-4 rounded-[12px] border border-gray-200 bg-white text-[16px] text-[#1C1C1C] placeholder:text-gray-400 focus:outline-none focus:border-[#2261FE] transition-colors"
          />
        </div>

        {/* Account Name / Owner Name */}
        <div className="space-y-2">
          <label className="text-[16px] font-medium text-[#1C1C1C]">
            {isBank ? "Account name" : "Owner name"}
          </label>
          <input
            type="text"
            placeholder={isBank ? "Account name" : "Full name"}
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="w-full h-[58px] px-4 rounded-[12px] border border-gray-200 bg-white text-[16px] text-[#1C1C1C] placeholder:text-gray-400 focus:outline-none focus:border-[#2261FE] transition-colors"
          />
        </div>

        {/* Bank Name / Provider */}
        <div className="space-y-2">
          <label className="text-[16px] font-medium text-[#1C1C1C]">
            {isBank ? "Bank name" : "Provider"}
          </label>
          <input
            type="text"
            placeholder={isBank ? "Bank name" : "e.g. M-Pesa, MTN"}
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className="w-full h-[58px] px-4 rounded-[12px] border border-gray-200 bg-white text-[16px] text-[#1C1C1C] placeholder:text-gray-400 focus:outline-none focus:border-[#2261FE] transition-colors"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto p-6 pb-12 w-full flex justify-center">
        <button
          onClick={handleContinue}
          className="w-full max-w-[390px] h-[65px] bg-[#2261FE] text-white text-[18px] font-bold shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all flex items-center justify-center rounded-[7px]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export default function AddAccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AddAccountForm />
    </Suspense>
  );
}
