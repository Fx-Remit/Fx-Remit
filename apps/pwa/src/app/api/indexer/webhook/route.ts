import { NextRequest, NextResponse } from 'next/server';
import { TransactionService } from '@fx-remit/services';

export const dynamic = "force-dynamic";

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

    await TransactionService.updateFromIndexer({
      orderId: BigInt(data.order_id),
      txHash: data.tx_hash,
      chainId: Number(data.chain_id),
      blockNumber: BigInt(data.block_number),
      logIndex: Number(data.log_index),
      sender: data.sender,
      recipient: data.recipient,
      fromToken: data.fromToken,
      amountUsd: Number(data.amountUsd || 0),
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
