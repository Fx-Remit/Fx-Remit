'use client';

import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  usePrivy,
  useSendTransaction,
  useSigners,
  useWallets,
} from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { parseUnits, encodeFunctionData, isAddress, type Hex } from 'viem';
import { base } from 'viem/chains';
import {
  SettlementPrefetchSession,
  StaleSettlementError,
  type PreparedSettlement,
} from '@/lib/cash-out/settlement-prefetch';
import {
  abandonPrefetchSession,
  postCreatePending,
} from '@/lib/cash-out/create-pending-client';
import { fetchFreshQuoteValidUntil } from '@/lib/cash-out/fetch-retail-quote';

export type PrefetchPhase = 'preparing' | 'ready' | 'error';

function settlementAmountHuman(
  paycrest: PreparedSettlement['paycrest'],
  fallbackSendAmount: string,
): string {
  const fromProvider = paycrest.amountToTransfer;
  if (fromProvider == null || fromProvider === '') return fallbackSendAmount;
  return String(fromProvider);
}

function isUserRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request') ||
    lower.includes('4001')
  );
}

interface ConfirmTransactionSheetProps {
  session: SettlementPrefetchSession;
  prefetchPhase: PrefetchPhase;
  prefetchError: string | null;
  onClose: () => void;
  sendAmount: string;
  receiveAmount: number;
  token: string;
  currency: string;
  accNum: string;
  accName: string;
  bankName: string;
  spreadBps?: number;
  /** Parent tracks Send in-flight for UI; abandon still runs until consumed. */
  onSendingChange?: (sending: boolean) => void;
  /** Server-bound fiat from create-pending (prefetch or Send retry). */
  onPayoutFiatBound?: (payoutFiat: number) => void;
}

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

const BASE_TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

/**
 * Presentational confirm sheet. Prefetch lifecycle is owned by the parent
 * Confirm click / Close click this component never starts work on render.
 */
