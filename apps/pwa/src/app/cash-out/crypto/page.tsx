'use client';

import { ChevronLeft, ChevronDown, X, AlertCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, Suspense, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/store/user-store';
import { parseUnits, encodeFunctionData, isAddress } from 'viem';
import { postCancelPending } from '@/lib/cash-out/create-pending-client';
import { spendableLedgerUsd } from '@/lib/cash-out/spendable-balance';
import { tokenBalanceForChain } from '@/lib/cash-out/token-balances';

const NETWORK_DATA: Record<string, { name: string; icon: string; chainId: number; hex: string }> = {
  celo: { name: 'Celo Mainnet', icon: '/cel2.svg', chainId: 42220, hex: '0xa4ec' },
  base: { name: 'Base Mainnet', icon: '/base.svg', chainId: 8453, hex: '0x2105' },
};

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type CryptoReserveSession = {
  externalId: string;
  orderId?: string;
  abandonToken?: string;
  /** USD amount reserved on the ledger — must match on-chain transfer. */
  amountUsd: string;
  /** Set after eth_sendTransaction — retries must only re-sync, never re-broadcast. */
  txHash?: string;
};

async function ensureChain(
  wallet: { switchChain: (chainId: number | string) => Promise<void> },
  provider: Eip1193Provider,
  network: keyof typeof NETWORK_DATA,
) {
  const meta = NETWORK_DATA[network];
  await wallet.switchChain(meta.chainId);

  const chainIdHex = String(
    await provider.request({ method: 'eth_chainId' }),
  ).toLowerCase();
  if (chainIdHex !== meta.hex) {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: meta.hex }],
    });
    const again = String(
      await provider.request({ method: 'eth_chainId' }),
    ).toLowerCase();
    if (again !== meta.hex) {
      throw new Error(`Please switch your wallet to ${meta.name}`);
    }
  }
}

