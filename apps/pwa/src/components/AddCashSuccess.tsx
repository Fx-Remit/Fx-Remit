'use client';

import Link from 'next/link';

interface AddCashSuccessProps {
  amount: number;
  token: string;
}

export function AddCashSuccess({ amount, token }: AddCashSuccessProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 animate-in fade-in zoom-in duration-500">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
          <div className="w-5 h-2.5 border-l-4 border-b-4 border-white -rotate-45 mt-[-2px]" />
        </div>
      </div>

      <h2 className="text-[24px] font-bold text-[#1C1C1C] mb-2">
        Deposit Received!
      </h2>

      <p className="text-gray-500 text-[16px] mb-8 leading-relaxed">
        Your deposit of <span className="font-bold text-[#1C1C1C]">{amount} {token}</span> has been confirmed and added to your balance.
      </p>

      <div className="w-full space-y-3">
        <Link
          href="/home"
          className="flex w-full h-[62px] bg-[#2261FE] text-white font-bold text-[16px] items-center justify-center rounded-[7px] active:scale-95 transition-transform"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
