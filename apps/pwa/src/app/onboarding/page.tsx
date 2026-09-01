'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, User as UserIcon, Loader2 } from 'lucide-react';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { createClient } from '@/utils/supabase/client';
import {
  OnboardingScreen,
  ONBOARDING_HERO_PHOTO,
  SlideHeadline,
} from '@/components/onboarding/OnboardingIllustration';

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function readImagePreview(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (
        typeof result === 'string' &&
        /^data:image\/(?:jpeg|png|webp|gif);base64,/.test(result)
      ) {
        resolve(result);
        return;
      }
      resolve(null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ready, user, getAccessToken } = usePrivy();
  const supabase = createClient();

  const [isSettingUp, setIsSettingUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ALLOWED_AVATAR_TYPES.has(file.type)) {
      e.target.value = '';
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    const preview = await readImagePreview(file);
    if (!preview) {
      e.target.value = '';
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(preview);
  };

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
    onComplete: async ({ user }) => {
      const linkedAccounts = user.linkedAccounts ?? [];
      const walletAddress = getPriorityWallet(linkedAccounts);
      const emailAccount = linkedAccounts.find((a) => a.type === 'email');

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

          if (user.id) {
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
          const linkedEmail = linkedAccounts.find(
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

  const handleContinue = () => login();

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
      <OnboardingScreen
        backgroundSrc={ONBOARDING_HERO_PHOTO}
        objectPosition="center 22%"
        scrim="heavy"
        scrollContent
      >
        <div className="mx-auto w-full max-w-[390px]">
          <h1 className="mb-2 text-center text-[28px] font-bold leading-tight text-[#F5F5F5]">
            Create Profile
          </h1>
          <p className="mb-8 text-center text-[15px] text-[#F6F6F6]/65">
            Let&apos;s personalize your account
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
          />

          <div className="relative mx-auto mb-8 w-fit">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[#2261FE]/80 bg-white/5 active:scale-95 transition-transform"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="text-[#2261FE]" size={48} />
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full border-4 border-[#11205A]/80 bg-[#2261FE] active:scale-90 transition-transform"
            >
              <Camera size={20} className="text-white" />
            </button>
          </div>

          <form onSubmit={handleProfileSubmit} className="w-full space-y-5">
            <div className="space-y-2">
              <label className="px-1 text-[14px] font-medium text-[#F6F6F6]/80">Legal Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="h-[56px] w-full rounded-[12px] border border-white/10 bg-white/5 px-4 text-white outline-none transition-colors focus:border-[#2261FE]"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="px-1 text-[14px] font-medium text-[#F6F6F6]/80">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-[56px] w-full rounded-[12px] border border-white/10 bg-white/5 px-4 text-white placeholder-white/30 outline-none transition-colors focus:border-[#2261FE]"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="px-1 text-[14px] font-medium text-[#F6F6F6]/80">
                Display Name (Optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Johnny"
                className="h-[56px] w-full rounded-[12px] border border-white/10 bg-white/5 px-4 text-white placeholder-white/30 outline-none transition-colors focus:border-[#2261FE]"
              />
            </div>

            {submitError && (
              <div className="flex items-start gap-3 rounded-[12px] border border-red-500/20 bg-red-500/10 px-4 py-3">
                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20">
                  <span className="text-[11px] font-bold text-red-400">!</span>
                </div>
                <p className="text-[13px] font-medium leading-snug text-red-400">{submitError}</p>
              </div>
            )}

            <button
              disabled={isSubmitting || !fullName || !email}
              className="mt-4 flex h-[60px] w-full items-center justify-center gap-2 rounded-full bg-[#2261FE] text-[17px] font-semibold text-white shadow-lg shadow-[#2261FE]/25 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
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
            <div className="flex max-w-[80%] flex-col items-center gap-6 rounded-[24px] bg-white/10 p-10 text-center text-white shadow-2xl ring-1 ring-white/20">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                <Check size={40} strokeWidth={3} className="text-white" />
              </div>
              <div className="space-y-2">
                <h2 className="text-[28px] font-bold tracking-tight">Success!</h2>
                <p className="text-[16px] leading-relaxed text-[#F6F6F6]/80">
                  Profile Created Successfully!
                </p>
              </div>
              <div className="flex flex-col items-center gap-2 pt-4">
                <Loader2 className="h-5 w-5 animate-spin text-[#2261FE]" />
                <p className="text-[12px] font-medium uppercase tracking-widest text-[#F6F6F6]/40">
                  Redirecting to home
                </p>
              </div>
            </div>
          </div>
        )}
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      backgroundSrc={ONBOARDING_HERO_PHOTO}
      objectPosition="center 22%"
    >
      <div>
        <SlideHeadline lines={['Instant payouts']} />
        <p className="mx-auto mb-8 max-w-[320px] text-center text-[15px] leading-relaxed text-[#F6F6F6]/75">
          Send money to bank accounts and mobile wallets in seconds. No borders, no delays.
        </p>

        <button
          type="button"
          onClick={handleContinue}
          className="flex h-[60px] w-full items-center justify-center rounded-full bg-[#2261FE] text-[17px] font-semibold text-white shadow-lg shadow-[#2261FE]/30 transition-transform active:scale-[0.98]"
        >
          Continue
        </button>
      </div>
    </OnboardingScreen>
  );
}
