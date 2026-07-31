#!/usr/bin/env node
/**
 * SEP-24 withdraw start smoke test (sandbox) against SDF testanchor.
 *
 * Requires STELLAR_TEST_SECRET. For a reliable run against testanchor:
 *   1. Friendbot-fund the G… account (XLM)
 *   2. Trustline to testanchor USDC (USDC_TESTNET_ISSUER in anchors.config)
 *   3. Amount within anchor min/max (USDC withdraw: typically 1–10)
 *
 * Usage:
 *   STELLAR_TEST_SECRET=S... pnpm --filter @fx-remit/services stellar:sep24-test
 *   STELLAR_TEST_SECRET=S... STELLAR_TEST_AMOUNT=1 pnpm --filter @fx-remit/services stellar:sep24-test
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import { Sep10Client, keypairFromSecret } from '../sep10/sep10.client.js';
import { Sep24Client, resolveSep24DestinationAsset } from './sep24.client.js';
import { fetchAnchorToml, clearAnchorTomlCache } from '../config/anchor-toml.js';
import {
  TEST_ANCHOR,
  STELLAR_NETWORK_PASSPHRASE,
  getStellarNetwork,
} from '../config/anchors.config.js';

async function main() {
  const secret = process.env.STELLAR_TEST_SECRET;
  if (!secret) {
    throw new Error(
      'Set STELLAR_TEST_SECRET for sep24 withdraw test (Friendbot-funded account recommended)',
    );
  }

  clearAnchorTomlCache();

  const network = getStellarNetwork();
  const passphrase = STELLAR_NETWORK_PASSPHRASE[network];
  const anchor = TEST_ANCHOR;
  const keypair = keypairFromSecret(secret);
  const amount = process.env.STELLAR_TEST_AMOUNT ?? '1';
  const corridor = process.env.STELLAR_TEST_CORRIDOR?.toUpperCase() === 'KES' ? 'KES' : 'NGN';
  const destinationAsset = resolveSep24DestinationAsset(anchor, corridor);

  console.log(`Network: ${network}`);
  console.log(`Anchor: ${anchor.homeDomain}`);
  console.log(`Account: ${keypair.publicKey()}`);
  console.log(`Amount (USDC): ${amount}`);
  console.log(`Product corridor: ${corridor}`);
  console.log(`destination_asset: ${destinationAsset}`);

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
    destinationAsset,
  });

  console.log('SEP-24 withdraw started');
  console.log(`Transaction id: ${withdraw.id}`);
  console.log(`Interactive URL: ${withdraw.url}`);
  if (withdraw.type) {
    console.log(`Type: ${withdraw.type}`);
  }

  // Long JWTs wrap in the terminal; Cmd+click truncates and the UI lands on
  // /status?session_token=undefined. Write + open the full URL instead.
  const urlFile = join(process.cwd(), '.sep24-interactive-url.txt');
  writeFileSync(urlFile, `${withdraw.url}\n`, 'utf8');
  console.log('');
  console.log('Do NOT Cmd+click the URL above (terminal truncates the JWT).');
  console.log(`Full URL written to: ${urlFile}`);
  if (process.platform === 'darwin') {
    const opened = spawnSync('open', [withdraw.url], { stdio: 'ignore' });
    if (opened.status === 0) {
      console.log('Opened interactive KYC form in your default browser.');
    } else {
      console.log(`Open manually: open "$(cat ${urlFile})"`);
    }
  } else {
    console.log(`Open manually: xdg-open "$(cat ${urlFile})"  # or paste the file contents`);
  }
  console.log(
    `After the form: STELLAR_SEP24_TX_ID=${withdraw.id} pnpm --filter @fx-remit/services stellar:sep24-pay-test`,
  );
}

main().catch((err) => {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data ?? err.message;
    console.error('[sep24-testnet]', typeof detail === 'string' ? detail : JSON.stringify(detail));
  } else {
    console.error('[sep24-testnet]', err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
