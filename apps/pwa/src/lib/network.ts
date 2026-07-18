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
