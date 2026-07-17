# FX Remit — Stellar rail 

This package implements the **Stellar settlement path** alongside the existing EVM + Paycrest rail. EVM is not replaced.

## Layout

| Module | SEP | Purpose |
| ------ | --- | ------- |
| `sep10.client.ts` | SEP-10 | Anchor web authentication |
| `sep38.client.ts` | SEP-38 | FX quotes (USDC → NGN/KES) |
| `sep24.client.ts` | SEP-24 | Interactive withdraw (cash-out start) |
| `anchor-toml.ts` | — | Discover anchor endpoints |
| `anchors.config.ts` | — | Corridor → anchor routing stubs |

## Environment

```bash
STELLAR_NETWORK=testnet   # or public
```

## Scripts

```bash
pnpm --filter @fx-remit/services stellar:sep10-test
```

## Incremental build

Commits land here before the full unified cash-out UX. See repo root `STELLAR_INTEGRATION_PLAN.md`.
