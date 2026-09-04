'use client';

import {
  ShieldCheck,
  HelpCircle,
  LogOut,
  Settings,
  Lock,
  Fingerprint,
  ArrowRight,
  Calendar,
  ChevronRight,
  Edit2,
  Bell,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { useSecurityStore } from '@/store/security-store';
import { isBiometricSupported } from '@/lib/security';
import { SecuritySetup } from '@/components/security/SecuritySetup';
import { AutoLockSheet } from '@/components/security/AutoLockSheet';
import { BottomNav } from '@/components/layout/BottomNav';
import { MenuRow } from '@/components/profile/MenuRow';
import { AboutSheet } from '@/components/profile/AboutSheet';
import { EditProfileSheet } from '@/components/profile/EditProfileSheet';
import { Toggle } from '@/components/ui/Toggle';
import {
  getPushSubscriptionStatus,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from '@/lib/push/register';

type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | null;

function formatAutoLockLabel(ms: number): string {
  if (ms === 0) return 'Immediately';
  const minutes = ms / 60_000;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

export default function ProfilePage() {
  const { logout, exportWallet, getAccessToken, user: privyUser } = usePrivy();
  const { profile: dbUser, setProfile } = useUserStore();
  const {
    isSecurityEnabled,
    isBiometricEnabled,
    setPin,
    setBiometricEnabled,
    setBiometricCredentialId,
    setPendingAction,
    setLocked,
    clearSecurity,
    autoLockMs,
  } = useSecurityStore();

  const router = useRouter();
  const [isBioSupported, setIsBioSupported] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);
  const [showAbout, setShowAbout] = React.useState(false);
  const [showEdit, setShowEdit] = React.useState(false);
  const [showAutoLock, setShowAutoLock] = React.useState(false);
  const [pushStatus, setPushStatus] = React.useState<PushStatus>(null);
  const [pushBusy, setPushBusy] = React.useState(false);

  React.useEffect(() => {
    isBiometricSupported().then(setIsBioSupported);
  }, []);

  React.useEffect(() => {
    getPushSubscriptionStatus().then(setPushStatus);
  }, []);

  const handleTogglePush = async (next: boolean) => {
    setPushBusy(true);
    try {
      const result = next
        ? await subscribeToWebPush(getAccessToken)
        : await unsubscribeFromWebPush(getAccessToken);
      setPushStatus(result.ok ? (next ? 'subscribed' : 'unsubscribed') : await getPushSubscriptionStatus());
    } finally {
      setPushBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    clearSecurity();
    setProfile(null);
    router.push('/');
  };

  const handleSetupSecurity = () => {
    setShowSetup(true);
  };

  const handleExportWallet = async () => {
    if (isSecurityEnabled) {
      setPendingAction('exportPrivateKey');
      setLocked(true);
      return;
    }
    try {
      await exportWallet();
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const displayName = dbUser?.displayName || dbUser?.fullName || 'User';
  const avatar = dbUser?.avatarUrl || `https://api.dicebear.com/8.x/lorelei/svg?seed=${dbUser?.id}&backgroundColor=b6e3f4`;
  const emailOrWallet = dbUser?.email || (dbUser?.walletAddress ? `${dbUser.walletAddress.slice(0, 6)}...${dbUser.walletAddress.slice(-4)}` : '');
  const memberSince = dbUser?.createdAt
    ? new Date(dbUser.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—';

  // Only Privy embedded wallet users can export — MetaMask users own their own keys
  const hasEmbeddedWallet = privyUser?.linkedAccounts?.some(
    (a: any) => a.type === 'wallet' && a.walletClientType === 'privy'
  );

  return (
    <div className="min-h-screen bg-[#F8FAFD] flex flex-col items-center">
      <div className="w-full max-w-[430px] flex flex-col min-h-screen relative pb-32">
        {/* Header Section */}
        <div className="pt-16 px-6 pb-8 flex flex-col items-center">
          <div className="w-full flex justify-between items-center mb-8">
            <h1 className="text-[20px] font-bold text-[#1C1C1C]">Profile</h1>
            <button
              onClick={() => setShowAbout(true)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Settings size={22} className="text-[#1C1C1C]" />
            </button>
          </div>

          {/* User Info Card */}
          <div className="w-full flex items-center justify-between bg-white rounded-[24px] p-5 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] border border-gray-100">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-[64px] h-[64px] rounded-full overflow-hidden border-2 border-white shadow-sm bg-[#E0E7FF]">
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-[20px] font-bold text-[#1C1C1C] truncate max-w-[180px]">
                  {displayName}
                </h2>
                <p className="text-[#6D6D6D] text-[14px] font-medium truncate max-w-[180px]">
                  {emailOrWallet}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowEdit(true)}
              className="w-10 h-10 flex items-center justify-center bg-[#F8FAFD] rounded-full text-[#1C1C1C] active:scale-95 transition-all"
              aria-label="Edit profile"
            >
              <Edit2 size={18} />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="px-6 mb-8">
          <div className="flex justify-between gap-3">
            {/* Total Sent */}
            <div className="flex-1 bg-white rounded-[20px] p-4 border border-gray-100 shadow-[0px_4px_15px_rgba(0,0,0,0.01)] flex flex-col items-center text-center">
              <div className="w-[45px] h-[45px] mb-3 flex items-center justify-center">
                <img src="/total sent.svg" alt="" className="w-full h-full object-contain" />
              </div>
              <h3 className="text-[#1C1C1C] text-[16px] font-bold leading-tight">
                ${dbUser?.totalSentUsd?.toString() || '0.00'}
              </h3>
              <p className="text-[11px] text-[#6D6D6D] font-medium mt-0.5">Total Sent</p>
            </div>

            {/* Total Transactions */}
            <div className="flex-1 bg-white rounded-[20px] p-4 border border-gray-100 shadow-[0px_4px_15px_rgba(0,0,0,0.01)] flex flex-col items-center text-center">
              <div className="w-[45px] h-[45px] mb-3 flex items-center justify-center">
                <img
                  src="/total transactions.svg"
                  alt=""
                  className="w-full h-full object-contain"
                />
              </div>
              <h3 className="text-[#1C1C1C] text-[16px] font-bold leading-tight">
                {dbUser?.transactionCount || 0}
              </h3>
              <p className="text-[11px] text-[#6D6D6D] font-medium mt-0.5">Transactions</p>
            </div>

            {/* Member Since */}
            <div className="flex-1 bg-white rounded-[20px] p-4 border border-gray-100 shadow-[0px_4px_15px_rgba(0,0,0,0.01)] flex flex-col items-center text-center">
              <div className="w-[45px] h-[45px] mb-3 flex items-center justify-center rounded-full bg-[#F8FAFD] text-[#2261FE]">
                <Calendar size={20} />
              </div>
              <h3 className="text-[#1C1C1C] text-[16px] font-bold leading-tight">
                {memberSince}
              </h3>
              <p className="text-[11px] text-[#6D6D6D] font-medium mt-0.5">Member Since</p>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="px-6 mb-8 space-y-4">
          <h3 className="text-[#6D6D6D] text-[14px] font-bold uppercase tracking-widest px-1">
            Account
          </h3>
          <div className="bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-[0px_4px_25px_rgba(0,0,0,0.02)]">
            <MenuRow
              href="/profile/recipients"
              icon={<Users size={20} className="text-[#2261FE]" />}
              label="Manage Recipients"
              subLabel="Saved bank accounts"
            />
          </div>
        </div>

        {/* Preferences */}
        {pushStatus !== 'unsupported' && (
          <div className="px-6 mb-8 space-y-4">
            <h3 className="text-[#6D6D6D] text-[14px] font-bold uppercase tracking-widest px-1">
              Preferences
            </h3>
            <div className="bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-[0px_4px_25px_rgba(0,0,0,0.02)]">
              <MenuRow
                icon={<Bell size={20} className="text-[#2261FE]" />}
                label="Notification Preferences"
                subLabel={
                  pushStatus === 'denied'
                    ? 'Blocked in browser settings'
                    : pushStatus === 'subscribed'
                      ? 'Phone alerts on'
                      : 'Phone alerts off'
                }
                trailing={
                  <Toggle
                    checked={pushStatus === 'subscribed'}
                    onChange={handleTogglePush}
                    busy={pushBusy}
                    disabled={pushStatus === 'denied'}
                    aria-label="Toggle notification preferences"
                  />
                }
              />
            </div>
          </div>
        )}

        {/* Menu Section */}
        <div className="px-6 space-y-4">
          <h3 className="text-[#6D6D6D] text-[14px] font-bold uppercase tracking-widest px-1">
            Security & Support
          </h3>

          <div className="bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-[0px_4px_25px_rgba(0,0,0,0.02)]">
            <MenuRow
              onClick={isSecurityEnabled ? undefined : handleSetupSecurity}
              icon={<ShieldCheck size={20} className={isSecurityEnabled ? "text-green-500" : "text-[#10B981]"} />}
              label={isSecurityEnabled ? "Security Active" : "Setup App Lock"}
              subLabel={isSecurityEnabled ? "Protection is running" : "Set a 6-digit PIN"}
            />
            <div className="h-[1px] bg-gray-50 mx-5" />

            {isSecurityEnabled && (
              <>
                <MenuRow
                  onClick={() => setShowAutoLock(true)}
                  icon={<Lock size={20} className="text-[#2261FE]" />}
                  label="Auto-Lock"
                  subLabel={formatAutoLockLabel(autoLockMs)}
                />
                <div className="h-[1px] bg-gray-50 mx-5" />
                <MenuRow
                  onClick={() => {
                    if (!isBiometricEnabled) {
                      // Can't enable biometrics without going through setup
                      setShowSetup(true);
                    } else {
                      setBiometricEnabled(false);
                    }
                  }}
                  icon={<Fingerprint size={20} className={isBiometricEnabled ? "text-blue-500" : "text-gray-400"} />}
                  label="FaceID / TouchID"
                  subLabel={isBiometricEnabled ? "Enabled" : "Disabled"}
                />
                <div className="h-[1px] bg-gray-50 mx-5" />
                <MenuRow
                  onClick={() => {
                    setPendingAction('disableSecurity');
                    setLocked(true);
                  }}
                  icon={<Lock size={20} />}
                  label="Remove App Lock"
                  subLabel="Disable all security"
                  tone="danger"
                />
                <div className="h-[1px] bg-gray-50 mx-5" />
              </>
            )}

            {hasEmbeddedWallet && (
              <>
                <MenuRow
                  onClick={handleExportWallet}
                  icon={<ArrowRight size={20} className="text-orange-500" />}
                  label="Export Private Key"
                  subLabel="Securely backup your wallet"
                />
                <div className="h-[1px] bg-gray-50 mx-5" />
              </>
            )}

            <MenuRow
              onClick={() => setShowAbout(true)}
              icon={<HelpCircle size={20} className="text-[#2261FE]" />}
              label="Contact Support"
              subLabel="Help Center & Legal"
            />
          </div>

          <div className="pt-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-between bg-white rounded-[20px] p-5 border border-red-50 group hover:bg-red-50/30 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-100 transition-colors">
                  <LogOut size={20} />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[17px] font-bold text-[#1C1C1C]">Logout</span>
                  <span className="text-[13px] text-red-400 font-medium whitespace-nowrap">
                    End your current session
                  </span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-300" />
            </button>
          </div>
        </div>

        <BottomNav />

        {/* Profile Footer */}
        <div className="pt-8 pb-12 flex flex-col items-center opacity-30">
          <p className="text-[12px] font-bold tracking-widest text-[#1C1C1C] uppercase">
            Fx-Remit v1.0.42
          </p>
          <p className="text-[10px] font-medium text-[#1C1C1C]">
            Secure Production Environment
          </p>
        </div>
      </div>

      {/* Security Setup Modal */}
      {showSetup && (
        <SecuritySetup
          onComplete={() => setShowSetup(false)}
          onCancel={() => setShowSetup(false)}
          userId={dbUser?.id || 'user'}
          userName={dbUser?.displayName || 'User'}
        />
      )}

      <AboutSheet isOpen={showAbout} onClose={() => setShowAbout(false)} />
      <EditProfileSheet isOpen={showEdit} onClose={() => setShowEdit(false)} />
      <AutoLockSheet isOpen={showAutoLock} onClose={() => setShowAutoLock(false)} />
    </div>
  );
}
