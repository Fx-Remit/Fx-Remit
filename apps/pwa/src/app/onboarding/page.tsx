'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Camera, Check, User as UserIcon, Loader2 } from 'lucide-react';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { createClient } from '@/utils/supabase/client';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const supabase = createClient();

  const [current, setCurrent] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  // Swipe handling
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
  
  // Helper to consistently pick the primary wallet (Privy Embedded > External)
  const getPriorityWallet = (accounts: any[]) => {
    const embeddedWallet = accounts.find(
      (a) => a.type === 'wallet' && (a as any).walletClientType === 'privy'
    );
    if (embeddedWallet) return (embeddedWallet as any).address;

    const externalWallet = accounts.find(
      (a) => a.type === 'wallet' && (a as any).walletClientType !== 'privy'
    );
    return (externalWallet as any)?.address;
  };

  const { login } = useLogin({
    onComplete: async (params) => {
      // Consistent wallet selection
      const walletAddress = getPriorityWallet(params.linkedAccounts);
      const emailAccount = params.linkedAccounts.find((a) => a.type === 'email');

      try {
        const token = await getAccessToken();
        const response = await fetch('/api/user/onboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            walletAddress,
            email: emailAccount?.type === 'email' ? (emailAccount as any).address : undefined
          })
        });

        if (!response.ok) {
          console.error('[ONBOARD] Sync failed with status:', response.status);

          if (params.id) {
            router.push('/home');
            return;
          }

          setIsSettingUp(true);
          return;
        }

        const data = await response.json();

        if (data.user?.fullName) {
          router.push('/home');
        } else {
          const linkedEmail = params.linkedAccounts.find(
            (a: any) => a.type === 'email' || a.type === 'google_oauth'
          );
          if (linkedEmail) setEmail((linkedEmail as any).address ?? '');
          setIsSettingUp(true);
        }
      } catch (err) {
        console.error('[ONBOARD] Failed to sync user on login:', err);
        setIsSettingUp(true); 
      }
    }
  });

  const isLast = current === SLIDES.length - 1;

  const advance = () => {
    if (isLast) {
      login();
      return;
    }
    setExiting(true);
    setTimeout(() => {
      setCurrent((c) => (c >= SLIDES.length - 1 ? c : c + 1));
      setExiting(false);
    }, 200);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!user?.id) throw new Error('User session not found. Please try logging in again.');

      let avatarUrl = undefined;

      if (avatarFile) {
        const timestamp = Date.now();
        const safeFileName = avatarFile.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        const filePath = `avatars/${timestamp}-${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, {
            upsert: true,
            contentType: avatarFile.type
          });

        if (uploadError) {
          throw new Error(`Profile photo upload failed. Please try again.`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        avatarUrl = publicUrl;
      }

      const walletAddress = getPriorityWallet(user?.linkedAccounts || []);

      const token = await getAccessToken();
      const response = await fetch('/api/user/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName,
          displayName: displayName || fullName,
          avatarUrl,
          email: email || undefined,
          walletAddress,
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || 'Profile save failed. Please try again.');
      }

      setIsSuccess(true);
      setTimeout(() => router.push('/home'), 2000);

    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ready) return null;

  if (isSettingUp) {
    return (
      <div className="h-screen w-full bg-[#11205A] px-7 py-20 flex flex-col items-center">
        <div className="w-full max-w-[390px] flex flex-col items-center">
          <h1 className="text-[30px] font-semibold text-[#F5F5F5] text-center mb-2">Create Profile</h1>
          <p className="text-[16px] text-[#F6F6F6]/60 text-center mb-12">Let's personalize your account</p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          <div className="relative mb-12">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-32 h-32 rounded-full bg-[#2261FE]/20 flex items-center justify-center border-2 border-dashed border-[#2261FE] overflow-hidden cursor-pointer active:scale-95 transition-transform"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="text-[#2261FE]" size={48} />
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-10 h-10 bg-[#2261FE] rounded-full flex items-center justify-center border-4 border-[#11205A] active:scale-90 transition-transform"
            >
              <Camera size={20} className="text-white" />
            </button>
          </div>

          <form onSubmit={handleProfileSubmit} className="w-full space-y-6">
            <div className="space-y-2">
              <label className="text-[14px] font-medium text-[#F6F6F6]/80 px-1">Legal Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full h-[60px] bg-white/5 border border-white/10 rounded-[12px] px-4 text-white outline-none focus:border-[#2261FE] transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[14px] font-medium text-[#F6F6F6]/80 px-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-[60px] bg-white/5 border border-white/10 rounded-[12px] px-4 text-white outline-none focus:border-[#2261FE] transition-colors placeholder-white/30"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[14px] font-medium text-[#F6F6F6]/80 px-1">Display Name (Optional)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Johnny"
                className="w-full h-[60px] bg-white/5 border border-white/10 rounded-[12px] px-4 text-white outline-none focus:border-[#2261FE] transition-colors placeholder-white/30"
              />
            </div>

            {submitError && (
              <div className="flex items-start gap-3 rounded-[12px] bg-red-500/10 border border-red-500/20 px-4 py-3">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-red-400 text-[11px] font-bold">!</span>
                </div>
                <p className="text-red-400 text-[13px] font-medium leading-snug">{submitError}</p>
              </div>
            )}

            <button
              disabled={isSubmitting || !fullName || !email}
              className="w-full h-[65px] bg-[#2261FE] text-white rounded-[7px] font-bold text-[17px] mt-8 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Complete Setup
                  <Check size={20} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>
        </div>

        {isSuccess && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#11205A]/90 backdrop-blur-md">
            <div className="flex flex-col items-center gap-6 rounded-[24px] bg-white/10 p-10 text-center text-white shadow-2xl ring-1 ring-white/20 max-w-[80%] animate-in fade-in zoom-in duration-300">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                <Check size={40} strokeWidth={3} className="text-white" />
              </div>
              <div className="space-y-2">
                <h2 className="text-[28px] font-bold tracking-tight">Success!</h2>
                <p className="text-[16px] text-[#F6F6F6]/80 leading-relaxed">Profile Created Successfully!</p>
              </div>
              <div className="flex flex-col items-center gap-2 pt-4">
                <Loader2 className="w-5 h-5 animate-spin text-[#2261FE]" />
                <p className="text-[12px] text-[#F6F6F6]/40 uppercase tracking-widest font-medium">Redirecting to home</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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

