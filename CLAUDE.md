# CLAUDE.md — FX Remit

Fintech remittance monorepo (crypto → NGN/fiat). Treat ledger and payout code as money-path: fail closed, no double-credit, no negative spendable.

## Layout

- `apps/pwa` — Next.js App Router PWA (Privy auth, cash-out / deposit UI, API routes)
- `packages/services` — Paycrest, pricing, transaction/ledger, reconciliation, Stellar
- `packages/database` — Prisma schema + generated client (`walletBalance` / amounts are `Decimal`)
- `packages/contracts` — EVM contracts
- `packages/shared-sdk`, `packages/ui-components` — shared helpers / UI

## Commands

```bash
pnpm install
pnpm --filter @fx-remit/pwa dev
pnpm --filter @fx-remit/services exec node --import tsx --test <path-to-test>
pnpm --filter @fx-remit/pwa test
pnpm build
```

## Money-path rules

- Prefer `updateMany` + `walletBalance: { gte: amount }` for debits/reserves (never unconditional decrement).
- Client amounts for display only; bind retail FX / `payoutFiat` server-side at create-pending (`QuoteBindService`).
- Idempotent retries: same `externalId` must resume reserved PENDING/PROCESSING without re-binding a stale quote when already reserved.
- Do not restore ledger while a Paycrest order may still be fundable; use REFUND_REQUIRED / ops paths when on-chain or unknown.
- Serialize Prisma `Decimal` / `BigInt` to strings or numbers before returning from server actions or RSC → client props.

## Review focus (@claude)

When reviewing PRs, prioritize:

1. Double-spend / double-credit / negative balance
2. Authz (wallet ownership, Privy DID ↔ user row)
3. Idempotency and resume after timeouts
4. Quote / rate trust boundary (client vs server)
5. Missing tests on money-path handlers

Default to a thorough code review comment when the trigger is just `@claude`. Call out severity and a concrete fix when something is wrong; keep nits clearly labeled.

## Style

- Match existing patterns; minimal diffs; no drive-by refactors.
- Branch names: descriptive, no issue numbers (e.g. `fix/server-bound-create-pending-quote`).
- PR titles: no issue numbers; body includes `Closes #N` when applicable.
- One audit finding / concern per PR when practical.
