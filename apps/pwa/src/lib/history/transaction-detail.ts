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
  /** Bank payouts: currency paid out (NGN, KES, …); null on older rows (NGN). */
  currency?: string | null;
  orderId?: string;
  chainId?: number;
  txHash?: string;
  createdAt: string;
};

export type TransactionDetail = ReturnType<typeof toTransactionDetail>;

export function maskAccount(acc: string): string {
  const digits = acc.trim();
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : digits;
}

export function shortAddress(address: string): string {
  const a = address.trim();
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function recipientLabel(tx: HistoryTransaction): { who: string; where: string } | null {
  if (tx.type === 'DEPOSIT') return null;
  const bank = (tx.recipientBank ?? '').trim();
  const acc = (tx.recipientAcc ?? '').trim();
  if (bank.startsWith('crypto:')) {
    if (!acc) return null;
    const network = bank.slice('crypto:'.length);
    return { who: shortAddress(acc), where: `${network.charAt(0).toUpperCase()}${network.slice(1)} wallet` };
  }
  const name = (tx.recipientName ?? '').trim();
  if (!name) return null;
  return { who: name, where: [bank, acc ? maskAccount(acc) : ''].filter(Boolean).join(' · ') };
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
  // Crypto cash-outs move the token itself; bank payouts arrive in the row's currency (#195).
  const isCrypto = (tx.recipientBank ?? '').startsWith('crypto:');
  const receivedToken = isCrypto ? sentToken : (tx.currency || 'NGN').toUpperCase();

  return {
    id: tx.id,
    type: tx.type || 'REMITTANCE',
    pair: `${sentToken}/${receivedToken}`,
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
    receivedToken,
    // Same format as the confirm screen, so both show the same rate.
    rate: rate != null && !isCrypto ? `1 ${sentToken} = ${rate.toLocaleString()} ${receivedToken}` : undefined,
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
