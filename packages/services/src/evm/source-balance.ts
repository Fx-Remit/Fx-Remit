import { formatUnits, getAddress, parseAbi } from 'viem';
import { Prisma } from '@fx-remit/database';
import { bankSettlementFor } from '../paycrest/payout.service.js';
import { TransactionService } from '../transactions/transaction.service.js';
import { forwarderDeps, isForwarderChainId } from './forwarder-payout.js';

const BALANCE_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

/**
 * How much USDC a user can still pay out from one network: the wallet's on-chain
 * balance there, minus cash-outs already reserved on it that haven't sent yet.
 * Null when the balance can't be read; callers then skip this pre-check (the send
 * itself re-checks the on-chain balance before anything moves).
 */
export async function sourceNetworkAvailability(opts: {
  userId: string;
  walletAddress: string;
  network: string;
}): Promise<{ onChainUsd: string; reservedUsd: string; availableUsd: string } | null> {
  const source = bankSettlementFor(opts.network);
  if (!source || !isForwarderChainId(source.chainId)) return null;
  try {
    const raw = (await forwarderDeps.publicClient(source.chainId).readContract({
      address: getAddress(source.tokenAddress),
      abi: BALANCE_ABI as never,
      functionName: 'balanceOf',
      args: [getAddress(opts.walletAddress)],
    } as never)) as bigint;
    const onChain = new Prisma.Decimal(formatUnits(raw, source.decimals));
    const reserved = await TransactionService.reservedOnNetwork(opts.userId, source.network);
    const available = Prisma.Decimal.max(onChain.minus(reserved), 0);
    return { onChainUsd: onChain.toFixed(6), reservedUsd: reserved.toFixed(6), availableUsd: available.toFixed(6) };
  } catch (err) {
    console.warn('[SourceBalance] could not read on-chain balance; skipping pre-check', {
      network: opts.network,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
