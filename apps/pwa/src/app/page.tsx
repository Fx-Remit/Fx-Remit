'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';

const SPLASH_MS = 1800;

export default function SplashPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { profile: dbUser, isHydrated: userStoreReady } = useUserStore();

  const hasRouted = useRef(false);

  useEffect(() => {
    const isProfileLoading = authenticated && !userStoreReady;

    if (!ready || isProfileLoading || hasRouted.current) return;

    hasRouted.current = true;

    const splashTimer = setTimeout(() => {
      const destination =
        !authenticated || (userStoreReady && !dbUser?.fullName) ? '/onboarding' : '/home';

      router.replace(destination);
    }, SPLASH_MS);

    return () => clearTimeout(splashTimer);
  }, [ready, authenticated, dbUser, userStoreReady, router]);

  return (
    <div className="relative flex h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-[#0B194E]">
      <div className="absolute inset-0 z-0">
        <img
          src="/splash.svg"
          alt=""
          aria-hidden
          className="h-full w-full object-cover opacity-30"
        />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="flex h-auto w-[280px] items-center justify-center">
          <img
            src="/fx remit.svg"
            alt="FX Remit"
            className="h-full w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
