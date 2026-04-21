'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';

export default function SplashPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { profile: dbUser, isHydrated: userStoreReady } = useUserStore();

  const hasRouted = useRef(false);

  useEffect(() => {
    if (!ready || !userStoreReady || hasRouted.current) return;

    hasRouted.current = true;

    const splashTimer = setTimeout(() => {
      if (!authenticated) {
        router.replace('/onboarding');
      } else {
        if (!dbUser?.fullName) {
          router.replace('/onboarding');
        } else {

          router.replace('/home');
        }
      }
    }, 1500);

    return () => clearTimeout(splashTimer);
  }, [ready, authenticated, dbUser, userStoreReady, router]);

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
