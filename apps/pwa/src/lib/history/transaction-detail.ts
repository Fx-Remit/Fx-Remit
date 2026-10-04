import { formatCashOutFee } from '../cash-out/fee';
import { networkLabelForTransaction } from '../network';

export type HistoryTransaction = {
  id: string;
  type?: string | null;
  status?: string | null;
  sourceToken?: string | null;
  amountUsd: number | string;
  payoutFiat?: number | string | null;
  feeUsd?: number | null;
  rate?: number | null;
  recipientName?: string | null;
  recipientBank?: string | null;
  recipientAcc?: string | null;
  orderId?: string;
  chainId?: number;
  txHash?: string;
  createdAt: string;
};

export type TransactionDetail = ReturnType<typeof toTransactionDetail>;

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function maskAccount(acc: string): string {
  const digits = acc.trim();
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : digits;
}

export function shortAddress(address: string): string {
  const a = address.trim();
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function recipientOf(tx: HistoryTransaction): { name: string; bank: string; account: string } | null {
  if (tx.type === 'DEPOSIT') return null;
  const bank = (tx.recipientBank ?? '').trim();
  const acc = (tx.recipientAcc ?? '').trim();
  if (bank.startsWith('crypto:')) {
    return acc ? { name: 'Wallet', bank: '', account: shortAddress(acc) } : null;
  }
  const name = (tx.recipientName ?? '').trim();
  if (!name && !bank && !acc) return null;
  return { name, bank, account: acc ? maskAccount(acc) : '' };
}

/**
 * Detail-sheet view of a history row. Fee and rate are what the user confirmed;
 * older rows without a saved fee fall back to received ÷ sent and show no fee.
 */
export function toTransactionDetail(tx: HistoryTransaction) {
  const sentToken = tx.sourceToken || 'USDT';
  const sentAmount = Number(tx.amountUsd);
  const receivedAmount = Number(tx.payoutFiat || 0);
  const hasFee = typeof tx.feeUsd === 'number' && tx.feeUsd >= 0 && sentAmount > 0;
  const rate =
    hasFee && typeof tx.rate === 'number' && tx.rate > 0
      ? tx.rate
      : sentAmount > 0 && receivedAmount > 0
        ? receivedAmount / sentAmount
        : null;
  const status = tx.status?.toLowerCase();

  return {
    id: tx.id,
    type: tx.type || 'REMITTANCE',
    pair: `${sentToken}/NGN`,
    date: new Date(tx.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    status: (status === 'verified' || status === 'completed'
      ? 'completed'
      : status === 'failed'
        ? 'failed'
        : 'pending') as 'completed' | 'pending' | 'failed',
    sentAmount: sentAmount.toFixed(2),
    sentToken,
    receivedAmount: receivedAmount.toFixed(2),
    receivedToken: 'NGN',
    rate: rate != null ? `1 ${sentToken} = ${money(rate)} NGN` : undefined,
    fee: hasFee
      ? formatCashOutFee(sentAmount, Math.round((tx.feeUsd! / sentAmount) * 10000))
      : undefined,
    recipient: recipientOf(tx) ?? undefined,
    orderId: tx.orderId,
    chainId: tx.chainId,
    network: networkLabelForTransaction({
      chainId: tx.chainId,
      type: tx.type ?? undefined,
      txHash: tx.txHash,
    }),
    provider: tx.type === 'DEPOSIT' ? 'Wallet deposit' : 'Paycrest',
    txHash: tx.txHash,
  };
}
