import { Decimal } from 'decimal.js';

/**
 * Visible cash-out fee, matching PricingService.splitPayout on the server:
 * fee = sendUsd × feeBps / 10000, 6dp ROUND_DOWN.
 */
export function cashOutFeeUsd(sendUsd: string | number, feeBps: number): Decimal {
  const send = new Decimal(Number(sendUsd) > 0 ? sendUsd : 0);
  return send.mul(feeBps).div(10000).toDecimalPlaces(6, Decimal.ROUND_DOWN);
}

/** Fiat the recipient gets: (send − fee) × displayed rate, 2dp ROUND_DOWN. */
export function cashOutReceive(sendUsd: string | number, feeBps: number, rate: number): Decimal {
  const send = new Decimal(Number(sendUsd) > 0 ? sendUsd : 0);
  return send.minus(cashOutFeeUsd(send.toString(), feeBps)).mul(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

/** Inverse for the "receive" field: the amount to send so the recipient gets `receive`. */
export function cashOutSendFor(receive: string | number, feeBps: number, rate: number): Decimal {
  if (!(rate > 0)) return new Decimal(0);
  const net = new Decimal(Number(receive) > 0 ? receive : 0).div(rate);
  return net.div(new Decimal(1).minus(new Decimal(feeBps).div(10000))).toDecimalPlaces(2, Decimal.ROUND_UP);
}

/** "$0.25 (0.50%)", or just "0.50%" before an amount is entered. */
export function formatCashOutFee(sendUsd: string | number, feeBps: number): string {
  const pct = `${(feeBps / 100).toFixed(2)}%`;
  if (!(Number(sendUsd) > 0)) return pct;
  return `$${cashOutFeeUsd(sendUsd, feeBps).toDecimalPlaces(2, Decimal.ROUND_UP).toFixed(2)} (${pct})`;
}
