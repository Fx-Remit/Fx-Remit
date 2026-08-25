import axios from 'axios';
import { createHash } from 'node:crypto';
import { Keypair, StrKey, Transaction, WebAuth } from '@stellar/stellar-sdk';
import type { Sep10ChallengeResponse, Sep10TokenResponse } from '../types/types.js';

export interface Sep10AuthResult {
  token: string;
  account: string;
}

/**
 * SEP-10: Stellar Web Authentication with an anchor.
 * @see https://developers.stellar.org/docs/build/apps/wallet/sep10
 *
 * Challenges are validated with {@link WebAuth.readChallengeTx} before any
 * client signature (#93) so a poisoned WEB_AUTH_ENDPOINT cannot induce signing
 * a Payment / non-challenge transaction.
 */
export class Sep10Client {
  constructor(
    private readonly webAuthEndpoint: string,
    private readonly networkPassphrase: string,
    /** Anchor stellar.toml SIGNING_KEY (G…) — challenge source account. */
    private readonly serverSigningKey: string,
  ) {
    if (!StrKey.isValidEd25519PublicKey(serverSigningKey)) {
      throw new Error('Invalid SEP-10 server SIGNING_KEY');
    }
  }

  private webAuthDomain(): string {
    return new URL(this.webAuthEndpoint).hostname;
  }

  /**
   * Validate challenge structure + server signature before signing.
   * Rejects Payment / non-manageData ops, wrong source, bad timebounds, etc.
   */
  verifyChallenge(challengeXdr: string, homeDomain: string): Transaction {
    const { tx } = WebAuth.readChallengeTx(
      challengeXdr,
      this.serverSigningKey,
      this.networkPassphrase,
      homeDomain,
      this.webAuthDomain(),
    );
    return tx;
  }

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

    if (data.network_passphrase !== this.networkPassphrase) {
      throw new Error(
        `SEP-10 challenge network_passphrase mismatch (got "${data.network_passphrase}")`,
      );
    }

    // Fail closed on poisoned / non-challenge XDR before returning to callers.
    this.verifyChallenge(data.transaction, homeDomain);

    return data;
  }

  signChallenge(
    challengeXdr: string,
    keypair: Keypair,
    homeDomain: string,
    clientDomain?: string,
  ): string {
    const transaction = this.verifyChallenge(challengeXdr, homeDomain);
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
    const signed = this.signChallenge(
      challenge.transaction,
      keypair,
      homeDomain,
      clientDomain,
    );
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