function CryptoCashOutContent() {
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') || 'USDT').toUpperCase();

  /** Native CELO and cUSD are not supported for cash-out (USD ledger; USDC/USDT only). */
  const tokenUnsupported = token === 'CELO' || token === 'CUSD';
  const [walletAddress, setWalletAddress] = useState('');
  const [network, setNetwork] = useState<'base' | 'celo'>('base');
  const [amount, setAmount] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const reserveSessionRef = useRef<CryptoReserveSession | null>(null);
  /** True after broadcast when sync-hash still needs to succeed — bypasses spendable gate. */
  const [syncRetryAvailable, setSyncRetryAvailable] = useState(false);
  const [removingAddressId, setRemovingAddressId] = useState<string | null>(null);

  const { getAccessToken, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { profile: dbUser } = useUserStore();
  const queryClient = useQueryClient();

  const { data: balanceData } = useQuery({
    queryKey: ['live-wallet-balance', dbUser?.walletAddress],
    queryFn: async () => {
      const accessToken = await getAccessToken();
      const res = await fetch('/api/deposit/balance', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Balance fetch failed: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!dbUser?.walletAddress && !!authenticated,
    staleTime: 5_000,
    retry: 1,
  });

  const spendable = spendableLedgerUsd({
    balanceData,
    fallbackWalletBalance: (dbUser as { walletBalance?: { toString(): string } })
      ?.walletBalance,
  });
  const availableBalance = spendable.amount;

  // Real on-chain holding of the specific token+network selected — this is
  // what actually bounds the send (a real eth_sendTransaction from the
  // user's own wallet), separate from the ledger's spendable USD total.
  const liveTokenBalance = tokenBalanceForChain(
    balanceData?.perChain,
    NETWORK_DATA[network].chainId,
    token,
  );
  const liveTokenBalanceLabel = liveTokenBalance.toFixed(2);

  type SavedAddressRow = { id: string; network: string; address: string; label: string | null };

  const { data: savedAddressesData, isLoading: isLoadingAddresses } = useQuery({
    queryKey: ['crypto-addresses', dbUser?.id],
    queryFn: async () => {
      const accessToken = await getAccessToken();
      const res = await fetch('/api/user/crypto-addresses', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load saved addresses');
      }
      return (data.addresses || []) as SavedAddressRow[];
    },
    enabled: !!dbUser?.id && !!authenticated,
  });

  const savedAddresses = savedAddressesData || [];

  const selectSavedAddress = (row: SavedAddressRow) => {
    setWalletAddress(row.address);
    if (row.network === 'base' || row.network === 'celo') {
      setNetwork(row.network);
    }
  };

  const removeSavedAddress = async (row: SavedAddressRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (removingAddressId) return;
    setRemovingAddressId(row.id);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`/api/user/crypto-addresses/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove address');
      }
      await queryClient.invalidateQueries({ queryKey: ['crypto-addresses'] });
    } catch (err) {
      console.error('[CRYPTO CASHOUT] remove address failed:', err);
    } finally {
      setRemovingAddressId(null);
    }
  };

  const handleSend = async () => {
    setIsConfirmOpen(false);
    setStatus('processing');
    setError(null);

    let externalId: string | undefined = reserveSessionRef.current?.externalId;
    let abandonToken: string | undefined = reserveSessionRef.current?.abandonToken;
    let broadcasted = !!reserveSessionRef.current?.txHash;

    try {
      if (tokenUnsupported) {
        throw new Error(
          "This token isn't supported for cash-out. Use USDC or USDT.",
        );
      }

      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      // After a successful broadcast, only retry sync-hash — never reserve/send again.
      // Must run before spendable.ready gate so incomplete balance sync cannot block linking.
      if (reserveSessionRef.current?.txHash && reserveSessionRef.current.orderId) {
        const syncRes = await fetch('/api/transaction/sync-hash', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            orderId: reserveSessionRef.current.orderId,
            txHash: reserveSessionRef.current.txHash,
          }),
        });
        if (!syncRes.ok) {
          const syncErr = await syncRes.json().catch(() => ({}));
          throw new Error(
            typeof syncErr.error === 'string'
              ? syncErr.error
              : 'Broadcast succeeded but failed to sync. Contact support with your tx hash.',
          );
        }
        reserveSessionRef.current = null;
        setSyncRetryAvailable(false);
        await queryClient.invalidateQueries({ queryKey: ['live-wallet-balance'] });
        await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
        await queryClient.invalidateQueries({ queryKey: ['crypto-addresses'] });
        setStatus('success');
        return;
      }

      if (!spendable.ready) {
        throw new Error(
          spendable.syncIncomplete
            ? 'Balance sync incomplete. Wait a moment and try again.'
            : 'Balance unavailable. Refresh and try again.',
        );
      }
      if (!isAddress(walletAddress)) {
        throw new Error('Enter a valid destination wallet address');
      }

      const wallet = wallets[0];
      if (!wallet) throw new Error('No wallet connected. Please sign in again.');

      const requestedUsd = Number(amount);
      if (!Number.isFinite(requestedUsd) || requestedUsd <= 0) {
        throw new Error('Enter a valid amount');
      }

      if (requestedUsd > liveTokenBalance) {
        throw new Error(
          `You don't have enough ${token} on ${NETWORK_DATA[network]?.name || network} in your wallet.`,
        );
      }

      // If the form amount changed since the last reserve, abandon the old row first.
      if (
        reserveSessionRef.current?.externalId &&
        reserveSessionRef.current.amountUsd != null &&
        Number(reserveSessionRef.current.amountUsd) !== requestedUsd
      ) {
        await postCancelPending(reserveSessionRef.current.externalId, {
          accessToken,
          abandonToken: reserveSessionRef.current.abandonToken,
        });
        reserveSessionRef.current = null;
        setSyncRetryAvailable(false);
      }

      const idempotencyKey =
        reserveSessionRef.current?.externalId ??
        `crypto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const pendingRes = await fetch('/api/transaction/create-crypto-pending', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          amountUsd: requestedUsd,
          destinationAddress: walletAddress,
          network,
          token,
          externalId: idempotencyKey,
        }),
      });
      const pendingData = await pendingRes.json().catch(() => ({}));
      if (!pendingRes.ok) {
        throw new Error(
          typeof pendingData.error === 'string'
            ? pendingData.error
            : 'Failed to reserve balance',
        );
      }

      externalId = pendingData.transaction?.externalId as string | undefined;
      abandonToken = pendingData.abandonToken as string | undefined;
      const orderId = pendingData.transaction?.orderId as string | undefined;
      const reservedUsd = String(
        pendingData.transaction?.amountUsd ?? requestedUsd,
      );
      const transfer = pendingData.transfer as {
        chainId: number;
        network: 'base' | 'celo';
        tokenAddress: `0x${string}`;
        decimals: number;
        destinationAddress: string;
      };

      if (!orderId || !transfer || !externalId) {
        throw new Error('Invalid reserve response');
      }

      // On-chain amount must equal ledger reserve (not a possibly-edited form value).
      if (Number(reservedUsd) !== requestedUsd) {
        throw new Error(
          `Reserved amount ($${reservedUsd}) does not match send amount ($${requestedUsd}). Try again.`,
        );
      }

      reserveSessionRef.current = {
        externalId,
        orderId,
        abandonToken,
        amountUsd: reservedUsd,
      };

      const provider = (await wallet.getEthereumProvider()) as Eip1193Provider;
      await ensureChain(wallet, provider, transfer.network);

      const amountRaw = parseUnits(reservedUsd, transfer.decimals);
      const txHash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: wallet.address,
            to: transfer.tokenAddress,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'transfer',
              args: [transfer.destinationAddress as `0x${string}`, amountRaw],
            }),
          },
        ],
      })) as string;

      broadcasted = true;
      reserveSessionRef.current = {
        ...reserveSessionRef.current,
        txHash,
      };
      setSyncRetryAvailable(true);

      const syncRes = await fetch('/api/transaction/sync-hash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId, txHash }),
      });
      if (!syncRes.ok) {
        const syncErr = await syncRes.json().catch(() => ({}));
        throw new Error(
          typeof syncErr.error === 'string'
            ? syncErr.error
            : 'Broadcast succeeded but failed to sync. Contact support with your tx hash.',
        );
      }

      reserveSessionRef.current = null;
      setSyncRetryAvailable(false);
      await queryClient.invalidateQueries({ queryKey: ['live-wallet-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['crypto-addresses'] });
      console.log('[CRYPTO CASHOUT] Tx Hash:', txHash);
      setStatus('success');
    } catch (err: unknown) {
      console.error('[CRYPTO CASHOUT] Failed:', err);
      if (!broadcasted && externalId) {
        try {
          const tokenForCancel = await getAccessToken();
          await postCancelPending(externalId, {
            accessToken: tokenForCancel || undefined,
            abandonToken,
          });
          reserveSessionRef.current = null;
          setSyncRetryAvailable(false);
          await queryClient.invalidateQueries({ queryKey: ['live-wallet-balance'] });
          await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
        } catch (cancelErr) {
          console.error('[CRYPTO CASHOUT] cancel after failure failed:', cancelErr);
        }
      }
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setStatus('idle');
    }
  };

  const networks = [
    { id: 'celo' as const, name: 'Celo network' },
    { id: 'base' as const, name: 'Base network' },
  ];

  const selectedNetwork = networks.find((n) => n.id === network)?.name || 'Choose network';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50">
        <Link
          href="/home"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-semibold text-[#1C1C1C]">
          Choose address
        </h1>
      </div>

      <div className="flex-1 px-5 pt-8 pb-32">
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <img src={`/${token.toLowerCase()}.svg`} alt={token} className="w-8 h-8 rounded-full" />
            <span className="font-semibold text-[#1C1C1C]">Cashing out {token}</span>
          </div>

          {(error || tokenUnsupported || spendable.syncIncomplete) && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-[12px] flex items-center gap-3">
              <AlertCircle size={20} className="text-red-500 flex-shrink-0" />
              <p className="text-red-600 text-[13px] font-medium leading-tight">
                {tokenUnsupported
                  ? "This token isn't supported for cash-out. Use USDC or USDT."
                  : spendable.syncIncomplete && !error
                    ? 'Balance sync incomplete — cash-out is paused until sync finishes.'
                    : error}
              </p>
            </div>
          )}

          <div>
            <label
              style={{ fontWeight: 500, fontSize: '16px', color: '#1C1C1C', lineHeight: '100%' }}
              className="mb-3 block"
            >
              Wallet address
            </label>
            <input
              type="text"
              placeholder="0x1e763r..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              style={{ borderColor: '#D1D1D1' }}
              className="w-full h-[56px] rounded-[12px] bg-white border px-4 text-[#1C1C1C] text-[15px] placeholder:text-gray-300 focus:outline-none focus:border-[#2261FE] transition-colors shadow-sm"
            />
          </div>

          {!tokenUnsupported && (
            <div className="relative z-20">
              <label
                style={{ fontWeight: 500, fontSize: '16px', color: '#1C1C1C', lineHeight: '100%' }}
                className="mb-3 block"
              >
                Network
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  style={{ borderColor: '#D1D1D1' }}
                  className="w-full h-[56px] rounded-[12px] bg-white border px-4 flex items-center justify-between text-[#1C1C1C] text-[15px] focus:outline-none focus:border-[#2261FE] transition-colors shadow-sm"
                >
                  <span className={network ? 'text-[#1C1C1C]' : 'text-gray-300'}>
                    {selectedNetwork}
                  </span>
                  <ChevronDown
                    size={20}
                    className={`text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-[12px] shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {networks.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setNetwork(n.id);
                          setIsDropdownOpen(false);
                        }}
                        className="w-full px-4 py-4 text-left text-[15px] text-[#1C1C1C] hover:bg-gray-50 flex items-center justify-between transition-colors border-b last:border-none border-gray-50"
                      >
                        {n.name}
                        {network === n.id && <div className="w-2 h-2 rounded-full bg-[#2261FE]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label
              style={{ fontWeight: 500, fontSize: '16px', color: '#1C1C1C', lineHeight: '100%' }}
              className="mb-3 block"
            >
              Amount to send
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1C1C1C] font-semibold text-[16px]">
                $
              </span>
              <input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ borderColor: '#D1D1D1' }}
                className="w-full h-[56px] rounded-[12px] bg-white border pl-8 pr-4 text-[#1C1C1C] text-[16px] font-semibold focus:outline-none focus:border-[#2261FE] transition-colors shadow-sm"
              />
            </div>
            <p
              style={{ fontWeight: 500, fontSize: '12px', color: '#888888', lineHeight: '100%' }}
              className="mt-2 font-medium"
            >
              Available: ${availableBalance}
              {!spendable.ready ? ' (syncing…)' : ''}
            </p>
            {!tokenUnsupported && balanceData && (
              <p
                style={{
                  fontWeight: 500,
                  fontSize: '12px',
                  color: liveTokenBalance > 0 ? '#888888' : '#E11D48',
                  lineHeight: '100%',
                }}
                className="mt-1 font-medium"
              >
                You hold ${liveTokenBalanceLabel} {token} on {NETWORK_DATA[network]?.name}
              </p>
            )}
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between mb-8">
            <h2
              style={{ fontWeight: 600, fontSize: '18px', color: '#1C1C1C', lineHeight: '100%' }}
              className="font-bold"
            >
              Saved addresses
            </h2>
          </div>

          {isLoadingAddresses ? (
            <p className="py-6 text-[15px] font-medium text-[#888888]">Loading addresses…</p>
          ) : savedAddresses.length === 0 ? (
            <div className="mt-4 flex w-full flex-col items-center justify-center py-6">
              <div className="w-[220px] h-auto mb-6">
                <img src="/non added.svg" alt="No saved addresses" className="w-full h-auto" />
              </div>
              <p className="text-center text-[15px] font-medium text-[#888888]">
                Addresses you cash out to will show up here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedAddresses.map((row) => (
                <div
                  key={row.id}
                  className="flex w-full items-center gap-2 rounded-[16px] border border-gray-100 bg-[#F8FBFF]"
                >
                  <button
                    type="button"
                    onClick={() => selectSavedAddress(row)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[#E1EFFF]"
                  >
                    {NETWORK_DATA[row.network] ? (
                      <img
                        src={NETWORK_DATA[row.network].icon}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-contain"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E1EFFF] text-[14px] font-bold text-[#2261FE]">
                        {row.network.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-[#1C1C1C]">
                        {row.label || `${row.address.slice(0, 6)}...${row.address.slice(-4)}`}
                      </p>
                      <p className="truncate text-[13px] font-medium text-[#888888]">
                        {NETWORK_DATA[row.network]?.name || row.network} · {row.address.slice(0, 6)}...{row.address.slice(-4)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${row.address}`}
                    disabled={removingAddressId === row.id}
                    onClick={(e) => void removeSavedAddress(row, e)}
                    className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#888888] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          style={{
            height: '62px',
            borderRadius: '7px',
            fontWeight: 500,
            fontSize: '18px',
            color: '#F8F8FF',
            lineHeight: '100%',
          }}
          className="flex w-full items-center justify-center bg-[#2261FE] shadow-lg shadow-blue-200/50 transition-transform active:scale-[0.98] disabled:opacity-50"
          disabled={
            tokenUnsupported ||
            (syncRetryAvailable
              ? false
              : !spendable.ready ||
                !walletAddress ||
                !amount ||
                parseFloat(amount) <= 0 ||
                parseFloat(amount) > parseFloat(availableBalance) ||
                parseFloat(amount) > liveTokenBalance)
          }
          onClick={() => {
            if (syncRetryAvailable) {
              void handleSend();
              return;
            }
            setIsConfirmOpen(true);
          }}
        >
          {syncRetryAvailable ? 'Retry sync' : 'Confirm & Send'}
        </button>
      </div>

      {isConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsConfirmOpen(false)} />

          <div
            className="relative w-full bg-[#f6f6f6] rounded-t-[40px] px-6 pb-10 pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ maxWidth: '430px', margin: '0 auto' }}
          >
            <div className="flex justify-center mb-5">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            <button
              onClick={() => setIsConfirmOpen(false)}
              className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center text-gray-900 bg-gray-200/50 rounded-full"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-[20px] font-bold text-[#1C1C1C]">Confirm transaction</h2>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 flex flex-col items-center mb-8">
              <p className="text-gray-400 text-[14px] font-medium mb-1">Total amount</p>
              <p className="text-[#1C1C1C] text-[40px] font-bold mb-8">${amount || '0'}</p>

              <div className="w-full space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[#888888] text-[14px] font-medium">Recipient</span>
                  <span className="text-[#1C1C1C] text-[14px] font-semibold text-right break-all max-w-[200px]">
                    {walletAddress}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#888888] text-[14px] font-medium">Network</span>
                  <div className="flex items-center gap-2">
                    <img
                      src={NETWORK_DATA[network]?.icon}
                      alt=""
                      className="w-6 h-6 object-contain"
                    />
                    <span className="text-[#1C1C1C] text-[14px] font-semibold">
                      {NETWORK_DATA[network]?.name}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                  <span className="text-[#888888] text-[14px] font-medium">Recipient gets</span>
                  <span className="text-[#1C1C1C] text-[15px] font-bold">
                    ${amount ? parseFloat(amount).toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleSend}
                style={{ height: '62px', borderRadius: '12px' }}
                className="w-full bg-[#2261FE] text-white font-bold text-[18px]"
              >
                Send
              </button>
              <button
                onClick={() => setIsConfirmOpen(false)}
                style={{ height: '62px', borderRadius: '12px', borderColor: '#2261FE' }}
                className="w-full bg-white text-[#2261FE] font-bold text-[18px] border"
              >
                Edit details
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'processing' && (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white rounded-[32px] p-8 flex flex-col items-center">
            <div className="w-full flex justify-center items-center mb-12">
              <h2 className="text-[24px] font-bold text-[#1C1C1C]">Sending...</h2>
            </div>
            <div className="mt-10 mb-20">
              <div className="w-16 h-16 border-4 border-[#2261FE]/20 border-t-[#2261FE] rounded-full animate-spin" />
            </div>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="bg-white rounded-[20px] p-8 flex flex-col items-center relative shadow-[0px_4px_30px_rgba(0,0,0,0.05)] border border-gray-100 translate-y-[-20px]"
            style={{ width: '392px', height: '449px' }}
          >
            <div className="w-full flex justify-between items-center mb-6">
              <h2 className="text-[22px] font-bold text-[#1C1C1C]">Success!</h2>
              <Link
                href="/home"
                className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </Link>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-[80px] h-[80px] bg-green-50 rounded-full flex items-center justify-center mb-8">
                <div className="w-[40px] h-[40px] bg-green-500 rounded-full flex items-center justify-center text-white">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>

              <h3
                className="font-[700] leading-[120%] text-center px-4 mb-4"
                style={{ color: '#464446', fontSize: '24px' }}
              >
                You have successfully sent {amount} {token} to {walletAddress.slice(0, 6)}...
                {walletAddress.slice(-4)}
              </h3>

              <p className="text-[#888888] text-[15px] font-medium max-w-[280px]">
                Kindly check your transaction status in your wallet.
              </p>
            </div>

            <div className="w-full mt-8">
              <Link
                href="/home"
                className="w-full h-[65px] bg-[#2261FE] text-white font-bold text-[18px] flex items-center justify-center rounded-[7px] shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CryptoCashOutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">Loading...</div>
      }
    >
      <CryptoCashOutContent />
    </Suspense>
  );
}