export function ConfirmTransactionSheet({
  session,
  prefetchPhase,
  prefetchError,
  onClose,
  sendAmount,
  receiveAmount,
  token,
  currency,
  accNum,
  accName,
  bankName,
  spreadBps,
  onSendingChange,
  onPayoutFiatBound,
}: ConfirmTransactionSheetProps) {
  const [status, setStatus] = useState<
    'idle' | 'creating' | 'sending' | 'success' | 'granting'
  >('idle');
  const { getAccessToken, user: privyUser } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { addSigners } = useSigners();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const feePercent = spreadBps ? spreadBps / 100 : 0.75;
  const netAmount = receiveAmount;
  const amountBeforeFee = receiveAmount / (1 - feePercent / 100);
  const currencyName = currency === 'NGN' ? 'Naira' : currency;
  const firstName = accName.split(' ')[0];

  const displayError = error ?? prefetchError;

  const embeddedWallet = useMemo(() => {
    const fromWallets = wallets.find((w) => w.walletClientType === 'privy');
    if (fromWallets) return fromWallets;
    return wallets[0] ?? null;
  }, [wallets]);

  const isEmbeddedPrivy = embeddedWallet?.walletClientType === 'privy';

  const [localDelegated, setLocalDelegated] = useState(false);
  /** Once we have a reserved order this sheet must not open a second create-pending. */
  const reservedOrderIdRef = useRef<string | null>(null);

  const isDelegated = useMemo(() => {
    if (localDelegated) return true;
    if (!embeddedWallet?.address || !privyUser?.linkedAccounts) return false;
    const addr = embeddedWallet.address.toLowerCase();
    return privyUser.linkedAccounts.some(
      (a) =>
        a.type === 'wallet' &&
        (a as { walletClientType?: string }).walletClientType === 'privy' &&
        (a as { address?: string }).address?.toLowerCase() === addr &&
        (a as { delegated?: boolean }).delegated === true,
    );
  }, [embeddedWallet?.address, privyUser?.linkedAccounts, localDelegated]);

  /** Dev/ops: Privy linked-account delegated flags (server uses the same signal). */
  const logDelegationSnapshot = (label: string, extra?: Record<string, unknown>) => {
    const addr = embeddedWallet?.address?.toLowerCase() ?? null;
    const wallets = (privyUser?.linkedAccounts ?? [])
      .filter((a) => a.type === 'wallet')
      .map((a) => {
        const w = a as {
          address?: string;
          walletClientType?: string;
          delegated?: boolean;
          id?: string;
        };
        return {
          address: w.address ?? null,
          walletClientType: w.walletClientType ?? null,
          delegated: w.delegated === true,
          id: w.id ?? null,
          matchesEmbedded: Boolean(
            addr && w.address?.toLowerCase() === addr && w.walletClientType === 'privy',
          ),
        };
      });
    const embeddedRow = wallets.find((w) => w.matchesEmbedded) ?? null;
    console.info('[CONFIRM][delegation]', label, {
      embeddedAddress: embeddedWallet?.address ?? null,
      localDelegated,
      isDelegatedComputed: isDelegated,
      privyLinkedDelegated: embeddedRow?.delegated ?? null,
      embeddedWalletId: embeddedRow?.id ?? null,
      wallets,
      ...extra,
    });
  };

  const invalidateLedgerQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['transaction-history'] });
    queryClient.invalidateQueries({ queryKey: ['live-wallet-balance'] });
    queryClient.invalidateQueries({ queryKey: ['user-profile'] });
  };

  /** Restore spendable when Send fails before a real on-chain hash. */
  const cancelUnsignedReserve = async (accessToken: string | null) => {
    if (session.wasConsumed()) return;
    try {
      const result = await abandonPrefetchSession({
        session,
        accessToken,
        abandonToken: session.getAbandonToken(),
        keepalive: false,
      });
      if (result.cancelled) {
        invalidateLedgerQueries();
      }
    } catch (cancelErr) {
      console.error('[CONFIRM] cancel after unsigned failure failed:', cancelErr);
    }
  };

  const enableFasterPayouts = async (): Promise<boolean> => {
    if (!embeddedWallet?.address || !isEmbeddedPrivy) {
      setError('This payout needs the in-app wallet on this account');
      return false;
    }
    const keyQuorumId = process.env.NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID?.trim();
    if (!keyQuorumId) {
      setError('Instant Send is not configured (missing key quorum)');
      console.error(
        '[CONFIRM] NEXT_PUBLIC_PRIVY_KEY_QUORUM_ID is missing — cannot addSigners',
      );
      return false;
    }
    const policyId = process.env.NEXT_PUBLIC_PRIVY_POLICY_ID?.trim();

    setStatus('granting');
    setError(null);
    logDelegationSnapshot('before addSigners', {
      keyQuorumId,
      policyId: policyId || '(none — empty policyIds)',
    });
    try {
      // delegateWallet alone does NOT attach our key quorum — Privy stays
      // delegated:false / wallet id null. addSigners is required.
      const { user: updatedUser } = await addSigners({
        address: embeddedWallet.address,
        signers: [
          {
            signerId: keyQuorumId,
            policyIds: policyId ? [policyId] : [],
          },
        ],
      });
      setLocalDelegated(true);
      const addr = embeddedWallet.address.toLowerCase();
      const linked = updatedUser?.linkedAccounts?.find(
        (a) =>
          a.type === 'wallet' &&
          (a as { walletClientType?: string }).walletClientType === 'privy' &&
          (a as { address?: string }).address?.toLowerCase() === addr,
      ) as { delegated?: boolean; id?: string } | undefined;
      console.info('[CONFIRM][delegation] after addSigners', {
        keyQuorumId,
        policyId: policyId || null,
        privyLinkedDelegated: linked?.delegated === true,
        embeddedWalletId: linked?.id ?? null,
      });
      logDelegationSnapshot('after addSigners OK');
      return true;
    } catch (err: unknown) {
      console.error('[CONFIRM] addSigners / payout permission failed:', err);
      logDelegationSnapshot('after addSigners FAILED');
      setError(
        isUserRejection(err)
          ? 'Cancelled — tap Send to try again'
          : 'Could not continue. Please try again.',
      );
      setStatus('idle');
      return false;
    }
  };

  const handleSend = async () => {
    if (session.wasConsumed()) {
      setStatus('success');
      return;
    }

    // Mark in-flight before Privy consent so pagehide cannot cancel-pending mid-grant.
    onSendingChange?.(true);
    setError(null);

    logDelegationSnapshot('Send tapped');

    // Use a local flag — React state won't update mid-handler after grant.
    let canServerBroadcast = isEmbeddedPrivy && isDelegated;
    if (isEmbeddedPrivy && !canServerBroadcast) {
      const granted = await enableFasterPayouts();
      if (!granted) {
        onSendingChange?.(false);
        return;
      }
      canServerBroadcast = true;
    }

    logDelegationSnapshot('before create-pending / broadcast', {
      canServerBroadcast,
    });

    setStatus('creating');
    let broadcastTxHash: string | null = null;
    let accessToken: string | null = null;

    try {
      accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired — refresh the page and try again');
      }
      if (!embeddedWallet) throw new Error('No wallet connected');

      let orderData: PreparedSettlement;
      try {
        orderData = await session.awaitPrepared();
      } catch (prepErr) {
        if (session.wasAbandoned()) {
          throw new Error(
            'This payout was interrupted. Close Confirm and open it once — do not tap Send twice.',
          );
        }
        // Stale quote TTL: safe to refresh + resume same externalId (idempotent).
        // Other errors after a reserve already exists: do not open a second pending.
        if (
          !(prepErr instanceof StaleSettlementError) &&
          reservedOrderIdRef.current
        ) {
          throw new Error(
            'This payout was interrupted. Close Confirm and open it once — do not tap Send twice.',
          );
        }
        const quoteValidUntil = await fetchFreshQuoteValidUntil({
          sourceToken: token,
          destinationCurrency: currency,
        });
        session.setQuoteValidUntil(quoteValidUntil);
        session.start((body, signal) =>
          postCreatePending(body, accessToken!, signal),
        );
        orderData = await session.awaitPrepared();
      }
      reservedOrderIdRef.current = orderData.transaction.orderId;

      if (orderData.payoutFiat != null && Number.isFinite(orderData.payoutFiat)) {
        onPayoutFiatBound?.(orderData.payoutFiat);
      }

      const receiveAddress = orderData.paycrest?.receiveAddress;
      if (!receiveAddress || !isAddress(receiveAddress)) {
        throw new Error('Paycrest did not provide a valid receive address');
      }

      const settlementToken: string = orderData.paycrest?.token || 'USDC';
      const settlementTokenAddress: `0x${string}` | undefined =
        (orderData.paycrest?.tokenAddress as `0x${string}` | undefined) ||
        BASE_TOKEN_ADDRESSES[settlementToken];
      const decimals: number =
        typeof orderData.paycrest?.decimals === 'number'
          ? orderData.paycrest.decimals
          : 6;

      if (!settlementTokenAddress || !isAddress(settlementTokenAddress)) {
        throw new Error(
          `Token ${settlementToken} not supported for direct transfer yet.`,
        );
      }

      setStatus('sending');

      const amountHuman = settlementAmountHuman(orderData.paycrest, sendAmount);
      const amountRaw = parseUnits(amountHuman, decimals);
      const orderId = orderData.transaction.orderId;

      // Server-authorized broadcast when payout permission is granted (no second Approve).
      if (canServerBroadcast) {
        const broadcastRes = await fetch('/api/transaction/broadcast-settlement', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ orderId }),
        });
        const broadcastData = (await broadcastRes.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          txHash?: string;
        };

        if (broadcastRes.ok && typeof broadcastData.txHash === 'string') {
          broadcastTxHash = broadcastData.txHash;
          session.markConsumed();
          const syncRes = await fetch('/api/transaction/sync-hash', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ orderId, txHash: broadcastTxHash }),
          });
          if (!syncRes.ok) {
            console.error('[CONFIRM] sync-hash after broadcast failed:', syncRes.status);
          }
        } else if (
          broadcastRes.status === 503 ||
          broadcastData.code === 'INSTANT_SEND_NOT_CONFIGURED'
        ) {
          // Server signing unavailable require wallet confirmation.
          const { hash } = await sendTransaction(
            {
              to: settlementTokenAddress,
              data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [receiveAddress as `0x${string}`, amountRaw],
              }) as Hex,
              chainId: base.id,
            },
            {
              uiOptions: { showWalletUIs: true },
              address: embeddedWallet.address,
            },
          );
          broadcastTxHash = hash;
          session.markConsumed();

          const syncRes = await fetch('/api/transaction/sync-hash', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ orderId, txHash: broadcastTxHash }),
          });
          if (!syncRes.ok) {
            console.error('[CONFIRM] sync-hash failed:', syncRes.status);
          }
        } else if (broadcastData.code === 'NOT_DELEGATED') {
          // Pre-claim / no on-chain send — consent race. Keep session + reserve; allow Send retry.
          logDelegationSnapshot('server returned NOT_DELEGATED', {
            broadcastStatus: broadcastRes.status,
            broadcastCode: broadcastData.code,
            broadcastError: broadcastData.error ?? null,
            note: 'Server Privy user.delegated is false — localDelegated alone is not enough',
          });
          setLocalDelegated(false);
          setError('Almost ready — tap Send again to finish.');
          setStatus('idle');
          onSendingChange?.(false);
          return;
        } else if (
          broadcastData.code === 'BROADCAST_IN_PROGRESS' ||
          broadcastData.code === 'BROADCAST_UNCERTAIN'
        ) {
          // May already be on-chain — do not cancel-pending.
          session.markConsumed();
          invalidateLedgerQueries();
          setStatus('success');
          setError(
            broadcastData.code === 'BROADCAST_UNCERTAIN'
              ? 'Payment may have been submitted — check history before trying again.'
              : 'Payment is already sending — check history before trying again.',
          );
          return;
        } else {
          throw new Error(
            typeof broadcastData.error === 'string'
              ? broadcastData.error
              : 'Could not complete payout. Please try again.',
          );
        }
      } else {
        // External wallet: must use wallet UI (cannot silent-sign).
        const { hash } = await sendTransaction(
          {
            to: settlementTokenAddress,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'transfer',
              args: [receiveAddress as `0x${string}`, amountRaw],
            }) as Hex,
            chainId: base.id,
          },
          {
            uiOptions: { showWalletUIs: true },
            address: embeddedWallet.address,
          },
        );
        broadcastTxHash = hash;
        session.markConsumed();

        const syncRes = await fetch('/api/transaction/sync-hash', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ orderId, txHash: broadcastTxHash }),
        });
        if (!syncRes.ok) {
          console.error('[CONFIRM] sync-hash failed:', syncRes.status);
        }
      }

      invalidateLedgerQueries();
      setStatus('success');
      onSendingChange?.(false);
    } catch (err: unknown) {
      console.error('[CONFIRM] Transaction failed:', err);

      if (broadcastTxHash || session.wasConsumed()) {
        invalidateLedgerQueries();
        setStatus('success');
        setError(
          'Payment broadcast. Status sync may be delayed — check history before sending again.',
        );
        onSendingChange?.(false);
        return;
      }

      await cancelUnsignedReserve(accessToken);

      const message = isUserRejection(err)
        ? 'Transfer cancelled — your balance has been restored'
        : err instanceof Error
          ? err.message
          : 'An unexpected error occurred';
      setError(message);
      setStatus('idle');
      onSendingChange?.(false);
    }
  };

  const busy =
    status === 'creating' || status === 'sending' || status === 'granting';
  const sendDisabled = busy || status === 'success';

  const sendLabel =
    status === 'granting'
      ? 'Confirming…'
      : status === 'idle'
        ? 'Send'
        : 'Processing...';

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
          onClick={!busy && status !== 'success' ? onClose : undefined}
        />

        <div
          className="relative flex flex-col items-center pb-12 pt-4 px-5 animate-in slide-in-from-bottom duration-300 bg-[#F8F9FB] rounded-t-[20px]"
          style={{ width: '430px', height: '738px', margin: '0 auto' }}
        >
          <div className="flex justify-center mb-5">
            <div className="w-12 h-1 bg-gray-300/30 rounded-full" />
          </div>

          <div
            className="bg-white rounded-[20px] overflow-hidden shadow-[0px_4px_25px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col relative mb-4"
            style={{ width: '390px', height: '480px', paddingTop: '15px' }}
          >
            <button
              onClick={onClose}
              disabled={busy}
              className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-30"
            >
              <X size={20} />
            </button>

            <div className="text-center px-6 pb-4 border-b border-gray-200/60">
              <h2 className="text-[18px] font-[600] text-[#1C1C1C] leading-none text-center">
                Confirm transaction
              </h2>
              {prefetchPhase === 'preparing' && status === 'idle' && (
                <p className="text-[12px] text-[#888888] mt-2 font-medium">
                  Preparing secure payout…
                </p>
              )}
              {prefetchPhase === 'ready' && status === 'idle' && !displayError && (
                <p className="text-[12px] text-[#2261FE] mt-2 font-medium">
                  Ready to send
                </p>
              )}
              {status === 'granting' && (
                <p className="text-[12px] text-[#888888] mt-2 font-medium">
                  Confirm once to allow payouts…
                </p>
              )}
            </div>

            <div className="flex flex-col flex-1 px-6">
              <div className="flex flex-col items-center justify-center py-8 border-b border-gray-200/60">
                <p className="text-[#4F4F4F] text-[14px] font-[500] leading-none mb-4">
                  Total amount
                </p>
                <h1 className="text-[36px] font-[500] text-[#1C1C1C] leading-none text-center">
                  ${sendAmount}
                </h1>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center py-6 gap-6">
                <DetailRow label="Recipient" value={accName} />
                <DetailRow label="Account no" value={accNum} />
                <div
                  className="flex items-center justify-between"
                  style={{ width: '350px', height: '17px' }}
                >
                  <span className="text-[#888888] text-[14px] font-[500] leading-none">
                    Bank
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-[20px] h-[20px] rounded-full overflow-hidden flex items-center justify-center">
                      <img src="/bank icon.svg" alt="Bank" className="w-[20px] h-[20px]" />
                    </div>
                    <span className="text-[#3D3D3D] text-[14px] font-[500] leading-none truncate max-w-[150px]">
                      {bankName}
                    </span>
                  </div>
                </div>
                <DetailRow
                  label={`Amount in ${currency}`}
                  value={`${amountBeforeFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyName}`}
                />
                <DetailRow label="Processing fee" value={`${feePercent.toFixed(2)}%`} />
                <DetailRow
                  label="Recipient gets"
                  value={`${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyName}`}
                  isHighlight
                />
              </div>
            </div>
          </div>

          {displayError && (
            <div className="w-[390px] mb-4 p-4 bg-red-50 border border-red-100 rounded-[12px] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={16} className="text-red-500" />
              </div>
              <p className="text-red-600 text-[13px] font-medium leading-tight">
                {displayError}
              </p>
            </div>
          )}

          <div className="w-[390px] max-w-full space-y-4 mt-auto">
            {isEmbeddedPrivy && !isDelegated && status === 'idle' && !displayError && (
              <p className="text-center text-[12px] text-[#888888] font-medium px-2">
                First send may ask you to confirm payouts for this app.
              </p>
            )}
            <button
              onClick={handleSend}
              disabled={sendDisabled}
              className="w-full h-[65px] bg-[#2261FE] text-white rounded-[7px] text-[18px] font-bold shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
            >
              {sendLabel}
            </button>
            <button
              onClick={onClose}
              disabled={busy}
              className="w-full h-[65px] bg-white text-[#2261FE] border-2 border-[#2261FE]/10 rounded-[7px] text-[18px] font-bold active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
            >
              Edit details
            </button>
          </div>
        </div>
      </div>

      {(status === 'creating' || status === 'sending') && (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-[430px] flex flex-col items-center text-center">
            <div className="mb-12">
              <h2 className="text-[24px] font-bold text-[#1C1C1C]">
                {status === 'creating'
                  ? 'Preparing order...'
                  : `Paying out to ${firstName}…`}
              </h2>
              <p className="text-[#888888] mt-2 font-medium">
                {status === 'creating'
                  ? 'Connecting to Paycrest secure gateway'
                  : 'Sending USDC on Base — do not close this screen'}
              </p>
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
                  <CheckCircle2 size={24} />
                </div>
              </div>

              <h3 className="font-[700] leading-[120%] text-center px-4 mb-4 text-[#464446] text-[24px]">
                Money sent to {firstName}
              </h3>

              <p className="text-[#888888] text-[15px] font-medium max-w-[280px]">
                The transaction has been broadcast. It will reflect in the account once
                verified by the network.
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
    </>
  );
}

function DetailRow({
  label,
  value,
  isHighlight,
}: {
  label: string;
  value: string;
  isHighlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between" style={{ width: '350px', height: '17px' }}>
      <span className="text-[#888888] text-[14px] font-[500] leading-none">{label}</span>
      <span
        className={`text-[#3D3D3D] text-[14px] font-[500] leading-none truncate ml-4 ${isHighlight ? 'text-[#2261FE] font-bold' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
