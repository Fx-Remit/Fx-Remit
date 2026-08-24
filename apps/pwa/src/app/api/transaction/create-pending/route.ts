import { NextResponse } from 'next/server';
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from '@fx-remit/database';
import {
  TransactionService,
  PayoutService,
  mintAbandonToken,
  InsufficientBalanceError,
} from '@fx-remit/services';

export const dynamic = "force-dynamic";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? "";

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

import { z } from 'zod';

const createPendingSchema = z.object({
  amountUsd: z.coerce.number().positive("amountUsd must be a positive number").max(10_000, "Transaction amount exceeds maximum of $10,000"),
  payoutFiat: z.coerce.number().positive("payoutFiat must be a positive number"),
  recipientName: z.string().trim().min(1, "recipientName is required"),
  recipientBank: z.string().trim().min(1, "recipientBank is required"),
  recipientAcc: z.string().trim().min(1, "recipientAcc is required"),
  token: z.string().trim().min(1, "token is required"),
  bankCode: z.string().optional(),
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

function paycrestPayload(
  order: {
    id?: string;
    providerAccount?: { receiveAddress?: string; amountToTransfer?: string | number };
  },
  settlement: {
    network: string;
    chainId: number;
    token: string;
    tokenAddress: string;
    decimals: number;
  },
) {
  return {
    receiveAddress: order.providerAccount?.receiveAddress,
    amountToTransfer: order.providerAccount?.amountToTransfer,
    network: settlement.network,
    chainId: settlement.chainId,
    token: settlement.token,
    tokenAddress: settlement.tokenAddress,
    decimals: settlement.decimals,
  };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);

    let claims;
    try {
      claims = await privy.verifyAuthToken(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CREATE_PENDING] Privy verifyAuthToken failed:", message);
      return NextResponse.json(
        { error: "Invalid authentication token" },
        { status: 401 },
      );
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const validationResult = createPendingSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed", 
          details: validationResult.error.issues.map(i => i.message) 
        },
        { status: 422 },
      );
    }

    const {
      amountUsd,
      recipientName,
      recipientBank,
      recipientAcc,
      payoutFiat,
      token: sourceToken,
      bankCode,
      externalId: frontendId,
    } = validationResult.data;

    const user = await prisma.user.findUnique({
      where: { privyDid: claims.userId },
      select: { id: true, walletAddress: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const orderId = BigInt(Date.now());
    const appExternalId = frontendId || `pnd_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Reserve funds + create the pending row FIRST (atomic, guarded).
    // Doing this before Paycrest avoids orphan provider orders on insufficient balance.
    let tx;
    try {
      tx = await TransactionService.createPending({
        userId: user.id,
        orderId,
        externalId: appExternalId,
        sourceToken,
        amountUsd,
        payoutFiat,
        recipientName,
        recipientBank,
        recipientAcc,
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return NextResponse.json(
          {
            error: "Insufficient balance",
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

    // Resume only when Paycrest order id is already on the hash.
    // PROCESSING + app-local hash means create claimed but order not linked yet —
    // fall through to createPaycrestOrder (lease / IN_FLIGHT / retry).
    if (tx.status === "PROCESSING") {
      const hashKey = TransactionService.paycrestOrderIdFromTxHash(tx.txHash);
      const linkedOrder =
        !!hashKey &&
        !TransactionService.isAppLocalPendingKey(hashKey, tx.externalId);

      if (linkedOrder) {
        const resumed = await PayoutService.getSettlementOrder(hashKey!);
        if (!resumed.success || !resumed.order || !resumed.settlement) {
          return NextResponse.json(
            { error: resumed.error || "Failed to resume Paycrest order" },
            { status: 400 },
          );
        }

        return NextResponse.json({
          success: true,
          resumed: true,
          abandonToken,
          transaction: serializeTransaction(tx),
          paycrest: paycrestPayload(resumed.order, resumed.settlement),
        });
      }
    }

    // Create the Paycrest order. On failure, refund only when *this* call held
    // the create claim and Paycrest returned a definite 4xx (no fundable order).
    const paycrestResp = await PayoutService.createPaycrestOrder({
      amount: amountUsd.toString(),
      sourceToken,
      destinationCurrency: "NGN", // Defaulting to NGN for now
      recipient: {
        institution: bankCode || recipientBank,
        accountIdentifier: recipientAcc,
        accountName: recipientName,
      },
      refundAddress: user.walletAddress || "",
      externalId: externalKey,
    });

    if (!paycrestResp.success || !paycrestResp.order || !paycrestResp.settlement) {
      const code = "code" in paycrestResp ? paycrestResp.code : undefined;
      if (code === "ORDER_IN_FLIGHT" || code === "ORDER_LINKED") {
        return NextResponse.json(
          { error: paycrestResp.error, code },
          { status: 409 },
        );
      }
      if (code === "RESERVE_GONE") {
        return NextResponse.json(
          { error: paycrestResp.error, code },
          { status: 409 },
        );
      }

      const providerStatus = paycrestResp.status;
      const claimedThisCall =
        "claimedThisCall" in paycrestResp && paycrestResp.claimedThisCall === true;
      const definiteClientReject =
        typeof providerStatus === "number" &&
        providerStatus >= 400 &&
        providerStatus < 500 &&
        providerStatus !== 408;
      const definiteServerReject =
        typeof providerStatus === "number" &&
        providerStatus >= 500 &&
        providerStatus < 600;

      if (claimedThisCall && definiteClientReject) {
        // 4xx: Paycrest did not accept the order. CAS refund while still app-local.
        await TransactionService.refundAfterFailedProviderCreate(externalKey).catch((e) =>
          console.error("[CREATE_PENDING] refund after Paycrest 4xx failed:", e),
        );
      } else if (claimedThisCall && definiteServerReject) {
        // 5xx with response: no order expected — release claim so retry can reclaim.
        await TransactionService.releaseCreateClaim(externalKey).catch((e) =>
          console.error("[CREATE_PENDING] release claim after Paycrest 5xx failed:", e),
        );
      } else {
        // Timeout / unknown / not our claim: leave ledger reserved (#89).
        console.error(
          "[CREATE_PENDING] Paycrest create failed; leaving ledger reserved",
          { externalKey, status: providerStatus, code, claimedThisCall },
        );
      }
      return NextResponse.json({
        error: paycrestResp.error || "Failed to create Paycrest order"
      }, { status: 400 });
    }

    // Link the Paycrest order id onto pending-* hash (keep externalId as reference).
    // createPaycrestOrder usually already wrote pending-{orderId}; this is idempotent.
    // If the client abandoned while Paycrest was in flight, attach is a no-op.
    const linked = await TransactionService.attachPaycrestOrder(
      tx.id,
      paycrestResp.order.id,
    );

    if (!linked) {
      // Do NOT restore ledger — a live Paycrest order may still accept funds (#89).
      console.error(
        "[CREATE_PENDING] attachPaycrestOrder no-op after order create; leaving ledger reserved",
        { externalKey, orderId: paycrestResp.order.id },
      );
      return NextResponse.json(
        { error: "Remittance was cancelled before settlement was ready" },
        { status: 409 },
      );
    }

    const { settlement } = paycrestResp;

    return NextResponse.json({
      success: true,
      abandonToken,
      transaction: serializeTransaction(linked),
      paycrest: paycrestPayload(paycrestResp.order, settlement),
    });
  } catch (error) {
    console.error("[CREATE_PENDING] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
