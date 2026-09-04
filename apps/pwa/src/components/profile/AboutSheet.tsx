'use client';

import { X, FileText, Shield, Mail } from 'lucide-react';

interface AboutSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutSheet({ isOpen, onClose }: AboutSheetProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-[430px] max-h-[85dvh] flex flex-col overflow-y-auto rounded-t-[40px] bg-[#f6f6f6] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        <button
          onClick={onClose}
          className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center text-gray-900"
          aria-label="Close"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-[22px] font-bold text-[#1C1C1C]">About & Support</h2>
          <p className="text-[#888888] text-[14px] mt-1 font-medium">Fx-Remit v1.0.42</p>
        </div>

        <div className="bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] divide-y divide-gray-50 mb-4">
          <div className="w-full flex items-center gap-4 p-5">
            <div className="w-10 h-10 rounded-full bg-[#f8fafd] flex items-center justify-center text-[#2261FE] shrink-0">
              <Mail size={20} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[17px] font-bold text-[#1C1C1C]">Contact Support</span>
              <span className="text-[13px] text-[#6D6D6D] font-medium">
                Support channel coming soon
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] space-y-4">
          <div className="flex items-start gap-3">
            <FileText size={18} className="text-[#6D6D6D] mt-0.5 shrink-0" />
            <div>
              <p className="text-[15px] font-bold text-[#1C1C1C]">Terms of Service</p>
              <p className="text-[13px] text-[#6D6D6D] mt-0.5">
                Full terms are being finalized and will be linked here.
              </p>
            </div>
          </div>
          <div className="h-[1px] bg-gray-50" />
          <div className="flex items-start gap-3">
            <Shield size={18} className="text-[#6D6D6D] mt-0.5 shrink-0" />
            <div>
              <p className="text-[15px] font-bold text-[#1C1C1C]">Privacy Policy</p>
              <p className="text-[13px] text-[#6D6D6D] mt-0.5">
                Full policy is being finalized and will be linked here.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          Secure Production Environment
        </p>
      </div>
    </div>
  );
}
