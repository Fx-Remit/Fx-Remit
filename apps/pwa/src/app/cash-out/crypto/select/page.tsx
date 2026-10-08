'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    icon: '/usdc.svg',
    available: true,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    icon: '/usdt.svg',
    available: true,
  },
];

export default function TokenSelectionPage() {
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
          Choose asset
        </h1>
      </div>

      <div className="flex-1 px-5 pt-8 pb-32">
        <div className="space-y-4">
          {TOKENS.map((token) => (
            <Link
              key={token.symbol}
              href={token.available ? `/cash-out/crypto?token=${token.symbol}` : '#'}
              aria-disabled={!token.available}
              onClick={(e) => {
                if (!token.available) e.preventDefault();
              }}
              className={`flex items-center justify-between p-4 rounded-[16px] bg-white border border-gray-100 transition-all group ${
                token.available ? 'hover:border-[#2261FE] active:scale-[0.98]' : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-[45px] h-[45px] rounded-full overflow-hidden flex-shrink-0">
                  <img src={token.icon} alt={token.symbol} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3
                    style={{ fontWeight: 500, fontSize: '16px', color: '#1C1C1C' }}
                    className="leading-none mb-1"
                  >
                    {token.symbol}
                  </h3>
                  <p
                    style={{ fontWeight: 500, fontSize: '12px', color: '#888888' }}
                    className="leading-none"
                  >
                    {token.name}
                  </p>
                </div>
              </div>
              <ChevronRight
                size={20}
                className="text-gray-300 group-hover:text-[#2261FE] transition-colors"
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
