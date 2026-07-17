import axios from 'axios';
import { createHash } from 'node:crypto';
import { Keypair, StrKey, Transaction } from '@stellar/stellar-sdk';
import type { Sep10ChallengeResponse, Sep10TokenResponse } from './types.js';

export interface Sep10AuthResult {
  token: string;
  account: string;
}

/**
 * SEP-10: Stellar Web Authentication with an anchor.
 * @see https://developers.stellar.org/docs/build/apps/wallet/sep10
 */
export class Sep10Client {
  constructor(
    private readonly webAuthEndpoint: string,
    private readonly networkPassphrase: string,
  ) {}

  async fetchChallenge(account: string, homeDomain: string): Promise<Sep10ChallengeResponse> {
    const url = new URL(this.webAuthEndpoint);
    url.searchParams.set('account', account);
    url.searchParams.set('home_domain', homeDomain);

    const { data } = await axios.get<Sep10ChallengeResponse>(url.toString(), {
      timeout: 15_000,
    });

    if (!data.transaction || !data.network_passphrase) {
      throw new Error('Invalid SEP-10 challenge response');
    }

    return data;
  }

  signChallenge(challengeXdr: string, keypair: Keypair, clientDomain?: string): string {
    const transaction = new Transaction(challengeXdr, this.networkPassphrase);
    transaction.sign(keypair);

    if (clientDomain) {
      const domainHash = createHash('sha256').update(clientDomain).digest();
      const signature = keypair.sign(domainHash);
      transaction.addSignature(keypair.publicKey(), signature.toString('base64'));
    }

    return transaction.toXDR();
  }

  async submitTokenRequest(signedXdr: string): Promise<string> {
    const { data } = await axios.post<Sep10TokenResponse>(
      this.webAuthEndpoint,
      { transaction: signedXdr },
      { timeout: 15_000, headers: { 'Content-Type': 'application/json' } },
    );

    if (!data.token) {
      throw new Error('SEP-10 token response missing token');
    }

    return data.token;
  }

  async authenticate(
    account: string,
    homeDomain: string,
    keypair: Keypair,
    clientDomain?: string,
  ): Promise<Sep10AuthResult> {
    const challenge = await this.fetchChallenge(account, homeDomain);
    const signed = this.signChallenge(challenge.transaction, keypair, clientDomain);
    const token = await this.submitTokenRequest(signed);
    return { token, account };
  }
}

export function keypairFromSecret(secret: string): Keypair {
  return Keypair.fromSecret(secret);
}

export function generateKeypair(): Keypair {
  return Keypair.random();
}

export function isValidPublicKey(account: string): boolean {
  return StrKey.isValidEd25519PublicKey(account);
}
