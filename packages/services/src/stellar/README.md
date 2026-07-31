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
  sep38/                    # SEP-38 quotes client + smoke
  persist/                 # sandbox rail=STELLAR DB writes (not live cash-out)
```

| Folder | Purpose |
| ------ | ------- |
| `types/` | Shared corridor, SEP, and quote types |
| `config/` | Anchor routing + `stellar.toml` parsing |
| `sep10/` | Web authentication client + `sep10-testnet` smoke |
| `sep38/` | FX quote client + `sep38-testnet` smoke |
| `sep24/` | Interactive withdraw client + `sep24-testnet` smoke |
| `persist/` | Sandbox `createStellarWithdrawStart` (not EVM `createPending`) |

Each SEP folder keeps its **client**, **unit tests**, and **testnet smoke** together. Apps still import via `@fx-remit/services` — only this package’s internal paths changed.

## Environment

Set these in `apps/pwa/.env.local` (see `apps/pwa/.env.example`). Defaults keep the rail **off**.

| Variable | Where | Purpose |
| -------- | ----- | ------- |
| `NEXT_PUBLIC_STELLAR_ENABLED` | PWA | Must be `true` for `/api/stellar/*` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | PWA client | `testnet` (default) or `public` — Freighter / Horizon |
| `STELLAR_NETWORK` | Server | `testnet` (default) or `public` — anchor pool |
| `STELLAR_TEST_SECRET` | Server / scripts | Dev-only `S…` seed for SEP-10/24 smoke (never commit) |
| `STELLAR_TEST_AMOUNT` | Scripts | Optional SEP-24 smoke amount (default `1`) |

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
| `POST /api/stellar/withdraw/start` | `{ corridor, amount, account, authToken }` **or** `signedChallenge` **or** server `STELLAR_TEST_SECRET` | `transaction_id` + `interactive_url` |

Signing stays in Freighter (`signTransactionXdr` / `authenticateWithFreighter` in `apps/pwa/src/lib/stellar/`). No product cash-out UI — call the APIs from the client when wiring cash-out.

SEP-38 against testanchor returns a **USD** stand-in rate (`demo_fiat`) — not NGN/KES.

### SEP-24 withdraw start (`stellar:sep24-test`)

Requires `STELLAR_TEST_SECRET`. Against SDF testanchor, `destination_asset` is forced to `iso4217:USD` (not NGN/KES). The script prints `Transaction id` and `Interactive URL`.

Friendbot + trustline expectations: fund the account with XLM via Friendbot, then add a trustline to testanchor USDC (`USDC_TESTNET_ISSUER`). Testanchor USDC withdraw limits are typically **1–10**. Starting interactive withdraw can succeed and return a hosted URL without a prior USDC balance; completing the flow later needs USDC on that trustline.

API (dev): with `NEXT_PUBLIC_STELLAR_ENABLED=true`, either set `STELLAR_TEST_SECRET` and `POST { "corridor": "NGN", "amount": "1" }`, or pass Freighter `account` + `authToken` / `signedChallenge`.

### Persist STELLAR remittance (sandbox)

After SEP-24 withdraw start succeeds, `/api/stellar/withdraw/start` may write a `transactions` row with `rail=STELLAR` and `anchor_transaction_id` via `createStellarWithdrawStart` (under `stellar/`, not EVM `createPending` — no ledger debit).

Persist only when a user is linked to the SEP-10 `account` (`users.stellar_public_key` match). Optional body `userId` must also have that same key — id alone is never trusted. Smoke without an app user still returns the interactive URL with `persisted: false`. Not wired into live cash-out UI.

## Incremental build

Work tracks parent issue **Stellar testnet readiness** (SEP-10 → quote → SEP-24 withdraw start). No product cash-out UI in that epic. See repo root `STELLAR_INTEGRATION_PLAN.md`.
