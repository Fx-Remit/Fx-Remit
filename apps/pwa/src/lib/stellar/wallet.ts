'use client';

import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
} from '@stellar/freighter-api';
import { Horizon, Asset } from '@stellar/stellar-sdk';
import { getClientStellarNetwork, getUsdcIssuer, HORIZON_URL } from './constants';

export interface FreighterConnection {
  publicKey: string;
  usdcBalance: string;
  network: string;
}

async function ensureFreighterAllowed(): Promise<void> {
  const allowed = await isAllowed();
  if (!allowed) {
    const ok = await setAllowed();
    if (!ok) {
      throw new Error('Freighter access denied');
    }
  }
}

export async function connectFreighter(): Promise<string> {
  const connected = await isConnected();
  if (!connected) {
    throw new Error('Freighter extension not installed');
  }

  await ensureFreighterAllowed();
  const access = await requestAccess();
  if (!access) {
    throw new Error('Freighter did not grant access');
  }

  const { address } = await getAddress();
  if (!address) {
    throw new Error('Freighter returned no address');
  }

  return address;
}

export async function getFreighterPublicKey(): Promise<string | null> {
  const connected = await isConnected();
  if (!connected) return null;

  const allowed = await isAllowed();
  if (!allowed) return null;

  const { address } = await getAddress();
  return address ?? null;
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
