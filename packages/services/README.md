# `@fx-remit/services`

Shared backend services for FX Remit (EVM + Paycrest + Stellar). Apps import the **flat public API** from `@fx-remit/services` do not deep-import domain folders from apps.

## Layout

```text
src/
  index.ts                 # re-exports all domains (unchanged public surface)
  paycrest/                # Paycrest API + payout orchestration + retail pricing
  alchemy/                 # Alchemy address activity + notify webhooks
  deposits/                # inbound USDC deposits + deposit indexer
  transactions/            # remittance ledger, abandon tokens, remittance indexer
  identity/                # Privy / wallet identity
  reconciliation/          # cron reconciliation
  evm/                     # shared EVM RPC + ABI + smoke scripts
  stellar/                 # Stellar SEP-10/24/38 + persist (see stellar/README.md)
```

| Folder | Purpose |
| ------ | ------- |
| `paycrest/` | Paycrest client, payouts, retail markup over rates |
| `alchemy/` | Webhook routing + Notify address registration |
| `deposits/` | Inbound deposit crediting + tokens + deposit indexer |
| `transactions/` | Pending/settled remittances, abandon tokens, remittance indexer |
| `identity/` | User onboarding / wallet linking |
| `reconciliation/` | Cron reconcile of payouts and deposits |
| `evm/` | `RpcClient`, router ABI, EVM smoke scripts |
| `stellar/` | Stellar rail (config, SEP clients, sandbox persist) |

Each domain keeps its **client/service**, **unit tests**, and (where applicable) **smoke scripts** together.

## Scripts

```bash
pnpm --filter @fx-remit/services build
pnpm --filter @fx-remit/services test
pnpm --filter @fx-remit/services evm:sandbox-smoke
pnpm --filter @fx-remit/services stellar:sep10-test
```
