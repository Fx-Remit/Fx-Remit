# FX Remit — Stellar rail

This package implements the **Stellar settlement path** alongside the existing EVM + Paycrest rail. EVM is not replaced.

## Layout

```text
stellar/
  index.ts                 # public barrel (apps import from @fx-remit/services)
  types/                   # shared Stellar types
  config/                  # anchors + stellar.toml discovery
  sep10/                   # SEP-10 auth client + smoke
  sep24/                   # SEP-24 withdraw client + smoke
  sep38/                   # SEP-38 quotes client + smoke
  payment/                 # Horizon USDC Payment + Flow B orchestration
  persist/                 # sandbox rail=STELLAR DB writes (not live cash-out)
```

| Folder | Purpose |
| ------ | ------- |
| `types/` | Shared corridor, SEP, and quote types |
| `config/` | Anchor routing + `stellar.toml` parsing |
| `sep10/` | Web authentication client + `sep10-testnet` smoke |
| `sep38/` | FX quote client + `sep38-testnet` smoke |
| `sep24/` | Interactive withdraw client + `sep24-testnet` smoke |
| `payment/` | Submit USDC Payment + poll SEP-24 status (`sep24-pay-test`) |
| `persist/` | Sandbox `createStellarWithdrawStart` / `setStellarPaymentHash` |

Each SEP folder keeps its **client**, **unit tests**, and **testnet smoke** together. Apps still import via `@fx-remit/services` — only this package’s internal paths changed.

## Environment

Set these in `apps/pwa/.env.local` (see `apps/pwa/.env.example`). Defaults keep the rail **off**.

| Variable | Where | Purpose |
| -------- | ----- | ------- |
| `NEXT_PUBLIC_STELLAR_ENABLED` | PWA | Must be `true` for `/api/stellar/*` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | PWA client | `testnet` (default) or `public` — Freighter / Horizon |
| `STELLAR_NETWORK` | Server | `testnet` (default) or `public` — anchor pool |
| `STELLAR_TEST_SECRET` | Server / scripts | Dev-only `S…` seed for SEP-10/24 smoke (never commit) |
| `STELLAR_TEST_OPERATOR_PRIVY_DIDS` | Server | Comma-separated Privy DIDs allowed to use `STELLAR_TEST_SECRET` on HTTP withdraw routes |
| `STELLAR_TEST_AMOUNT` | Scripts | Optional SEP-24 smoke amount (default `1`) |

### Security (#92)

**Never** set `NEXT_PUBLIC_STELLAR_ENABLED=true` together with `STELLAR_TEST_SECRET` on a publicly reachable host without both Privy and an operator allowlist. Mutating routes (`POST /api/stellar/withdraw/start`, `POST /api/stellar/withdraw/pay`) require an `Authorization: Bearer <Privy JWT>` (**401** if missing/invalid). Paths that sign with `STELLAR_TEST_SECRET` additionally require the caller’s Privy DID in `STELLAR_TEST_OPERATOR_PRIVY_DIDS` (**403** if the list is empty or the DID is not listed) — open Privy signup alone must not spend the shared sandbox hot wallet. Prefer Freighter user-signed Payment for real flows; the server seed is sandbox-only and must not be the sole payer in production.

## Testnet USDC (important)

On Stellar, USDC is `(code, issuer)`. SDF testanchor publishes a specific issuer in its `stellar.toml` — that value is `USDC_TESTNET_ISSUER` in `anchors.config.ts`. It is **not** the classic Circle testnet issuer (`CIRCLE_USDC_TESTNET_ISSUER`). Trustline and SEP calls for this rail must use the testanchor issuer.

## Friendbot + smoke scripts

1. Create or reuse a testnet keypair (`G…` / `S…`). Freighter testnet accounts use the browser SEP-10 APIs; smoke scripts need `STELLAR_TEST_SECRET`.
2. Fund XLM via Friendbot: `https://friendbot.stellar.org/?addr=G…`
3. Establish a **trustline** to testanchor USDC (`USDC` + `USDC_TESTNET_ISSUER`) before expecting a USDC balance or SEP-24 payment.
4. Obtain test USDC via the anchor’s deposit / sandbox flow if needed (SEP-24 withdraw start can still return an interactive URL without a prior balance; completing payout needs USDC).
5. Export locally (do not commit):

```bash
export STELLAR_NETWORK=testnet
export STELLAR_TEST_SECRET=S...
```

6. Run:

```bash
pnpm --filter @fx-remit/services stellar:sep10-test
pnpm --filter @fx-remit/services stellar:sep38-test
pnpm --filter @fx-remit/services stellar:sep24-test
```

### SEP-10 smoke (`stellar:sep10-test`)

Verified live against `testanchor.stellar.org` (prints `SEP-10 auth OK` and a JWT prefix).

Omit `STELLAR_TEST_SECRET` to use a **random keypair** for a one-shot auth check, or set it to reuse a known `S…` seed. SEP-10 only signs the anchor challenge — it does **not** need Friendbot funding or a USDC balance. Prefer a funded `STELLAR_TEST_SECRET` when you will also run SEP-24 next.

### Freighter SEP-10 (API only)

With `NEXT_PUBLIC_STELLAR_ENABLED=true`, the PWA exposes:

