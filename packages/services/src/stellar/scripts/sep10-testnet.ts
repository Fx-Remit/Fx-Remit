#!/usr/bin/env node
/**
 * SEP-10 testnet smoke test against SDF test anchor.
 *
 * Usage:
 *   STELLAR_TEST_SECRET=S... pnpm --filter @fx-remit/services stellar:sep10-test
 *
 * If STELLAR_TEST_SECRET is omitted, a random keypair is generated (account must be funded on testnet).
 */
import { Sep10Client, generateKeypair, keypairFromSecret } from '../sep10.client.js';
import { TEST_ANCHOR, STELLAR_NETWORK_PASSPHRASE, getStellarNetwork } from '../anchors.config.js';
import { fetchAnchorToml } from '../anchor-toml.js';

async function main() {
  const network = getStellarNetwork();
  const passphrase = STELLAR_NETWORK_PASSPHRASE[network];
  const anchor = TEST_ANCHOR;

  const secret = process.env.STELLAR_TEST_SECRET;
  const keypair = secret ? keypairFromSecret(secret) : generateKeypair();

  console.log(`Network: ${network}`);
  console.log(`Anchor: ${anchor.homeDomain}`);
  console.log(`Account: ${keypair.publicKey()}`);

  const toml = await fetchAnchorToml(anchor.homeDomain);
  if (!toml.webAuthEndpoint) {
    throw new Error(`No WEB_AUTH_ENDPOINT in ${anchor.homeDomain} stellar.toml`);
  }

  console.log(`WEB_AUTH_ENDPOINT: ${toml.webAuthEndpoint}`);

  const client = new Sep10Client(toml.webAuthEndpoint, passphrase);
  const result = await client.authenticate(
    keypair.publicKey(),
    anchor.homeDomain,
    keypair,
  );

  console.log('SEP-10 auth OK');
  console.log(`Token prefix: ${result.token.slice(0, 20)}...`);
}

main().catch((err) => {
  console.error('[sep10-testnet]', err.message ?? err);
  process.exit(1);
});
