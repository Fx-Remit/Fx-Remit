"use client";

import { ChevronLeft, ChevronDown, X, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TOKENS = [
  { symbol: "USDT", icon: "/usdt.svg" },
  { symbol: "USDC", icon: "/usdc.svg" },
  { symbol: "cUSD", icon: "/cusd.svg" },
  { symbol: "CELO", icon: "/celo.svg" },
];

const CURRENCIES = [
  { code: "NGN", flag: "🇳🇬", name: "Nigerian Naira" },
  { code: "KES", flag: "🇰🇪", name: "Kenyan Shilling" },
  { code: "UGX", flag: "🇺🇬", name: "Ugandan Shilling" },
  { code: "TZS", flag: "🇹🇿", name: "Tanzanian Shilling" },
];

export default function BankCashOutPage() {
  const router = useRouter();
  const [sendAmount, setSendAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [token, setToken] = useState("USDT");
  const [currency, setCurrency] = useState("");
  const [isTokenSheetOpen, setIsTokenSheetOpen] = useState(false);
  const [isCurrencySheetOpen, setIsCurrencySheetOpen] = useState(false);
  const [isPaymentMethodSheetOpen, setIsPaymentMethodSheetOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<"bank" | "mobile">("bank");

  const availableBalance = "874";

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
          className="bg-white rounded-[15px] p-6 shadow-[0px_8px_30px_rgba(0,0,0,0.04)] border border-gray-100 mb-8 flex flex-col justify-between w-full max-w-[390px]"
          style={{ height: '359px' }}
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
                  onChange={(e) => setSendAmount(e.target.value)}
                  className="w-0 flex-1 bg-transparent text-[32px] font-bold text-[#1C1C1C] placeholder:text-gray-200 focus:outline-none min-w-0"
                />
                <button 
                  onClick={() => setIsTokenSheetOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E1EFFF] rounded-full text-[#2261FE] font-bold text-[13px] border border-[#2261FE]/10 whitespace-nowrap"
                >
                  <img src={`/${token.toLowerCase()}.svg`} alt="" className="w-5 h-5 rounded-full object-contain" />
                  {token}
                  <ChevronDown size={16} />
                </button>
              </div>
              <p className="text-[#888888] text-[14px] font-medium">Available: ${availableBalance}</p>
            </div>

            {/* Dashed Separator */}
            <div className="flex justify-center flex-1 py-2">
              <div className="h-full w-[2px] border-l-2 border-dashed border-[#E1EFFF]" />
            </div>

            {/* Recipient Receives */}
            <div className="space-y-3">
              <p className="text-[#1C1C1C] text-[16px] font-medium opacity-80">Recipient receives</p>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  placeholder="0"
                  value={receiveAmount}
                  onChange={(e) => setReceiveAmount(e.target.value)}
                  className="w-0 flex-1 bg-transparent text-[32px] font-bold text-[#1C1C1C] placeholder:text-gray-200 focus:outline-none min-w-0"
                />
                <button 
                  onClick={() => setIsCurrencySheetOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E1EFFF] rounded-full text-[#2261FE] font-bold text-[13px] whitespace-nowrap border border-[#2261FE]/10 min-w-[120px] justify-center"
                >
                  {CURRENCIES.find(c => c.code === currency) && (
                    <span className="text-[16px]">
                      {CURRENCIES.find(c => c.code === currency)?.flag}
                    </span>
                  )}
                  {currency || "Choose currency"}
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Info Table */}
        <div className="space-y-4 px-2 w-full max-w-[389px]">
          <div className="flex items-center justify-between">
            <span className="text-[#888888] text-[15px] font-medium">Fees</span>
            <span className="text-[#1C1C1C] text-[15px] font-bold">0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#888888] text-[15px] font-medium">Exchange rate</span>
            <span className="text-[#1C1C1C] text-[15px] font-bold">0</span>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="mt-12 w-full flex justify-center px-[20px]">
          <button 
            onClick={() => setIsPaymentMethodSheetOpen(true)}
            className="w-full max-w-[390px] rounded-[15px] border-2 border-dashed border-[#89C1FF] bg-white flex flex-col items-center justify-center gap-1 hover:bg-[#F8FBFF] transition-colors group active:scale-[0.99] duration-200"
            style={{ height: '126px' }}
          >
            <span className="text-[#1C1C1C] text-[18px] font-bold group-hover:text-[#2261FE]">Choose payment method</span>
            <span className="text-[#888888] text-[14px] font-medium">Bank account or mobile money</span>
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
          {TOKENS.map((t) => (
            <button
              key={t.symbol}
              onClick={() => {
                setToken(t.symbol);
                setIsTokenSheetOpen(false);
              }}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                  <img src={t.icon} alt="" className="w-7 h-7 object-contain" />
                </div>
                <span className={`text-[17px] font-bold ${token === t.symbol ? 'text-[#2261FE]' : 'text-[#1C1C1C]'}`}>
                  {t.symbol}
                </span>
              </div>
              {token === t.symbol && <div className="w-2.5 h-2.5 rounded-full bg-[#2261FE]" />}
            </button>
          ))}
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
                  <p className={`text-[17px] font-bold ${currency === c.code ? 'text-[#2261FE]' : 'text-[#1C1C1C]'}`}>
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
        title="Add payment method"
      >
        <div className="px-6 flex flex-col items-center">
          {/* Tabs */}
          <div className="flex gap-2 w-full mb-8">
            <button
              onClick={() => setPaymentType("bank")}
              className={`flex-1 py-3 px-4 rounded-full text-[14px] font-bold transition-all duration-200 border ${
                paymentType === "bank" 
                ? "bg-[#E1EFFF] text-[#2261FE] border-[#2261FE]/20" 
                : "bg-white text-gray-400 border-gray-100"
              }`}
            >
              Bank account
            </button>
            <button
              onClick={() => setPaymentType("mobile")}
              className={`flex-1 py-3 px-4 rounded-full text-[14px] font-bold transition-all duration-200 border ${
                paymentType === "mobile" 
                ? "bg-[#E1EFFF] text-[#2261FE] border-[#2261FE]/20" 
                : "bg-white text-gray-400 border-gray-100"
              }`}
            >
              Mobile money
            </button>
          </div>

          {/* Empty State Illustration */}
          <div className="flex flex-col items-center justify-center py-6 w-full">
            <img 
              src="/non added.svg" 
              alt="No payment methods" 
              className="w-[240px] h-auto mb-6 opacity-90"
            />
            <p className="text-[#888888] text-[16px] font-medium text-center">
              No payment method added yet
            </p>
          </div>

          {/* Add Account Button */}
          <button 
            onClick={() => {
              setIsPaymentMethodSheetOpen(false);
              const params = new URLSearchParams({
                type: paymentType,
                send: sendAmount || "0",
                receive: receiveAmount || "0",
                token: token,
                currency: currency || "Choose currency"
              });
              router.push(`/cash-out/bank/add?${params.toString()}`);
            }}
            className="w-full mt-6 py-4 bg-[#E1EFFF] text-[#2261FE] rounded-full text-[16px] font-bold flex items-center justify-center gap-2 hover:bg-[#D1E5FF] transition-colors border border-[#2261FE]/10"
          >
            Add account <Plus size={20} />
          </button>
        </div>
      </SelectionSheet>
    </div>
  );
}

// Internal SelectionSheet component
function SelectionSheet({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string, children: React.ReactNode }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-300" onClick={onClose} />
      
      {/* Sheet */}
      <div 
        className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-[40px] pt-4 pb-10 shadow-2xl animate-in slide-in-from-bottom duration-300"
      >
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
