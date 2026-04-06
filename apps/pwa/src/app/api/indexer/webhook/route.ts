import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@fx-remit/database';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const signature = req.headers.get('x-goldsky-signature');

    // Verify webhook authenticity
    if (!signature || signature !== process.env.GOLDSKY_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { op, data } = payload;
    if (op !== 'INSERT' && op !== 'UPDATE') {
      return NextResponse.json({ status: 'ignored' });
    }

    const { order_id, tx_hash, chain_id, sender } = data;

    // Resolve user by wallet address (normalized to lowercase)
    const user = await prisma.user.findUnique({
      where: { walletAddress: sender.toLowerCase() },
      select: { id: true }
    });

    if (!user) {
      console.warn(`[Indexer] Event received for unregistered wallet: ${sender}`);
    }

    // Handle uint256 orderId and block numbers as BigInt
    const orderId = BigInt(order_id);
    const blockNumber = BigInt(data.block_number);

    await prisma.transaction.upsert({
      where: { orderId },
      update: {
        txHash: tx_hash,
        chainId: Number(chain_id),
        status: 'VERIFIED',
        blockNumber,
      },
      create: {
        orderId,
        txHash: tx_hash,
        chainId: Number(chain_id),
        userId: user?.id || 'indexer-unlinked',
        sourceToken: data.fromToken || 'CELO',
        amountUsd: Number(data.amountUsd || 0),
        payoutFiat: 0,
        blockNumber,
        logIndex: Number(data.log_index),
      }
    });

    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('[Indexer Error]', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
