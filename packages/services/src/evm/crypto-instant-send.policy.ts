import { DEPOSIT_TOKENS } from '../deposits/deposit.tokens.js';
import { ERC20_TRANSFER_ABI } from './instant-send.policy.js';

/**
 * Per-transaction cap for delegated crypto cash-out sends. Lower than bank
 * Instant Send's $10k because the recipient here is an unvetted, user-typed
 * address (see CryptoAddressService's trust-cooldown model) rather than a
 * fresh Paycrest-issued one the amount cap is the other half of bounding
 * blast radius while that trust signal is still comparatively weak.
 */
export const CRYPTO_INSTANT_SEND_MAX_USD = 1_000;

function toRawCap(decimals: number): bigint {
  return BigInt(CRYPTO_INSTANT_SEND_MAX_USD) * BigInt(10) ** BigInt(decimals);
}


export function buildCryptoInstantSendPolicyDraft(opts?: { name?: string }) {
  const rules = Object.entries(DEPOSIT_TOKENS).flatMap(([chainIdStr, tokens]) =>
    tokens.map((token) => ({
      name: `Allow ${token.symbol} transfer on chain ${chainIdStr} under $${CRYPTO_INSTANT_SEND_MAX_USD}`,
      method: 'eth_sendTransaction',
      action: 'ALLOW' as const,
      conditions: [
        {
          field_source: 'ethereum_transaction' as const,
          field: 'to',
          operator: 'eq' as const,
          value: token.address,
        },
        {
          field_source: 'ethereum_transaction' as const,
          field: 'chain_id',
          operator: 'eq' as const,
          value: chainIdStr,
        },
        {
          field_source: 'ethereum_calldata' as const,
          field: 'transfer.amount',
          abi: [...ERC20_TRANSFER_ABI],
          operator: 'lte' as const,
          value: `0x${toRawCap(token.decimals).toString(16)}`,
        },
      ],
    })),
  );

  return {
    version: '1.0' as const,
    name: opts?.name ?? 'FX Remit Crypto Cash-Out Instant Send transfer cap',
    chain_type: 'ethereum' as const,
    rules,
  };
}

export function isCryptoInstantSendConfigured(): boolean {
  return Boolean(
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim() &&
      (process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || process.env.PRIVY_APP_ID?.trim()) &&
      process.env.PRIVY_APP_SECRET?.trim() &&
      process.env.NEXT_PUBLIC_PRIVY_POLICY_ID_CRYPTO?.trim(),
  );
}
