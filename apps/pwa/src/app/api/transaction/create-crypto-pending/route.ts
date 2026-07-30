import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import {
  TransactionService,
  mintAbandonToken,
  InsufficientBalanceError,
  DEPOSIT_TOKENS,
} from '@fx-remit/services';
import { z } from 'zod';
import { isAddress } from 'viem';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const NETWORK_CHAIN_ID = {
  base: 8453,
  celo: 42220,
} as const;

const createCryptoPendingSchema = z.object({
  amountUsd: z.coerce
    .number()
    .positive('amountUsd must be a positive number')
    .max(10_000, 'Transaction amount exceeds maximum of $10,000'),
  destinationAddress: z
    .string()
    .trim()
    .refine((a) => isAddress(a), 'destinationAddress must be a valid address'),
  network: z.enum(['base', 'celo']),
  token: z.string().trim().min(1, 'token is required'),
  externalId: z.string().optional(),
});

function serializeTransaction(tx: {
  orderId: bigint;
  blockNumber: bigint;
  amountUsd: { toString(): string };
  payoutFiat: { toString(): string };
}) {
  return {
    ...tx,
    orderId: tx.orderId.toString(),
    blockNumber: tx.blockNumber.toString(),
    amountUsd: tx.amountUsd.toString(),
    payoutFiat: tx.payoutFiat.toString(),
  };
}

function resolveToken(
  network: keyof typeof NETWORK_CHAIN_ID,
  symbol: string,
): { address: `0x${string}`; decimals: number; symbol: string } | null {
  const chainId = NETWORK_CHAIN_ID[network];
  const upper = symbol.toUpperCase();

  if (upper === 'CELO') {
    if (network !== 'celo') return null;
    return {
      address: '0x0000000000000000000000000000000000000000',
      decimals: 18,
      symbol: 'CELO',
    };
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
      return NextResponse.json(
        {
          error: `Token ${sourceToken} is not supported on ${network}`,
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const orderId = BigInt(Date.now());
    const appExternalId =
      frontendId || `crypto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    let tx;
    try {
      tx = await TransactionService.createPending({
        userId: user.id,
        orderId,
        externalId: appExternalId,
        sourceToken: tokenMeta.symbol,
        amountUsd,
        payoutFiat: amountUsd,
        recipientName: 'Crypto withdraw',
        recipientBank: `crypto:${network}`,
        recipientAcc: destinationAddress,
      });
    } catch (err) {
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

    return NextResponse.json({
      success: true,
      abandonToken,
      transaction: serializeTransaction(tx),
      transfer: {
        network,
        chainId: NETWORK_CHAIN_ID[network],
        token: tokenMeta.symbol,
        tokenAddress: tokenMeta.address,
        decimals: tokenMeta.decimals,
        destinationAddress,
      },
    });
  } catch (error) {
    console.error('[CREATE_CRYPTO_PENDING] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
