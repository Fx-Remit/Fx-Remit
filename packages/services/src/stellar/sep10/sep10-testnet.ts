/**
 * SEP-10 testnet smoke test against SDF test anchor.
 *
 *   pnpm --filter @fx-remit/services stellar:sep10-test
 *   STELLAR_TEST_SECRET=S... pnpm --filter @fx-remit/services stellar:sep10-test
 *
 * If STELLAR_TEST_SECRET is omitted, a random keypair is generated.
 * SEP-10 is signature-only against the challenge — no Friendbot funding or
 * USDC balance required.
 */
import { Sep10Client, generateKeypair, keypairFromSecret } from './sep10.client.js';
import {
  TEST_ANCHOR,
  STELLAR_NETWORK_PASSPHRASE,
  getStellarNetwork,
} from '../config/anchors.config.js';
import { fetchAnchorToml } from '../config/anchor-toml.js';

async function main() {
  const network = getStellarNetwork();
  const passphrase = STELLAR_NETWORK_PASSPHRASE[network];
  const secret = process.env.STELLAR_TEST_SECRET;
  const keypair = secret ? keypairFromSecret(secret) : generateKeypair();

  console.log('Network:', network);
  console.log('Anchor:', TEST_ANCHOR.homeDomain);
  console.log('Account:', keypair.publicKey());
  if (!secret) {
    console.log('(random keypair — set STELLAR_TEST_SECRET to reuse)');
  }

  const toml = await fetchAnchorToml(TEST_ANCHOR.homeDomain);
  if (!toml.webAuthEndpoint) {
    throw new Error('Test anchor missing WEB_AUTH_ENDPOINT');
  }
  if (!toml.signingKey) {
    throw new Error('Test anchor missing SIGNING_KEY');
  }

  const sep10 = new Sep10Client(toml.webAuthEndpoint, passphrase, toml.signingKey);
  const { token } = await sep10.authenticate(
    keypair.publicKey(),
    TEST_ANCHOR.homeDomain,
    keypair,
  );

  console.log('SEP-10 auth OK');
  console.log('JWT prefix:', token.slice(0, 24) + '…');
}

main().catch((err) => {
  console.error('[sep10-testnet]', err.message ?? err);
  process.exit(1);
});
