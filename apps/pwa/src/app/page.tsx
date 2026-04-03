'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

export default function SplashPage() {
  const router = useRouter();

  return (
    <div className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-[#0B194E]">
      {/* Background Graphic (splash.svg) - Full Fit */}
      <div className="absolute inset-0 z-0">
        <img
          src="/splash.svg"
          alt=""
          className="w-full h-full object-cover opacity-30 animate-in fade-in zoom-in duration-1000"
        />
      </div>

      {/* Main Logo (fx remit.svg) */}
      <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in slide-in-from-bottom-12 duration-1000 ease-out">
        <div className="w-[280px] h-auto flex items-center justify-center">
          <img src="/fx remit.svg" alt="FX Remit Logo" className="w-full h-full object-contain" />
        </div>
      </div>

      {/* Interactive CTA (at the bottom) */}
      <div className="absolute bottom-16 left-0 right-0 z-20 px-8 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 delay-500 duration-1000">
        <button
          onClick={() => router.push('/home')}
          className="w-full max-w-[320px] h-[64px] bg-[#2261FE] text-white rounded-[18px] text-[18px] font-bold shadow-2xl shadow-[#2261FE]/30 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
        >
          Get Started
          <ArrowRight size={22} strokeWidth={3} />
        </button>

        <p className="mt-6 text-white/50 text-[13px] font-medium tracking-wide">
          Safe • Global • Instant
        </p>
      </div>
    </div>
  );
}
