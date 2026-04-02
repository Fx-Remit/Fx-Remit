"use client";

import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const TOKENS = [
  {
    id: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    icon: "/usdt.svg",
    requiresNetwork: true,
  },
  {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    icon: "/usdc.svg",
    requiresNetwork: true,
  },
  {
    id: "cusd",
    symbol: "cUSD",
    name: "Celo USD",
    icon: "/cusd.svg",
    requiresNetwork: false,
  },
  {
    id: "celo",
    symbol: "Celo",
    name: "Celo Network",
    icon: "/celo.svg",
    requiresNetwork: false,
  },
];

const NETWORKS = [
  {
    id: "celo",
    name: "Celo",
    icon: "/cel2.svg",
  },
  {
    id: "base",
    name: "Base",
    icon: "/base.svg",
  },
  {
    id: "ethereum",
    name: "Ethereum",
    icon: "/eth.svg",
  },
];

export default function AddCashPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<typeof TOKENS[0] | null>(null);

  const handleTokenClick = (token: typeof TOKENS[0]) => {
    if (token.requiresNetwork) {
      setSelectedToken(token);
      setIsSheetOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafd] pb-10">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50">
        <Link
          href="/home"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </Link>
        <h1
          className="absolute left-1/2 -translate-x-1/2 text-[18px]"
          style={{ width: "fit-content", fontWeight: 600, color: "#1C1C1C", textAlign: "center", whiteSpace: "nowrap" }}
        >
          Choose funding option
        </h1>
      </div>

      <div className="px-5 pt-8">
        <p className="text-gray-400 text-sm font-medium mb-4">Tokens available</p>

        <div className="bg-white rounded-[32px] shadow-sm overflow-hidden border border-gray-100/50">
          <div className="divide-y divide-gray-100">
            {TOKENS.map((token) => {
              const content = (
                <>
                  <div className="w-[45px] h-[45px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50">
                    <img src={token.icon} alt={token.symbol} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 text-left">
                    <p
                      style={{ fontWeight: 500, fontSize: "17px", color: "#1C1C1C", lineHeight: "tight" }}
                      className="group-hover:text-blue-600 transition-colors"
                    >
                      {token.symbol}
                    </p>
                    <p style={{ fontWeight: 500, fontSize: "13px", color: "#888888", marginTop: "2px" }}>
                      {token.name}
                    </p>
                  </div>
                </>
              );

              if (token.requiresNetwork) {
                return (
                  <button
                    key={token.id}
                    onClick={() => handleTokenClick(token)}
                    className="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition-colors group"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <Link
                  key={token.id}
                  href={`/add-cash/amount?token=${token.id}`}
                  className="flex items-center gap-4 p-5 hover:bg-gray-50 transition-colors group"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Choose Network Bottom Sheet */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-[100] flex items-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 transition-opacity duration-300"
            onClick={() => setIsSheetOpen(false)}
          />

          {/* Sheet Container */}
          <div
            className="relative w-full max-w-[430px] mx-auto bg-[#f6f6f6] rounded-t-[40px] px-6 pb-12 pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300 transform-gpu overflow-hidden"
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Close button */}
            <button
              onClick={() => setIsSheetOpen(false)}
              className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center text-gray-900"
            >
              <X size={24} />
            </button>

            <div className="text-center mb-8">
              <h2 className="text-[20px] font-bold text-[#1C1C1C]">Choose network</h2>
              <p className="text-[#888888] text-[15px] mt-1 font-medium text-center">Where would you like send money to?</p>
            </div>

            {/* Network List Card */}
            <div className="bg-white rounded-[32px] shadow-sm overflow-hidden border border-gray-100/50 mb-4 p-2 items-center">
              <div className="space-y-1">
                {NETWORKS.map((network) => (
                  <Link
                    key={network.id}
                    href={`/add-cash/amount?token=${selectedToken?.id}&network=${network.id}`}
                    onClick={() => setIsSheetOpen(false)}
                    className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 transition-colors group"
                  >
                    <div className="w-[45px] h-[45px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50">
                      <img src={network.icon} alt={network.name} className="w-full h-full object-contain" />
                    </div>
                    <p className="font-bold text-[#1C1C1C] text-[17px] group-hover:text-blue-600 transition-colors text-center">
                      {network.name}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
