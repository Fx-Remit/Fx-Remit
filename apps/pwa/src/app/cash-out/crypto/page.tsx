"use client";

import { ChevronLeft, ChevronDown, X, Edit2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

const NETWORK_DATA: Record<string, { name: string; icon: string }> = {
  celo: { name: "Celo Mainnet", icon: "/cel2.svg" },
  base: { name: "Base Mainnet", icon: "/base.svg" },
  ethereum: { name: "Ethereum Mainnet", icon: "/eth.svg" },
};

export default function CryptoCashOutPage() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "USDT").toUpperCase();

  const [walletAddress, setWalletAddress] = useState("");
  const [network, setNetwork] = useState(token === "CELO" || token === "CUSD" ? "celo" : "");
  const [amount, setAmount] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "success">("idle");

  const handleSend = () => {
    setIsConfirmOpen(false);
    setStatus("processing");
    setTimeout(() => {
      setStatus("success");
    }, 2500);
  };

  const isCeloNative = token === "CELO" || token === "CUSD";

  const networks = [
    { id: "celo", name: "Celo network" },
    { id: "base", name: "Base network" },
    { id: "ethereum", name: "Ethereum network" },
  ];

  const selectedNetwork = networks.find(n => n.id === network)?.name || "Choose network";

  const availableBalance = "874";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50">
        <Link
          href="/home"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-semibold text-[#1C1C1C]">
          Choose address
        </h1>
      </div>

      <div className="flex-1 px-5 pt-8 pb-32">
        {/* Form Fields */}
        <div className="space-y-6">
          {/* Cash out token info (optional: show which token is chosen) */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <img src={`/${token.toLowerCase()}.svg`} alt={token} className="w-8 h-8 rounded-full" />
            <span className="font-semibold text-[#1C1C1C]">Cashing out {token}</span>
          </div>

          {/* Wallet address */}
          <div>
            <label
              style={{ fontWeight: 500, fontSize: "16px", color: "#1C1C1C", lineHeight: "100%" }}
              className="mb-3 block"
            >
              Wallet address
            </label>
            <input
              type="text"
              placeholder="0x1e763r..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              style={{ borderColor: "#D1D1D1" }}
              className="w-full h-[56px] rounded-[12px] bg-white border px-4 text-[#1C1C1C] text-[15px] placeholder:text-gray-300 focus:outline-none focus:border-[#2261FE] transition-colors shadow-sm"
            />
          </div>

          {/* Network - Only shown if not Celo native */}
          {!isCeloNative && (
            <div className="relative z-20">
              <label
                style={{ fontWeight: 500, fontSize: "16px", color: "#1C1C1C", lineHeight: "100%" }}
                className="mb-3 block"
              >
                Network
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  style={{ borderColor: "#D1D1D1" }}
                  className="w-full h-[56px] rounded-[12px] bg-white border px-4 flex items-center justify-between text-[#1C1C1C] text-[15px] focus:outline-none focus:border-[#2261FE] transition-colors shadow-sm"
                >
                  <span className={network ? "text-[#1C1C1C]" : "text-gray-300"}>
                    {selectedNetwork}
                  </span>
                  <ChevronDown
                    size={20}
                    className={`text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-[12px] shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {networks.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setNetwork(n.id);
                          setIsDropdownOpen(false);
                        }}
                        className="w-full px-4 py-4 text-left text-[15px] text-[#1C1C1C] hover:bg-gray-50 flex items-center justify-between transition-colors border-b last:border-none border-gray-50"
                      >
                        {n.name}
                        {network === n.id && (
                          <div className="w-2 h-2 rounded-full bg-[#2261FE]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Amount to send */}
          <div>
            <label
              style={{ fontWeight: 500, fontSize: "16px", color: "#1C1C1C", lineHeight: "100%" }}
              className="mb-3 block"
            >
              Amount to send
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1C1C1C] font-semibold text-[16px]">
                $
              </span>
              <input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ borderColor: "#D1D1D1" }}
                className="w-full h-[56px] rounded-[12px] bg-white border pl-8 pr-4 text-[#1C1C1C] text-[16px] font-semibold focus:outline-none focus:border-[#2261FE] transition-colors shadow-sm"
              />
            </div>
            <p
              style={{ fontWeight: 500, fontSize: "12px", color: "#888888", lineHeight: "100%" }}
              className="mt-2 font-medium"
            >
              Available: ${availableBalance}
            </p>
          </div>
        </div>

        {/* Saved addresses section */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-8">
            <h2
              style={{ fontWeight: 600, fontSize: "18px", color: "#1C1C1C", lineHeight: "100%" }}
              className="font-bold"
            >
              Saved addresses
            </h2>
            <button
              style={{ fontWeight: 500, fontSize: "14px", color: "#519EFF", lineHeight: "100%" }}
              className="font-bold"
            >
              Add new address
            </button>
          </div>

          <div className="mt-12 flex flex-col items-center">
            <div className="w-[300px] h-auto mb-6">
              <img
                src="/non added.svg"
                alt="No wallet address"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-transparent z-50">
        <button
          style={{ height: '62px', borderRadius: '7px', fontWeight: 500, fontSize: "18px", color: "#F8F8FF", lineHeight: "100%" }}
          className="w-full bg-[#2261FE] flex items-center justify-center active:scale-[0.98] transition-transform shadow-lg shadow-blue-200/50"
          onClick={() => setIsConfirmOpen(true)}
        >
          Confirm & Send
        </button>
      </div>

      {/* Confirmation Bottom Sheet */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsConfirmOpen(false)}
          />

          {/* Sheet */}
          <div
            className="relative w-full bg-[#f6f6f6] rounded-t-[40px] px-6 pb-10 pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ maxWidth: "430px", margin: "0 auto" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-5">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Close */}
            <button
              onClick={() => setIsConfirmOpen(false)}
              className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center text-gray-900 bg-gray-200/50 rounded-full"
            >
              <X size={20} />
            </button>

            {/* Title */}
            <div className="text-center mb-6">
              <h2 className="text-[20px] font-bold text-[#1C1C1C]">Confirm transaction</h2>
            </div>

            {/* Summary Card */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 flex flex-col items-center mb-8">
              <p className="text-gray-400 text-[14px] font-medium mb-1">Total amount</p>
              <p className="text-[#1C1C1C] text-[40px] font-bold mb-8">${amount || "0"}</p>

              <div className="w-full space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[#888888] text-[14px] font-medium">Recipient</span>
                  <span className="text-[#1C1C1C] text-[14px] font-semibold text-right break-all max-w-[200px]">
                    {walletAddress}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#888888] text-[14px] font-medium">Network</span>
                  <div className="flex items-center gap-2">
                    <img src={NETWORK_DATA[network]?.icon} alt="" className="w-6 h-6 object-contain" />
                    <span className="text-[#1C1C1C] text-[14px] font-semibold">{NETWORK_DATA[network]?.name}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#888888] text-[14px] font-medium">Processing fee</span>
                  <span className="text-[#1C1C1C] text-[14px] font-semibold">1.0%</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                  <span className="text-[#888888] text-[14px] font-medium">Recipient gets</span>
                  <span className="text-[#1C1C1C] text-[15px] font-bold">
                    ${amount ? (parseFloat(amount) * 0.99).toFixed(2) : "0.00"}
                  </span>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleSend}
                style={{ height: '62px', borderRadius: '12px' }}
                className="w-full bg-[#2261FE] text-white font-bold text-[18px]"
              >
                Send
              </button>
              <button
                onClick={() => setIsConfirmOpen(false)}
                style={{ height: '62px', borderRadius: '12px', borderColor: '#2261FE' }}
                className="w-full bg-white text-[#2261FE] font-bold text-[18px] border"
              >
                Edit details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processing State */}
      {status === "processing" && (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white rounded-[32px] p-8 flex flex-col items-center">
            <div className="w-full flex justify-center items-center mb-12">
              <h2 className="text-[24px] font-bold text-[#1C1C1C]">Sending...</h2>
            </div>
            <div className="mt-10 mb-20">
              <div className="w-16 h-16 border-4 border-[#2261FE]/20 border-t-[#2261FE] rounded-full animate-spin" />
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
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
                You have successfully sent {amount} {token} to {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </h3>

              <p className="text-[#888888] text-[15px] font-medium max-w-[280px]">
                Kindly check your transaction status in your wallet.
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
    </div>
  );
}
