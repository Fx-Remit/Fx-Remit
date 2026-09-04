'use client';

import { X, Check } from 'lucide-react';
import { useSecurityStore, DEFAULT_AUTO_LOCK_MS } from '@/store/security-store';

interface AutoLockSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const OPTIONS: { label: string; value: number }[] = [
  { label: 'Immediately', value: 0 },
  { label: '1 minute', value: 60_000 },
  { label: '5 minutes', value: DEFAULT_AUTO_LOCK_MS },
  { label: '15 minutes', value: 900_000 },
];

export function AutoLockSheet({ isOpen, onClose }: AutoLockSheetProps) {
  const { autoLockMs, setAutoLockMs } = useSecurityStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-[430px] flex flex-col rounded-t-[40px] bg-[#f6f6f6] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
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

        <div className="text-center mb-4">
          <h2 className="text-[22px] font-bold text-[#1C1C1C]">Auto-Lock</h2>
          <p className="text-[#888888] text-[14px] mt-1 font-medium">
            Lock after this much inactivity
          </p>
        </div>

        <div className="bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] divide-y divide-gray-50 mb-4">
          {OPTIONS.map((opt) => {
            const selected = autoLockMs === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setAutoLockMs(opt.value);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-[17px] font-bold text-[#1C1C1C]">{opt.label}</span>
                {selected && <Check size={18} className="text-[#2261FE]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
