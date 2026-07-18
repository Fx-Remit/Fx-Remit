'use client';

import { ChevronLeft, Copy, Share2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, Suspense, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { QRCodeSVG } from 'qrcode.react';
import { useUserStore } from '@/store/user-store';
import { getLatestDeposit } from '@/app/actions/transaction.actions';
import { AddCashSuccess } from '@/components/AddCashSuccess';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const NETWORK_NAMES: Record<string, string> = {
  celo: 'Celo network',
  base: 'Base network',
};

const CHAIN_IDS: Record<string, number> = {
  celo: 42220,
  base: 8453,
};

function AmountPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || 'USDT';
  const network = searchParams.get('network') || 'celo';

  const tokenSymbol = token.toUpperCase();
  const networkName = NETWORK_NAMES[network] || 'Celo network';
  const chainId = CHAIN_IDS[network] || 42220;

  const { user, ready, getAccessToken } = usePrivy();
  const { profile: dbUser } = useUserStore();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const queryClient = useQueryClient();

  const { data: latestDeposit } = useQuery({
    queryKey: ['latest-deposit', dbUser?.id, chainId],
    enabled: !!dbUser?.id && !!dbUser?.walletAddress,
    queryFn: async () => {
      if (!dbUser?.id) return null;

      try {
        const accessToken = await getAccessToken();
        if (accessToken) {
          await fetch('/api/deposit/sync', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ chainId }),
          });
        }
      } catch (err) {
        console.error('[add-cash] deposit sync failed', err);
      }

      return getLatestDeposit(dbUser.id);
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'VERIFIED') {
        queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id] });
        return false;
      }
      return 5000;
    },
  });

  const isSuccess =
    latestDeposit?.status === 'COMPLETED' || latestDeposit?.status === 'VERIFIED';

  const walletAddress = useMemo(() => {
    if (dbUser?.walletAddress) return dbUser.walletAddress;

    if (ready && user) {
      const wallet = user.linkedAccounts?.find((a) => a.type === 'wallet');
      return wallet?.type === 'wallet' ? wallet.address : 'Loading...';
    }

    return 'Loading...';
  }, [user, ready, dbUser]);

  const qrValue = useMemo(() => {
    if (walletAddress === 'Loading...') return '';
    return walletAddress;
  }, [walletAddress]);

  const handleCopy = () => {
    if (walletAddress === 'Loading...') return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (walletAddress === 'Loading...') return;

    const shareMessage = `My FX Remit Deposit Address (${networkName}): ${walletAddress}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FX Remit Address',
          text: shareMessage,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafd] flex flex-col">
      <div className="bg-white px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50">
        <Link
          href="/add-cash"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-semibold text-[#1C1C1C]">
          Add {tokenSymbol}
        </h1>
      </div>

      <div className="flex-1 px-5 pt-8 pb-32">
        <div className="flex justify-center mb-6 text-center">
          <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100/50 min-h-[230px] flex items-center justify-center">
            {isSuccess && latestDeposit ? (
              <AddCashSuccess amount={latestDeposit.amountUsd} token={tokenSymbol} />
            ) : (
              <div className="w-[180px] h-[180px] bg-white flex items-center justify-center overflow-hidden">
                {walletAddress !== 'Loading...' && qrValue ? (
                  <QRCodeSVG
                    value={qrValue}
                    size={180}
                    level="H"
                    includeMargin={false}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-50 rounded-lg flex items-center justify-center animate-pulse">
                    <div className="w-12 h-12 rounded-full border-2 border-blue-100 border-t-blue-500 animate-spin" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {!isSuccess && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-[16px] p-4">
            <p className="text-amber-800 text-[13px] font-semibold leading-relaxed">
              IMPORTANT: Send ONLY {tokenSymbol} via the {networkName}.
              Depositing any other asset or using a different network will result in permanent loss of funds.
            </p>
          </div>
        )}

        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100/50 p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">
                Deposit Address
              </p>
              <div className="mt-1">
                {walletAddress !== 'Loading...' && (
                  <p className="text-[#1C1C1C] text-[15px] font-medium break-all leading-relaxed pr-2">
                    {walletAddress}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleCopy}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                copied ? 'bg-green-500 text-white' : 'bg-[#D8E9FF] text-[#2261FE]'
              }`}
            >
              <Copy size={20} />
            </button>
          </div>

          <div>
            <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">Network</p>
            <p className="text-[#1C1C1C] text-[16px] font-semibold">{networkName}</p>
          </div>

          <div>
            <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">Rate</p>
            <p className="text-[#1C1C1C] text-[16px] font-semibold">1 USD = 1 {tokenSymbol}</p>
          </div>

          <div className="flex justify-between gap-4 pt-1">
            <div>
              <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">
                Minimum deposit
              </p>
              <p className="text-[#1C1C1C] text-[15px] font-semibold">1 {tokenSymbol}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-[12px] font-medium mb-1 tracking-wide">
                Maximum deposit
              </p>
              <p className="text-[#1C1C1C] text-[15px] font-semibold">50,000.00 {tokenSymbol}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-5 flex justify-center items-center gap-[10px] z-50">
        <button
          onClick={handleShare}
          className={`flex-1 h-[62px] font-bold text-[16px] flex items-center justify-center gap-2 rounded-[7px] active:scale-95 transition-all ${shared ? 'bg-green-500 text-white border-green-500' : 'bg-white border border-[#2261FE] text-[#2261FE]'
            }`}
        >
          <Share2 size={20} />
          {shared ? 'Copied!' : 'Share'}
        </button>
        <Link
          href="/home"
          className="flex-1 h-[62px] bg-[#2261FE] text-white font-bold text-[16px] flex items-center justify-center rounded-[7px] active:scale-95 transition-transform"
        >
          Done
        </Link>
      </div>
    </div>
  );
}

export default function AmountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8fafd] flex items-center justify-center flex-col gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#2261FE]" />
          <p className="text-[#888888] font-medium">Loading deposit details...</p>
        </div>
      }
    >
      <AmountPageContent />
    </Suspense>
  );
}
