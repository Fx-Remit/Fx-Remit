'use client';

import {
  Home,
  FileText,
  User,
  ChevronRight,
  ShieldCheck,
  HelpCircle,
  LogOut,
  Settings,
  Edit2,
  Lock,
  Fingerprint,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { useSecurityStore } from '@/store/security-store';
import { hashPin, generateSalt, registerBiometrics, isBiometricSupported } from '@/lib/security';
import { SecuritySetup } from '@/components/security/SecuritySetup';

export default function ProfilePage() {
  const { logout, exportWallet, user: privyUser } = usePrivy();
  const { profile: dbUser, setProfile } = useUserStore();
  const {
    isSecurityEnabled,
    isBiometricEnabled,
    setPin,
    setBiometricEnabled,
    setBiometricCredentialId,
    clearSecurity
  } = useSecurityStore();

  const router = useRouter();
  const [isBioSupported, setIsBioSupported] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);

  React.useEffect(() => {
    isBiometricSupported().then(setIsBioSupported);
  }, []);

  const handleLogout = async () => {
    await logout();
    setProfile(null);
    router.push('/');
  };

  const handleSetupSecurity = () => {
    setShowSetup(true);
  };

  const handleExportWallet = async () => {
    try {
      await exportWallet();
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const displayName = dbUser?.displayName || dbUser?.fullName || 'User';
  const avatar = dbUser?.avatarUrl || `https://api.dicebear.com/8.x/lorelei/svg?seed=${dbUser?.id}&backgroundColor=b6e3f4`;
  const emailOrWallet = dbUser?.email || (dbUser?.walletAddress ? `${dbUser.walletAddress.slice(0, 6)}...${dbUser.walletAddress.slice(-4)}` : '');

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
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
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
            <button className="w-10 h-10 flex items-center justify-center bg-[#F8FAFD] rounded-full text-[#1C1C1C] active:scale-95 transition-all">
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
            </div>

            {/* Fees Paid */}
            <div className="flex-1 bg-white rounded-[20px] p-4 border border-gray-100 shadow-[0px_4px_15px_rgba(0,0,0,0.01)] flex flex-col items-center text-center">
              <div className="w-[45px] h-[45px] mb-3 flex items-center justify-center">
                <img src="/fees.svg" alt="" className="w-full h-full object-contain" />
              </div>
              <h3 className="text-[#1C1C1C] text-[16px] font-bold leading-tight">$0.00</h3>
            </div>
          </div>
        </div>

        {/* Menu Section */}
        <div className="px-6 space-y-4">
          <h3 className="text-[#6D6D6D] text-[14px] font-bold uppercase tracking-widest px-1">
            Security & Support
          </h3>

          <div className="bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-[0px_4px_25px_rgba(0,0,0,0.02)]">
            <button 
              onClick={isSecurityEnabled ? undefined : handleSetupSecurity}
              className="w-full text-left outline-none"
            >
              <MenuButton
                icon={<ShieldCheck size={20} className={isSecurityEnabled ? "text-green-500" : "text-[#10B981]"} />}
                label={isSecurityEnabled ? "Security Active" : "Setup App Lock"}
                subLabel={isSecurityEnabled ? "Protection is running" : "Set a 6-digit PIN"}
              />
            </button>
            <div className="h-[1px] bg-gray-50 mx-5" />

            {isSecurityEnabled && (
              <>
                <button 
                  onClick={() => {
                    if (!isBiometricEnabled) {
                      // Can't enable biometrics without going through setup
                      setShowSetup(true);
                    } else {
                      setBiometricEnabled(false);
                    }
                  }}
                  className="w-full text-left outline-none"
                >
                  <MenuButton
                    icon={<Fingerprint size={20} className={isBiometricEnabled ? "text-blue-500" : "text-gray-400"} />}
                    label="FaceID / TouchID"
                    subLabel={isBiometricEnabled ? "Enabled" : "Disabled"}
                  />
                </button>
                <div className="h-[1px] bg-gray-50 mx-5" />
                <button 
                  onClick={() => {
                    if (window.confirm('Remove App Lock? This will disable your PIN and biometric protection.')) {
                      clearSecurity();
                    }
                  }}
                  className="w-full text-left outline-none"
                >
                  <MenuButton
                    icon={<Lock size={20} className="text-red-400" />}
                    label="Remove App Lock"
                    subLabel="Disable all security"
                  />
                </button>
                <div className="h-[1px] bg-gray-50 mx-5" />
              </>
            )}

            {hasEmbeddedWallet && (
              <>
                <button onClick={handleExportWallet} className="w-full text-left outline-none">
                  <MenuButton
                    icon={<ArrowRight size={20} className="text-orange-500" />}
                    label="Export Private Key"
                    subLabel="Securely backup your wallet"
                  />
                </button>
                <div className="h-[1px] bg-gray-50 mx-5" />
              </>
            )}
            
            <MenuButton
              icon={<HelpCircle size={20} className="text-[#2261FE]" />}
              label="Contact Support"
              subLabel="Help Center & Chat"
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

        {/* Bottom Navigation */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-5 flex justify-center max-w-[430px]">
          <div
            className="w-full max-w-[320px] bg-[#D8E9FF] rounded-[70px] py-[15px] px-[30px] flex items-center justify-between shadow-[0px_4px_4px_0px_#00000040]"
            style={{ height: '75px' }}
          >
            <Link
              href="/home"
              className="flex flex-col items-center gap-1 text-[#1C1C1C]/40 hover:text-[#1C1C1C] transition-colors"
            >
              <Home size={28} />
              <span className="font-semibold text-[13px]">Home</span>
            </Link>
            <Link
              href="/history"
              className="flex flex-col items-center gap-1 text-[#1C1C1C]/40 hover:text-[#1C1C1C] transition-colors"
            >
              <FileText size={28} />
              <span className="font-semibold text-[13px]">History</span>
            </Link>
            <Link href="/profile" className="flex flex-col items-center gap-1 text-[#1C1C1C]">
              <User size={28} />
              <span className="font-semibold text-[13px]">Profile</span>
            </Link>
          </div>
        </div>
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
    </div>
  );
}

function MenuButton({
  icon,
  label,
  subLabel,
}: {
  icon: React.ReactNode;
  label: string;
  subLabel: string;
}) {
  return (
    <button className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors group">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[#f8fafd] flex items-center justify-center text-[#1C1C1C] group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[17px] font-bold text-[#1C1C1C]">{label}</span>
          <span className="text-[13px] text-[#6D6D6D] font-medium whitespace-nowrap">
            {subLabel}
          </span>
        </div>
      </div>
      <ChevronRight
        size={18}
        className="text-gray-300 group-hover:text-[#1C1C1C] transition-colors"
      />
    </button>
  );
}
