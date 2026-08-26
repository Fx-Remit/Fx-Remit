/** Display names for EVM chains used in history / detail sheets. */

export function networkLabelFromChainId(chainId?: number | string | null): string {
  const id = Number(chainId);
  switch (id) {
    case 8453:
      return 'Base Network';
    case 42220:
      return 'Celo Network';
    case 0:
      return 'Pending';
    default:
      return id ? `Chain ${id}` : 'Unknown Network';
  }
}

/** App-local placeholder hashes before (or instead of) an on-chain broadcast. */
export function isPlaceholderTxHash(txHash?: string | null): boolean {
  if (!txHash) return true;
  const h = txHash.toLowerCase();
  return (
    h.startsWith('pending-') ||
    h.startsWith('abandoned-') ||
    h.startsWith('unknown-')
  );
}

/** Short label for list rows — never show raw pending-/abandoned- prefixes. */
export function formatTxHashLabel(txHash?: string | null): string {
  if (!txHash) return 'Not sent';
  // pending-* = reserved ledger, no on-chain send yet (reject/back can leave these).
  if (txHash.toLowerCase().startsWith('pending-')) return 'Not sent';
  if (txHash.toLowerCase().startsWith('abandoned-')) return 'Not broadcast';
  if (txHash.toLowerCase().startsWith('unknown-')) return 'Unconfirmed';
  if (/^0x[a-fA-F0-9]{8,}$/.test(txHash)) {
    return `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
  }
  return `${txHash.slice(0, 10)}...`;
}

/**
 * History/detail network label.
 * Paycrest bank remittances settle on Base; create-pending stores chainId=0 until
 * attachOnChainHash (and older rows may never update chainId). Prefer Base over
 * the misleading "Pending" status-like label for remittances.
 */
export function networkLabelForTransaction(opts: {
  chainId?: number | string | null;
  type?: string | null;
  txHash?: string | null;
}): string {
  const id = Number(opts.chainId);
  if (id === 8453) return 'Base Network';
  if (id === 42220) return 'Celo Network';

  const type = (opts.type || '').toUpperCase();
  if (type === 'REMITTANCE' && (id === 0 || !Number.isFinite(id) || id === 0)) {
    return 'Base Network';
  }

  return networkLabelFromChainId(opts.chainId);
}
