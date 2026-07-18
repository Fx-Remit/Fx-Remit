import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { RemittanceIndexer, TransactionService } from '@fx-remit/services';

export const dynamic = 'force-dynamic';

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function authorizeGoldsky(req: NextRequest, body: string, secret: string): boolean {
  const signature = req.headers.get('x-goldsky-signature');
  if (signature) {
    const expectedHmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (timingSafeEqualString(signature, expectedHmac)) return true;
    // Some Goldsky httpauth secrets send the raw secret as the header value
    if (timingSafeEqualString(signature, secret)) return true;
  }

  const auth = req.headers.get('authorization');
  if (auth) {
    // Standard: Authorization: Bearer <secret>
    if (auth.startsWith('Bearer ')) {
      if (timingSafeEqualString(auth.slice(7), secret)) return true;
    } else if (timingSafeEqualString(auth, secret)) {
      // Bare secret (no Bearer prefix) — some webhook configs send this
      return true;
    }
  }

  return false;
}

function isRawLogRow(row: Record<string, unknown>): boolean {
  return (
    typeof row.data === 'string' &&
    (typeof row.topics === 'string' || Array.isArray(row.topics)) &&
    (row.transaction_hash != null ||
      row.transactionHash != null ||
      row.block_number != null ||
      row.blockNumber != null)
  );
}

function isLegacyIndexRow(row: Record<string, unknown>): boolean {
  return row.order_id != null && (row.tx_hash != null || row.sender != null);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const secret =
      process.env.GOLDSKY_WEBHOOK_SECRET ||
      process.env.GOLDSKY_WEBHOOK_SECRET_KEY;

    if (!secret || !authorizeGoldsky(req, body, secret)) {
      console.warn('[Indexer Webhook] Missing/invalid auth');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = JSON.parse(body);

    // Goldsky batch: [row, row, ...]
    if (Array.isArray(payload)) {
      const rawRows = payload.filter(
        (r) => r && typeof r === 'object' && isRawLogRow(r as Record<string, unknown>),
      );
      if (rawRows.length) {
        const result = await RemittanceIndexer.handleGoldskyRawLogs(rawRows);
        return NextResponse.json({ status: 'success', ...result });
      }
      return NextResponse.json({ status: 'ignored', reason: 'empty-batch' });
    }

    // Goldsky single raw log row
    if (payload && typeof payload === 'object' && isRawLogRow(payload)) {
      const result = await RemittanceIndexer.handleGoldskyRawLogs([payload]);
      return NextResponse.json({ status: 'success', ...result });
    }

    // Legacy shaped payload: { op, data: { order_id, ... } }
    const { op, data } = payload ?? {};
    if (op !== 'INSERT' && op !== 'UPDATE') {
      return NextResponse.json({ status: 'ignored' });
    }

    const row = (data?.new ?? data) as Record<string, unknown> | undefined;
    if (row && isRawLogRow(row)) {
      const result = await RemittanceIndexer.handleGoldskyRawLogs([row]);
      return NextResponse.json({ status: 'success', ...result });
    }

    if (row && isLegacyIndexRow(row)) {
      await TransactionService.updateFromIndexer({
        orderId: BigInt(String(row.order_id)),
        txHash: String(row.tx_hash),
        chainId: Number(row.chain_id),
        blockNumber: BigInt(String(row.block_number)),
        logIndex: Number(row.log_index ?? 0),
        sender: String(row.sender),
        recipient: row.recipient ? String(row.recipient) : undefined,
        fromToken: row.fromToken ? String(row.fromToken) : undefined,
        amountUsd: Number(row.amountUsd || 0),
      });
      return NextResponse.json({ status: 'success' });
    }

    return NextResponse.json({ status: 'ignored', reason: 'unrecognized-payload' });
  } catch (error: any) {
    console.error('[Indexer Error]', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 },
    );
  }
}
