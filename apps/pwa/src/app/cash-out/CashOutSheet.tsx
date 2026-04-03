'use client';

import { ChevronRight, X } from 'lucide-react';
import Link from 'next/link';

interface CashOutSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CashOutSheet({ isOpen, onClose }: CashOutSheetProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full bg-[#f6f6f6] rounded-t-[40px] px-6 pb-12 pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
        style={{ maxWidth: '430px', margin: '0 auto' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-5">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center text-gray-900"
        >
          <X size={24} />
        </button>

        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-[22px] font-bold text-[#1C1C1C]">Cash out</h2>
          <p className="text-[#888888] text-[15px] mt-1 font-medium">
            Where would you like send money to?
          </p>
        </div>

        {/* Options Card */}
        <div className="bg-white rounded-[28px] overflow-hidden border border-gray-100/50">
          {/* Bank / Mobile Money */}
          <Link
            href="/cash-out/bank"
            onClick={onClose}
            className="flex items-center gap-4 px-5 py-5 hover:bg-gray-50 transition-colors group border-b border-gray-100"
          >
            <div className="w-[45px] h-[45px] rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <img src="/bank.svg" alt="Bank" className="w-[45px] h-[45px] object-contain" />
            </div>
            <div className="flex-1">
              <p style={{ fontWeight: 500, fontSize: '16px', color: '#1C1C1C' }}>
                To bank or mobile money
              </p>
              <p style={{ fontWeight: 500, fontSize: '12px', color: '#888888', marginTop: '2px' }}>
                Send to local currency accounts
              </p>
            </div>
            <ChevronRight size={20} className="text-[#2261FE] flex-shrink-0" />
          </Link>

          {/* Crypto Wallet */}
          <Link
            href="/cash-out/crypto/select"
            onClick={onClose}
            className="flex items-center gap-4 px-5 py-5 hover:bg-gray-50 transition-colors group"
          >
            <div className="w-[45px] h-[45px] rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <img src="/crypto.svg" alt="Crypto" className="w-[45px] h-[45px] object-contain" />
            </div>
            <div className="flex-1">
              <p style={{ fontWeight: 500, fontSize: '16px', color: '#1C1C1C' }}>
                To a crypto wallet
              </p>
              <p style={{ fontWeight: 500, fontSize: '12px', color: '#888888', marginTop: '2px' }}>
                Send to a crypto wallet
              </p>
            </div>
            <ChevronRight size={20} className="text-[#2261FE] flex-shrink-0" />
          </Link>
        </div>
      </div>
    </div>
  );
}