| Endpoint | Body | Returns |
| -------- | ---- | ------- |
| `POST /api/stellar/auth/challenge` | `{ account, corridor }` | challenge `transaction` XDR + `network_passphrase` |
| `POST /api/stellar/auth/token` | `{ signedTransaction, corridor }` | anchor `token` (JWT) |
| `POST /api/stellar/withdraw/start` | Privy Bearer + `{ corridor, amount, account, authToken }` **or** `signedChallenge` **or** server `STELLAR_TEST_SECRET` | `transaction_id` + `interactive_url` |

`withdraw/start` and `withdraw/pay` require `Authorization: Bearer <Privy JWT>` (#92). Signing stays in Freighter (`signTransactionXdr` / `authenticateWithFreighter` in `apps/pwa/src/lib/stellar/`). No product cash-out UI — call the APIs from the client when wiring cash-out.

SEP-38 against testanchor returns a **USD** stand-in rate (`demo_fiat`) — not NGN/KES.

### SEP-24 withdraw start (`stellar:sep24-test`)

Requires `STELLAR_TEST_SECRET`. Against SDF testanchor, `destination_asset` is forced to `iso4217:USD` (not NGN/KES). The script prints `Transaction id` and `Interactive URL`, writes the full URL to `.sep24-interactive-url.txt`, and on macOS runs `open` so the KYC form loads in your browser. **Do not Cmd+click the URL in the terminal** — wrapping truncates the JWT and the UI redirects to `/status?session_token=undefined`.

#### Interactive KYC: expected UI vs known SDF blocker

When the hosted [SEP-24 Reference UI](https://anchor-ref-ui-testanchor.stellar.org) works, the flow is:

1. `/start` exchanges the interactive JWT for a `session_token`
2. If status is `incomplete` → **`/kyc` Withdrawal form** (amount, name, email, bank, account)
3. After submit → `/status` with memo / amounts filled in
4. Then run `stellar:sep24-pay-test` with `STELLAR_SEP24_TX_ID=<id>`

**Observed blocker (2026-07-31):** after a successful `/start`, `https://anchor-reference-server-testanchor.stellar.org/transaction` (and `/submit`) return:

`Illegal input: Fields [id, status, kind] are required for type ... Transaction`

The UI then treats the response as “not incomplete” and lands on an **empty status page** (dashes only) — there is nowhere to type KYC. This is an **upstream SDF testanchor / reference-server** failure, not a bug in Fx Remit start/pay. Retry `stellar:sep24-test` later; unit tests still cover the pay path without live KYC.

Friendbot + trustline expectations: fund the account with XLM via Friendbot, then add a trustline to testanchor USDC (`USDC_TESTNET_ISSUER`). Testanchor USDC withdraw limits are typically **1–10**. Starting interactive withdraw can succeed and return a hosted URL without a prior USDC balance; completing the flow later needs USDC on that trustline.

API (dev): with `NEXT_PUBLIC_STELLAR_ENABLED=true` and a Privy Bearer JWT, either set `STELLAR_TEST_SECRET` and `POST { "corridor": "NGN", "amount": "1" }`, or pass Freighter `account` + `authToken` / `signedChallenge`.

### Persist STELLAR remittance (sandbox)

After SEP-24 withdraw start succeeds, `/api/stellar/withdraw/start` may write a `transactions` row with `rail=STELLAR` and `anchor_transaction_id` via `createStellarWithdrawStart` (under `stellar/`, not EVM `createPending` — no ledger debit).

Persist only when a user is linked to the SEP-10 `account` (`users.stellar_public_key` match). Optional body `userId` must also have that same key — id alone is never trusted. Smoke without an app user still returns the interactive URL with `persisted: false`. Not wired into live cash-out UI.

### SEP-24 pay + status poll (`stellar:sep24-pay-test`)

After interactive withdraw (and KYC if needed), poll until status is `pending_user_transfer_start` with `withdraw_memo` + `withdraw_anchor_account`, submit a Horizon USDC `Payment` signed with `STELLAR_TEST_SECRET`, then poll until a terminal SEP-24 status (timeout still returns the on-chain hash). Optionally stores `stellar_payment_hash` via `setStellarPaymentHash`. Same-process lock + DB hash reuse + a final status re-check before submit reduce double Payment. Retries after payment fail fast (`no longer awaiting user transfer`).

```bash
STELLAR_TEST_SECRET=S... pnpm --filter @fx-remit/services stellar:sep24-pay-test
# resume after completing interactive URL:
STELLAR_TEST_SECRET=S... STELLAR_SEP24_TX_ID=<id> pnpm --filter @fx-remit/services stellar:sep24-pay-test
```

API (dev): `POST /api/stellar/withdraw/pay` with Privy Bearer JWT, `{ corridor, transaction_id }`, and `STELLAR_TEST_SECRET`. If you pass Freighter `authToken` / `signedChallenge`, `account` is required and **must** equal the test secret’s `G…` (server still signs Payment). When `waitForTerminal: false`, response `status` is `pending_anchor` (not the pre-pay `pending_user_transfer_start`). Unauthenticated requests return **401**.

## Incremental build

Work tracks parent issue **Stellar testnet readiness** (SEP-10 → quote → SEP-24 withdraw → pay). No product cash-out UI in that epic. See repo root `STELLAR_INTEGRATION_PLAN.md`.
