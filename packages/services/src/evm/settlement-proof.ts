import { decodeEventLog, getAddress, parseAbi, parseUnits, type Hex, type TransactionReceipt } from 'viem';
import { DEPOSIT_TOKENS } from '../deposits/deposit.tokens.js';
import { PAYCREST_SETTLEMENT } from '../paycrest/payout.service.js';
import { CRYPTO_CASH_OUT_CHAIN_ID } from '../transactions/transaction.service.js';
import { RpcClient } from './rpc.client.js';
import { payoutForwarderAddress } from './forwarder-payout.js';

const TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

/** The remittance fields the proof needs. */
export type SettlementProofRow = {
  recipientBank: string | null;
  recipientAcc: string | null;
  sourceToken: string;
  amountUsd: { toString(): string };
};

/**
 * VERIFIED: the receipt succeeded and moved the reserved amount out of the user's wallet.
 * PENDING: no receipt yet (not mined, or the hash does not exist).
 * MISMATCH: mined, but it is not this remittance's transfer.
 */
export type SettlementProof = 'VERIFIED' | 'PENDING' | 'MISMATCH';

/** RPC seam; tests replace it. */
export const settlementProofDeps = {
  getReceipt(chainId: number, hash: Hex): Promise<TransactionReceipt> {
    return RpcClient.getClient(chainId).getTransactionReceipt({ hash });
  },
};

type Expected = { chainId: number; token: string; amount: bigint; to: string | null };

function expectedTransfer(row: SettlementProofRow): Expected | null {
  const bank = row.recipientBank ?? '';
  const isCrypto = bank.startsWith('crypto:');
  const chainId = isCrypto ? CRYPTO_CASH_OUT_CHAIN_ID[bank.slice('crypto:'.length)] : PAYCREST_SETTLEMENT.chainId;
  if (!chainId) return null;
  const symbol = (row.sourceToken || PAYCREST_SETTLEMENT.token).toUpperCase();
  const token = DEPOSIT_TOKENS[chainId]?.find((t) => t.symbol.toUpperCase() === symbol);
  if (!token) return null;
  // Crypto goes straight to the saved address. A bank payout goes to the Paycrest
  // receive address or through the forwarder, so only the sender and amount are fixed.
  const to = isCrypto ? (row.recipientAcc ?? '').trim() : null;
  if (isCrypto && !to) return null;
  return { chainId, token: token.address, amount: parseUnits(row.amountUsd.toString(), token.decimals), to };
}

/**
 * Proves a client-reported hash funds this remittance before it is attached (#102).
 * RPC errors other than "receipt not found" are thrown so the caller can fail closed.
 */
export async function verifySettlementHash(opts: {
  row: SettlementProofRow;
  walletAddress: string;
  txHash: Hex;
}): Promise<SettlementProof> {
  const expected = expectedTransfer(opts.row);
  if (!expected) return 'MISMATCH';

  let receipt: TransactionReceipt;
  try {
    receipt = await settlementProofDeps.getReceipt(expected.chainId, opts.txHash);
  } catch (err) {
    if ((err as { name?: string })?.name === 'TransactionReceiptNotFoundError') return 'PENDING';
    throw err;
  }
  if (receipt.status !== 'success') return 'MISMATCH';

  const wallet = getAddress(opts.walletAddress);
  const token = expected.token.toLowerCase();
  const to = expected.to ? getAddress(expected.to) : null;
  // Through PayoutForwarder the money moves in two linked legs of the same amount:
  // wallet → forwarder, then forwarder → destination.
  const forwarder = payoutForwarderAddress();
  let walletToForwarder = false;
  let forwarderToDestination = false;
  type RawLog = { address: string; data: Hex; topics: [Hex, ...Hex[]] | [] };
  type Decoded = { eventName: string; args: { from: string; to: string; value: bigint } };
  for (const log of receipt.logs as unknown as RawLog[]) {
    if (log.address.toLowerCase() !== token) continue;
    try {
      const ev = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics }) as unknown as Decoded;
      if (ev.eventName !== 'Transfer' || ev.args.value !== expected.amount) continue;
      const from = getAddress(ev.args.from);
      const dest = getAddress(ev.args.to);
      if (from === wallet && (!to || dest === to)) return 'VERIFIED';
      if (forwarder && from === wallet && dest === forwarder) walletToForwarder = true;
      if (forwarder && to && from === forwarder && dest === to) forwarderToDestination = true;
    } catch {
      // Not a Transfer (e.g. Approval, AuthorizationUsed).
    }
  }
  return walletToForwarder && forwarderToDestination ? 'VERIFIED' : 'MISMATCH';
}
