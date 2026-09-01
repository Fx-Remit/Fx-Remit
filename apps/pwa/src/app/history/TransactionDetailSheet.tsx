'use client';

import { X, Copy, ExternalLink, Check, Clock, AlertCircle } from 'lucide-react';
import React from 'react';
import { isPlaceholderTxHash } from '@/lib/network';

interface TransactionDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: {
    id: string;
    type: string;
    pair: string;
    date: string;
    status: 'completed' | 'pending' | 'failed';
    sentAmount: string;
    sentToken: string;
    receivedAmount: string;
    receivedToken: string;
    orderId?: string;
    chainId?: number;
    network?: string;
    provider?: string;
    rate?: string;
    txHash?: string;
  } | null;
}

export function TransactionDetailSheet({
  isOpen,
  onClose,
  transaction,
}: TransactionDetailSheetProps) {
  if (!isOpen || !transaction) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const recipientGets =
    transaction.receivedToken === 'NGN'
      ? `₦${Number(transaction.receivedAmount).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : `${transaction.receivedToken} ${transaction.receivedAmount}`;

  const exchangeRate =
    transaction.rate ||
    (() => {
      const sent = Number(transaction.sentAmount);
      const received = Number(transaction.receivedAmount);
      if (!(sent > 0 && received > 0)) return null;
      const effective = received / sent;
      return `1 ${transaction.sentToken} = ${effective.toLocaleString(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })} ${transaction.receivedToken}`;
    })();

  const isCompleted = transaction.status === 'completed';
  const isPending = transaction.status === 'pending';
  const isFailed = transaction.status === 'failed';

  const steps = [
    {
      key: 'initiated',
      label: 'Initiated',
      state: 'done' as const,
    },
    {
      key: 'processing',
      label: 'Processing',
      state: isCompleted ? ('done' as const) : isPending ? ('active' as const) : isFailed ? ('done' as const) : ('idle' as const),
    },
    {
      key: 'success',
      label: isFailed ? 'Failed' : 'Success',
      state: isCompleted ? ('done' as const) : isFailed ? ('failed' as const) : ('idle' as const),
    },
  ];

  const segmentColor = (leftIndex: number) => {
    const right = steps[leftIndex + 1]?.state;
    if (right === 'done' || (isCompleted && leftIndex < 2)) return 'bg-emerald-500';
    if (right === 'active' || (isPending && leftIndex === 0)) return 'bg-[#2261FE]';
    if (right === 'failed' && leftIndex === 1) return 'bg-red-400';
    return 'bg-gray-200';
  };

  const nodeClass = (state: 'done' | 'active' | 'idle' | 'failed') => {
    if (state === 'done') {
      return isCompleted
        ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/25'
        : 'bg-[#2261FE] border-[#2261FE] text-white shadow-lg shadow-[#2261FE]/20';
    }
    if (state === 'active') {
      return 'bg-white border-[#2261FE] text-[#2261FE] ring-4 ring-[#2261FE]/10';
    }
    if (state === 'failed') {
      return 'bg-red-50 border-red-500 text-red-500';
    }
    return 'bg-white border-gray-200 text-gray-300';
  };

  const labelClass = (state: 'done' | 'active' | 'idle' | 'failed', label: string) => {
    if (state === 'failed' || label === 'Failed') return 'text-red-500';
    if (state === 'done' && isCompleted && label === 'Success') return 'text-emerald-600';
    if (state === 'done' || state === 'active') return 'text-[#1C1C1C]';
    return 'text-gray-300';
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
          onClick={onClose}
        />

        {/* Sheet Container */}
        <div
          className="relative flex flex-col animate-in slide-in-from-bottom duration-300 bg-[#F8F9FB] rounded-t-[30px] w-full max-w-[430px] overflow-hidden"
          style={{ height: '85vh', maxHeight: '90vh' }}
        >
          {/* Sticky Header Section */}
          <div className="sticky top-0 z-50 bg-[#F8F9FB] pt-4 pb-2 px-5 w-full flex flex-col items-center">
            {/* Drag handle */}
            <div className="flex justify-center mb-6">
              <div className="w-12 h-1.5 bg-gray-300/40 rounded-full" />
            </div>

            {/* Header Title */}
            <div className="w-full flex justify-between items-center mb-4 px-2">
              <h2 className="text-[20px] font-bold text-[#1C1C1C]">Transaction Details</h2>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Subtle separator when content scrolls under */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gray-100/50" />
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto px-5 pb-12 pt-2 scrollbar-hide">
            {/* Amount Card */}
            <div className="w-full bg-white rounded-[25px] p-6 sm:p-8 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] border border-gray-100 mb-6 flex flex-col items-center">
              <p className="text-[#6D6D6D] text-[15px] sm:text-[16px] font-medium mb-2 text-center">
                {transaction.type === 'DEPOSIT' ? 'Total deposited' : 'Total amount sent'}
              </p>
              <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1C1C1C] mb-6 text-center leading-tight">
                {transaction.type === 'DEPOSIT' ? '+' : ''}{transaction.sentAmount} {transaction.sentToken}
              </h1>

              <div className="w-full px-2 sm:px-4 mt-2 pt-2">
                <div className="flex w-full">
                  {steps.map((step, index) => (
                    <div key={step.key} className="flex flex-1 min-w-0 flex-col items-center">
                      <div className="relative flex h-9 w-full items-center justify-center">
                        {index > 0 && (
                          <div
                            className={`absolute right-1/2 left-0 top-1/2 h-0.5 -translate-y-1/2 ${segmentColor(index - 1)}`}
                          />
                        )}
                        {index < steps.length - 1 && (
                          <div
                            className={`absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2 ${segmentColor(index)}`}
                          />
                        )}
                        <div
                          className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${nodeClass(step.state)}`}
                        >
                          {step.state === 'failed' ? (
                            <AlertCircle size={18} />
                          ) : step.state === 'done' ? (
                            <Check size={18} strokeWidth={3} />
                          ) : step.state === 'active' ? (
                            <Clock size={18} />
                          ) : (
                            <Clock size={18} />
                          )}
                        </div>
                      </div>
                      <span
                        className={`mt-2 text-[11px] font-bold whitespace-nowrap sm:text-[12px] ${labelClass(step.state, step.label)}`}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Details Card */}
            <div className="w-full bg-white rounded-[25px] p-6 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] border border-gray-100 space-y-6">
              <DetailRow
                label="Order ID"
                value={transaction.orderId || 'FX-RANDOM'}
                onCopy={() =>
                  transaction.orderId ? navigator.clipboard.writeText(transaction.orderId) : null
                }
              />
              {transaction.type !== 'DEPOSIT' && (
                <>
                  {exchangeRate && (
                    <DetailRow label="Exchange rate" value={exchangeRate} />
                  )}
                  <DetailRow
                    label="Recipient gets"
                    value={recipientGets}
                    isBold
                  />
                </>
              )}
              {transaction.type === 'DEPOSIT' && (
                <DetailRow
                  label="Credited to"
                  value="FX Remit Wallet"
                  isBold
                />
              )}
              <DetailRow
                label="Network"
                value={transaction.network || 'Unknown Network'}
                showIcon
                iconSrc={
                  Number(transaction.chainId) === 8453 ||
                  (transaction.type !== 'DEPOSIT' &&
                    (Number(transaction.chainId) === 0 || !transaction.chainId))
                    ? '/base.svg'
                    : Number(transaction.chainId) === 42220
                      ? '/celo.svg'
                      : undefined
                }
              />
              {transaction.type !== 'DEPOSIT' && (
                <DetailRow label="Off-ramp Provider" value={transaction.provider || 'Paycrest'} />
              )}
            </div>

            {/* Action Buttons */}
            <div className="w-full mt-10 space-y-4">
              {!isPlaceholderTxHash(transaction.txHash) &&
              transaction.txHash?.startsWith('0x') ? (
                <a
                  href={
                    Number(transaction.chainId) === 42220
                      ? `https://celoscan.io/tx/${transaction.txHash}`
                      : `https://basescan.org/tx/${transaction.txHash}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-[65px] bg-[#2261FE] text-white rounded-[12px] text-[18px] font-bold shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={20} />
                  View on Scan
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full h-[65px] bg-gray-100 text-gray-400 rounded-[12px] text-[18px] font-bold cursor-not-allowed flex items-center justify-center gap-2"
                >
                  No on-chain receipt yet
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
  onCopy,
  isBold,
  showIcon,
  iconSrc,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  isBold?: boolean;
  showIcon?: boolean;
  iconSrc?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#888888] text-[15px] font-medium">{label}</span>
      <div className="flex items-center gap-2 max-w-[60%]">
        {showIcon && iconSrc && (
          <img src={iconSrc} alt="" className="w-5 h-5 rounded-full" />
        )}
        <span
          className={`${isBold ? 'text-[#1C1C1C] font-bold' : 'text-[#3D3D3D] font-semibold'} text-[15px] truncate`}
        >
          {value}
        </span>
        {onCopy && (
          <button onClick={onCopy} className="text-blue-500 hover:text-blue-600 transition-colors">
            <Copy size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
