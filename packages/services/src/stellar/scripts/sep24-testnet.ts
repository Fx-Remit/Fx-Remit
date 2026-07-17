#!/usr/bin/env node
/**
 * SEP-24 withdraw start smoke test (sandbox).
 *
 * Requires STELLAR_TEST_SECRET with funded testnet account.
 */
import { Sep10Client, keypairFromSecret } from '../sep10.client.js';
import { Sep24Client } from '../sep24.client.js';
import { fetchAnchorToml } from '../anchor-toml.js';
import {
  TEST_ANCHOR,
  STELLAR_NETWORK_PASSPHRASE,
  getStellarNetwork,
} from '../anchors.config.js';

async function main() {
  const secret = process.env.STELLAR_TEST_SECRET;
  if (!secret) {
    throw new Error('Set STELLAR_TEST_SECRET for sep24 withdraw test');
  }

  const network = getStellarNetwork();
  const passphrase = STELLAR_NETWORK_PASSPHRASE[network];
  const anchor = TEST_ANCHOR;
  const keypair = keypairFromSecret(secret);
  const amount = process.env.STELLAR_TEST_AMOUNT ?? '1';

  const toml = await fetchAnchorToml(anchor.homeDomain);
  if (!toml.webAuthEndpoint || !toml.transferServerSep24) {
    throw new Error('Test anchor missing SEP-10 or SEP-24 endpoints');
  }

  const sep10 = new Sep10Client(toml.webAuthEndpoint, passphrase);
  const { token } = await sep10.authenticate(
    keypair.publicKey(),
    anchor.homeDomain,
    keypair,
  );

  const sep24 = new Sep24Client();
  const withdraw = await sep24.startWithdrawInteractive({
    anchor,
    authToken: token,
    account: keypair.publicKey(),
    assetCode: anchor.usdcAssetCode,
    assetIssuer: anchor.usdcIssuer,
    amount,
    destinationAsset: 'USD',
  });

  console.log('SEP-24 withdraw started');
  console.log(`Transaction id: ${withdraw.id}`);
  console.log(`Interactive URL: ${withdraw.url}`);
}

main().catch((err) => {
  console.error('[sep24-testnet]', err.message ?? err);
  process.exit(1);
});
