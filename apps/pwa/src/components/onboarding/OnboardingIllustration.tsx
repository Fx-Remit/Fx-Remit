'use client';

import type { ReactNode } from 'react';

/** Unsplash — David Rotimi (Nigeria). License: unsplash.com/license */
export const ONBOARDING_HERO_PHOTO = '/onboarding/hero.jpg';

const PHOTO_SCRIM =
  'linear-gradient(to bottom, rgba(17,32,90,0) 0%, rgba(17,32,90,0) 32%, rgba(17,32,90,0.35) 55%, rgba(17,32,90,0.82) 78%, rgba(17,32,90,0.94) 100%)';

const PHOTO_SCRIM_HEAVY =
  'linear-gradient(to bottom, rgba(17,32,90,0.15) 0%, rgba(17,32,90,0.1) 30%, rgba(17,32,90,0.55) 58%, rgba(17,32,90,0.92) 100%)';

type OnboardingScreenProps = {
  backgroundSrc: string;
  objectPosition?: string;
  scrim?: 'default' | 'heavy';
  children: ReactNode;
  scrollContent?: boolean;
};

export function OnboardingScreen({
  backgroundSrc,
  objectPosition = 'center 22%',
  scrim = 'default',
  children,
  scrollContent = false,
}: OnboardingScreenProps) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#11205A]">
      <img
        src={backgroundSrc}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition }}
      />

      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: scrim === 'heavy' ? PHOTO_SCRIM_HEAVY : PHOTO_SCRIM }}
      />

      <div className="relative z-10 flex h-full flex-col justify-end">
        <div
          className={`px-7 pb-[max(2.25rem,env(safe-area-inset-bottom))] pt-6 ${
            scrollContent ? 'max-h-[62dvh] overflow-y-auto' : ''
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function SlideHeadline({
  lines,
  accentLineIndex,
}: {
  lines: string[];
  accentLineIndex?: number;
}) {
  return (
    <h1 className="mb-3 text-center text-[28px] font-bold leading-tight tracking-tight">
      {lines.map((line, i) => (
        <span
          key={i}
          className={`block whitespace-pre-line ${
            i === accentLineIndex ? 'text-[#2261FE]' : 'text-[#F5F5F5]'
          }`}
        >
          {line}
        </span>
      ))}
    </h1>
  );
}
