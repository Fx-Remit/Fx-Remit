'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import {
  OnboardingScreen,
  ONBOARDING_HERO_PHOTO,
} from '@/components/onboarding/OnboardingIllustration';

const SPLASH_MS = 2200;

export default function SplashPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { profile: dbUser, isHydrated: userStoreReady } = useUserStore();

  const hasRouted = useRef(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const started = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - started;
      setProgress(Math.min(100, (elapsed / SPLASH_MS) * 100));
      if (elapsed < SPLASH_MS) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

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
    <OnboardingScreen
      backgroundSrc={ONBOARDING_HERO_PHOTO}
      objectPosition="center 22%"
    >
      <div>
        <h1 className="mb-3 text-center text-[28px] font-bold leading-tight tracking-tight text-[#F5F5F5]">
          Welcome to FX Remit
        </h1>
        <p className="mb-2 text-center text-[17px] font-semibold leading-snug text-[#F5F5F5]/95">
          Send money home, instantly
        </p>
        <p className="mx-auto mb-10 max-w-[320px] text-center text-[15px] leading-relaxed text-[#F6F6F6]/70">
          Crypto to bank accounts. Real rates, no hidden fees.
        </p>

        <div className="flex flex-col items-center gap-3">
          <div className="h-[3px] w-full max-w-[200px] overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2261FE] via-[#4F8CFF] to-[#2261FE] transition-[width] duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
            Loading
          </p>
        </div>
      </div>
    </OnboardingScreen>
  );
}
