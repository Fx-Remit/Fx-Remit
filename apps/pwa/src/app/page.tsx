'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/onboarding');
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-[#0B194E]">
      {/* Background Graphic */}
      <div className="absolute inset-0 z-0">
        <img
          src="/splash.svg"
          alt=""
          className="w-full h-full object-cover opacity-30 animate-in fade-in zoom-in duration-1000"
        />
      </div>

      {/* Main Logo */}
      <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in slide-in-from-bottom-12 duration-1000 ease-out">
        <div className="w-[280px] h-auto flex items-center justify-center">
          <img src="/fx remit.svg" alt="FX Remit Logo" className="w-full h-full object-contain" />
        </div>
      </div>
    </div>
  );
}

