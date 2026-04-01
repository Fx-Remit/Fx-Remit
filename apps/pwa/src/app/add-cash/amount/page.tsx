"use client";

import { ChevronLeft, Copy, Share2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

const NETWORK_NAMES: Record<string, string> = {
  celo: "Celo network",
  base: "Base network",
  ethereum: "Ethereum network",
};

export default function AmountPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "USDT";
  const network = searchParams.get("network") || "celo";
  
  const tokenSymbol = token.toUpperCase();
  const networkName = NETWORK_NAMES[network] || "Celo network";
  
  const [copied, setCopied] = useState(false);
  const walletAddress = "0x1e902e730C89EB9419a7a9cc53633f29A9C7f07E";

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f8fafd] flex flex-col">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50">
        <Link
          href="/add-cash"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-semibold text-[#1C1C1C]">
          Add {tokenSymbol}
        </h1>
      </div>

      <div className="flex-1 px-5 pt-8 pb-32">
        {/* QR Code Section */}
        <div className="flex justify-center mb-6 text-center">
          <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100/50">
            <div className="w-[180px] h-[180px] bg-white flex items-center justify-center overflow-hidden">
               <img 
                src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=0x1e902e730C89EB9419a7a9cc53633f29A9C7f07E" 
                alt="Deposit QR Code"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100/50 p-6 space-y-6">
          {/* Address Section */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">Tokens available</p>
              <p className="text-[#1C1C1C] text-[15px] font-medium break-all leading-relaxed pr-2">
                {walletAddress}
              </p>
            </div>
            <button 
              onClick={handleCopy}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                copied ? 'bg-green-500 text-white' : 'bg-[#D8E9FF] text-[#2261FE]'
              }`}
            >
              <Copy size={20} />
            </button>
          </div>

          {/* Network Section */}
          <div>
            <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">Network</p>
            <p className="text-[#1C1C1C] text-[16px] font-semibold">{networkName}</p>
          </div>

          {/* Rate Section */}
          <div>
            <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">Rate</p>
            <p className="text-[#1C1C1C] text-[16px] font-semibold">1 USD = 1 {tokenSymbol}</p>
          </div>

          {/* Limits Section */}
          <div className="flex justify-between gap-4 pt-1">
            <div>
              <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">Minimum deposit</p>
              <p className="text-[#1C1C1C] text-[15px] font-semibold">1 {tokenSymbol}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">Maximum deposit</p>
              <p className="text-[#1C1C1C] text-[15px] font-semibold">50,000.00 {tokenSymbol}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-transparent flex justify-center items-center gap-[10px] z-50">
        <button 
          style={{ width: '190px', height: '62px', borderRadius: '7px', paddingTop: '20px', paddingBottom: '20px', paddingLeft: '10px', paddingRight: '10px' }}
          className="bg-white border border-[#2261FE] text-[#2261FE] font-bold text-[16px] flex items-center justify-center gap-2"
        >
          <Share2 size={20} />
          Share
        </button>
        <Link 
          href="/home"
          style={{ width: '190px', height: '62px', borderRadius: '7px', paddingTop: '20px', paddingBottom: '20px', paddingLeft: '10px', paddingRight: '10px', backgroundColor: '#2261FE' }}
          className="text-white font-bold text-[16px] flex items-center justify-center"
        >
          Done
        </Link>
      </div>
    </div>
  );
}
