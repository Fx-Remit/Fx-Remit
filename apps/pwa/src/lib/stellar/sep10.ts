'use client';

import { signTransactionXdr } from './wallet';

export type StellarAuthCorridor = 'NGN' | 'KES';

export interface FreighterSep10Result {
  token: string;
  account: string;
  corridor: StellarAuthCorridor;
  signedTransaction: string;
}

/**
 * Browser SEP-10 round-trip: challenge API → Freighter sign → token API.
 * Call from cash-out wiring when needed — no dedicated UI in this slice.
 */
export async function authenticateWithFreighter(
  account: string,
  corridor: StellarAuthCorridor,
): Promise<FreighterSep10Result> {
  const challengeRes = await fetch('/api/stellar/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, corridor }),
  });
  const challenge = await challengeRes.json();
  if (!challengeRes.ok) {
    throw new Error(challenge.error ?? 'SEP-10 challenge failed');
  }

  const signedTransaction = await signTransactionXdr(challenge.transaction, {
    networkPassphrase: challenge.network_passphrase,
    address: account,
  });

  const tokenRes = await fetch('/api/stellar/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction, corridor }),
  });
  const tokenBody = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(tokenBody.error ?? 'SEP-10 token exchange failed');
  }

  return {
    token: tokenBody.token as string,
    account,
    corridor,
    signedTransaction,
  };
}
