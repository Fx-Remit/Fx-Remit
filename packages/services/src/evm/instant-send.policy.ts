import { PAYCREST_SETTLEMENT } from '../paycrest/payout.service.js';

/** Max USDC (6 decimals) matching create-pending Zod max of $10,000. */
export const INSTANT_SEND_MAX_USDC_RAW = BigInt(10_000) * BigInt(1_000_000);

export const ERC20_TRANSFER_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Fail-closed Privy policy draft for Instant Send (Dashboard / policies.create).
 * Recipient cannot be allowlisted — Paycrest receiveAddress is per-order;
 * application layer binds recipient when building the tx.
 */
export function buildInstantSendUsdcPolicyDraft(opts?: { name?: string }) {
  return {
    version: '1.0' as const,
    name: opts?.name ?? 'FX Remit Instant Send Base USDC transfer cap',
    chain_type: 'ethereum' as const,
    rules: [
      {
        name: 'Allow USDC transfer on Base under $10k',
        method: 'eth_sendTransaction',
        action: 'ALLOW' as const,
        conditions: [
          {
            field_source: 'ethereum_transaction' as const,
            field: 'to',
            operator: 'eq' as const,
            value: PAYCREST_SETTLEMENT.tokenAddress,
          },
          {
            field_source: 'ethereum_transaction' as const,
            field: 'chain_id',
            operator: 'eq' as const,
            value: String(PAYCREST_SETTLEMENT.chainId),
          },
          {
            field_source: 'ethereum_calldata' as const,
            field: 'transfer.amount',
            abi: [...ERC20_TRANSFER_ABI],
            operator: 'lte' as const,
            value: `0x${INSTANT_SEND_MAX_USDC_RAW.toString(16)}`,
          },
        ],
      },
    ],
  };
}

export function isInstantSendServerConfigured(): boolean {
  return Boolean(
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim() &&
      (process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ||
        process.env.PRIVY_APP_ID?.trim()) &&
      process.env.PRIVY_APP_SECRET?.trim(),
  );
}
