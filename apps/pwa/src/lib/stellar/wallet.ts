'use client';

import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  signTransaction,
} from '@stellar/freighter-api';
import { Horizon, Asset } from '@stellar/stellar-sdk';
import {
  getClientStellarNetwork,
  getUsdcIssuer,
  HORIZON_URL,
  STELLAR_NETWORK_PASSPHRASE,
} from './constants';

export interface FreighterConnection {
  publicKey: string;
  usdcBalance: string;
  network: string;
}

async function ensureFreighterAllowed(): Promise<void> {
  const allowedRes = await isAllowed();
  if (!allowedRes.isAllowed) {
    const ok = await setAllowed();
    if (!ok.isAllowed) {
      throw new Error('Freighter access denied');
    }
  }
}

export async function connectFreighter(): Promise<string> {
  const connected = await isConnected();
  if (!connected.isConnected) {
    throw new Error('Freighter extension not installed');
  }

  await ensureFreighterAllowed();
  const access = await requestAccess();
  if (access.error || !access.address) {
    throw new Error(access.error?.message ?? 'Freighter did not grant access');
  }

  return access.address;
}

export async function getFreighterPublicKey(): Promise<string | null> {
  const connected = await isConnected();
  if (!connected.isConnected) return null;

  const allowed = await isAllowed();
  if (!allowed.isAllowed) return null;

  const { address, error } = await getAddress();
  if (error || !address) return null;
  return address;
}

/**
 * Sign a SEP-10 challenge (or any) transaction XDR in Freighter.
 * Does not submit to Horizon — returns signed XDR for the auth/token API.
 */
export async function signTransactionXdr(
  transactionXdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<string> {
  const network = getClientStellarNetwork();
  const networkPassphrase =
    opts?.networkPassphrase ?? STELLAR_NETWORK_PASSPHRASE[network];

  const result = await signTransaction(transactionXdr, {
    networkPassphrase,
    address: opts?.address,
  });

  if (result.error || !result.signedTxXdr) {
    throw new Error(result.error?.message ?? 'Freighter signing failed');
  }

  return result.signedTxXdr;
}

export async function fetchUsdcBalance(publicKey: string): Promise<string> {
  const network = getClientStellarNetwork();
  const server = new Horizon.Server(HORIZON_URL[network]);
  const usdc = new Asset('USDC', getUsdcIssuer());

  const account = await server.loadAccount(publicKey);
  const line = account.balances.find(
    (b) =>
      b.asset_type !== 'native' &&
      'asset_code' in b &&
      b.asset_code === usdc.code &&
      'asset_issuer' in b &&
      b.asset_issuer === usdc.issuer,
  );

  if (!line || !('balance' in line)) {
    return '0';
  }

  return line.balance;
}

export async function connectFreighterWithBalance(): Promise<FreighterConnection> {
  const publicKey = await connectFreighter();
  const usdcBalance = await fetchUsdcBalance(publicKey);
  const network = getClientStellarNetwork();

  return { publicKey, usdcBalance, network };
}
