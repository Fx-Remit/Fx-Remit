import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import {
  TransactionService,
  mintAbandonToken,
  InsufficientBalanceError,
  ExternalIdConflictError,
  DEPOSIT_TOKENS,
  withUniqueOrderId,
  cryptoFundingPathFor,
} from '@fx-remit/services';
import { z } from 'zod';
import { isAddress } from 'viem';
import { cashOutAmountUsd } from '../../../../lib/cash-out/usd-amount';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const NETWORK_CHAIN_ID = {
  base: 8453,
  celo: 42220,
  arbitrum: 42161,
} as const;

const createCryptoPendingSchema = z.object({
  amountUsd: cashOutAmountUsd,
  destinationAddress: z
    .string()
    .trim()
    .refine((a) => isAddress(a), 'destinationAddress must be a valid address'),
  // Crypto cash-out goes through PayoutForwarder, which runs on Base and Celo (#190).
  network: z.enum(['base', 'celo']),
  token: z.string().trim().min(1, 'token is required'),
  externalId: z.string().optional(),
});

/** Explicit pick: never spread the row, which carries server-only pricing columns. */
function serializeTransaction(tx: {
  id: string;
  orderId: bigint;
  externalId: string | null;
  status: string;
  txHash: string;
  sourceToken: string;
  amountUsd: { toString(): string };
  payoutFiat: { toString(): string };
  recipientBank: string | null;
  recipientAcc: string | null;
  createdAt: Date;
}) {
  return {
    id: tx.id,
    orderId: tx.orderId.toString(),
    externalId: tx.externalId,
    status: tx.status,
    txHash: tx.txHash,
    sourceToken: tx.sourceToken,
    amountUsd: tx.amountUsd.toString(),
    payoutFiat: tx.payoutFiat.toString(),
    recipientBank: tx.recipientBank,
    recipientAcc: tx.recipientAcc,
    createdAt: tx.createdAt.toISOString(),
  };
}

function resolveToken(
  network: keyof typeof NETWORK_CHAIN_ID,
  symbol: string,
): { address: `0x${string}`; decimals: number; symbol: string } | null {
  const chainId = NETWORK_CHAIN_ID[network];
  const upper = symbol.toUpperCase();

  // Native CELO is not 1:1 with USD ledger reserves USD but would send CELO 1:1.
  // Stablecoins only until a priced CELO path exists.
  if (upper === 'CELO') {
    return null;
  }

  const listed = DEPOSIT_TOKENS[chainId]?.find(
    (t) => t.symbol.toUpperCase() === upper,
  );
  if (!listed) return null;
  return { address: listed.address, decimals: listed.decimals, symbol: listed.symbol };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    let claims;
    try {
      claims = await privy.verifyAuthToken(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[CREATE_CRYPTO_PENDING] Privy verifyAuthToken failed:', message);
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 },
      );
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validationResult = createCryptoPendingSchema.safeParse(rawBody);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues.map((i) => i.message),
        },
        { status: 422 },
      );
    }

    const {
      amountUsd,
      destinationAddress,
      network,
      token: sourceToken,
      externalId: frontendId,
    } = validationResult.data;

    const tokenMeta = resolveToken(network, sourceToken);
    if (!tokenMeta) {
      const upper = sourceToken.toUpperCase();
      return NextResponse.json(
        {
          error:
            upper === 'CELO'
              ? 'Native CELO cash-out is not supported (ledger is USD; use USDC or USDT)'
              : `Token ${sourceToken} is not supported on ${network}`,
        },
        { status: 400 },
      );
    }

    // PayoutForwarder moves USDC only; USDT follows with Forwarder V2 (#191).
    if (tokenMeta.symbol.toUpperCase() !== 'USDC') {
      return NextResponse.json({ error: 'Only USDC can be cashed out right now' }, { status: 422 });
    }

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true, walletAddress: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.walletAddress && user.walletAddress.toLowerCase() === destinationAddress.toLowerCase()) {
      return NextResponse.json({ error: "You can't cash out to your own FX Remit wallet" }, { status: 422 });
    }

    const funding = cryptoFundingPathFor({ id: user.id, privyDid: claims.userId }, network);
    if (funding === 'unavailable') {
      return NextResponse.json(
        { error: `Cash-out on ${network} is unavailable right now`, code: 'NETWORK_UNAVAILABLE' },
        { status: 503 },
      );
    }

    const appExternalId =
      frontendId || `crypto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    let tx;
    try {
      tx = await withUniqueOrderId((orderId) =>
        TransactionService.createPending({
          userId: user.id,
          orderId,
          externalId: appExternalId,
          sourceToken: tokenMeta.symbol,
          amountUsd,
          payoutFiat: amountUsd,
          recipientName: 'Crypto withdraw',
          recipientBank: `crypto:${network}`,
          recipientAcc: destinationAddress,
        }),
      );
    } catch (err) {
      if (
        err instanceof ExternalIdConflictError ||
        (err as { code?: unknown } | null)?.code === 'EXTERNAL_ID_CONFLICT'
      ) {
        return NextResponse.json(
          { error: 'This payout ID is already used by a different cash-out', code: err.code },
          { status: 409 },
        );
      }
      if (err instanceof InsufficientBalanceError) {
        return NextResponse.json(
          {
            error: 'Insufficient balance',
            details: err.message,
            code: err.code,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    const externalKey = tx.externalId || appExternalId;
    const abandonToken = mintAbandonToken(externalKey, user.id);

    // Prefer reserved row metadata so a resumed pending cannot desync from transfer intent.
    const networkFromRow = (tx.recipientBank || '').startsWith('crypto:')
      ? (tx.recipientBank!.slice('crypto:'.length) as 'base' | 'celo' | 'arbitrum')
      : network;
    const destFromRow =
      typeof tx.recipientAcc === 'string' && isAddress(tx.recipientAcc)
        ? tx.recipientAcc
        : destinationAddress;
    const resolvedNetwork =
      networkFromRow === 'base' || networkFromRow === 'celo' || networkFromRow === 'arbitrum'
        ? networkFromRow
        : network;
    const resumedToken = resolveToken(resolvedNetwork, tx.sourceToken || tokenMeta.symbol);
    const transferMeta = resumedToken || tokenMeta;

    return NextResponse.json({
      success: true,
      abandonToken,
      transaction: serializeTransaction(tx),
      // How the client must send it: through PayoutForwarder, or the legacy wallet send.
      funding:
        resolvedNetwork === network ? funding : cryptoFundingPathFor({ id: user.id, privyDid: claims.userId }, resolvedNetwork),
      transfer: {
        network: resolvedNetwork,
        chainId: NETWORK_CHAIN_ID[resolvedNetwork],
        token: transferMeta.symbol,
        tokenAddress: transferMeta.address,
        decimals: transferMeta.decimals,
        destinationAddress: destFromRow,
      },
    });
  } catch (error) {
    console.error('[CREATE_CRYPTO_PENDING] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
