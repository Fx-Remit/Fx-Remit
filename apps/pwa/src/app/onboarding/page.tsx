'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

const SLIDES = [
  {
    title: 'Instant payouts',
    body: 'Send money to bank accounts and mobile wallets in seconds. No borders, no delays.',
  },
  {
    title: 'Real-time rates,\nzero markup',
    body: 'Get the best exchange rates without the hidden fees. What you see is precisely what they receive.',
  },
  {
    title: 'Add cash, cash out,\nstay in control',
    body: 'Manage your wealth on the go. Non-custodial security means you are always the owner of your funds.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && current < SLIDES.length - 1) {
      advance();
    }
    if (isRightSwipe && current > 0) {
      setExiting(true);
      setTimeout(() => {
        setCurrent((c) => c - 1);
        setExiting(false);
      }, 200);
    }
  };

  const isLast = current === SLIDES.length - 1;

  const advance = () => {
    if (isLast) {
      router.push('/home');
      return;
    }
    setExiting(true);
    setTimeout(() => {
      setCurrent((c) => c + 1);
      setExiting(false);
    }, 200);
  };

  const slide = SLIDES[current];

  return (
    <div
      className="relative h-screen w-full overflow-hidden select-none"
      style={{ background: 'var(--Blue-Colors-Blue-950, #11205A)' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >


      <div className="overflow-hidden" style={{ height: '600px' }}>
        {/* left (onbarding 2.svg) */}
        <img
          src="/onbarding 2.svg"
          alt=""
          style={{
            position: 'absolute',
            height: '480px',
            top: '75px',
            display: 'block',
            opacity: 1,
          }}
        />
        {/* right */}
        <img
          src="/onbarding.svg"
          alt=""
          style={{
            position: 'absolute',
            height: '480px',
            top: '-60px',
            left: '7px',
            display: 'block',
            opacity: 1,
          }}
        />
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 z-10 px-7 pb-16 flex flex-col justify-end"
        style={{ height: '55%' }}
      >
        {/* Slide text */}
        <div
          key={current}
          className={`transition-opacity duration-200 flex flex-col items-center ${exiting ? 'opacity-0' : 'opacity-100'}`}
        >
          <h1
            className="text-[30px] font-semibold leading-[100%] mb-4 text-[#F5F5F5] text-center"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {slide.title}
          </h1>
          <p
            className="text-[16px] font-normal leading-[100%] mb-8 text-[#F6F6F6] text-center"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {slide.body}
          </p>
        </div>

        {/* Pagination dots */}
        <div className="flex items-center gap-2 mb-10">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === current ? 22 : 8,
                height: 8,
                background: i === current ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>

        {/* Button  */}
        <div className="w-full flex justify-center">
          <button
            onClick={advance}
            className="flex items-center justify-center font-semibold text-white transition-transform duration-100 active:scale-[0.98]"
            style={{
              width: '100%',
              maxWidth: '390px',
              height: '65px',
              background: '#2261FE',
              borderRadius: '7px',
              paddingTop: '20px',
              paddingRight: '10px',
              paddingBottom: '20px',
              paddingLeft: '10px',
              gap: '10px',
              opacity: 1
            }}
          >
            <span className="text-[17px]">{isLast ? 'Get Started' : 'Skip'}</span>
            <ArrowRight size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

