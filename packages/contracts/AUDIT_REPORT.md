# Fx-Remit Security Audit Report

**Status:** PASS (Production Ready)  
**Audit Date:** March 28, 2026  
**Security Level:** High Fidelity

---

## 1. Executive Summary

The Fx-Remit smart contract suite consists of a central router and modular swap adapters designed for cross-chain stablecoin-to-fiat remittances. The architecture is stateless, minimizing risk to user funds. Security focuses on strictly controlled administrative functions and robust integration with external protocols (Uniswap, Mento, Permit2).

---

## 2. Methodology & Procedures

The audit followed the **Senior Security Researcher** toolkit, including:

- **`audit-context-building`**: Ultra-granular code analysis of the entire codebase.
- **`entry-point-analyzer`**: Mapping of all state-changing functions and access controls.
- **`building-secure-contracts`**: Multi-chain vulnerability detection (Base, Arbitrum, Celo).
- **`permit2-signature-audit`**: Verification of EIP-712 domain and replay safety.

---

## 3. Entry Point & Access Control Mapping

| Function                 | Access Level      | Risk Level | Description                                           |
| :----------------------- | :---------------- | :--------- | :---------------------------------------------------- |
| `swapAndRemit`           | **PUBLIC**        | Low/Med    | Entry point for users. Handles value flow to gateway. |
| `swapAndRemitWithPermit` | **PUBLIC**        | Low/Med    | Permit2-based entry point.                            |
| `setGateway`             | **ADMIN** (Owner) | **High**   | Configuration of the Paycrest Gateway.                |
| `setAdapter`             | **ADMIN** (Owner) | **High**   | Configuration of token-specific swap adapters.        |
| `rescueTokens`           | **ADMIN** (Owner) | **High**   | Emergency fund recovery mechanism.                    |
| `setFeeConfig`           | **ADMIN** (Owner) | Low        | Configure revenue sharing (capped at 2%).             |

---

## 4. Vulnerability Assessment

### Reentrancy and Cross-Contract Calls

- **Assessed:** All public entry points use OpenZeppelin's `ReentrancyGuard`.
- **Verdict:** **SAFE**. All external calls (Adapters/Gateway) are protected against reentrancy.

### Integer Arithmetic

- **Assessed:** Logic uses Solidity 0.8.26 which has built-in overflow/underflow checks.
- **Verdict:** **SAFE**.

### Access Control and Authorization

- **Assessed:** Verified `onlyOwner` modifiers on all administrative functions.
- **Verdict:** **SAFE**. Critical configurations are restricted to the contract owner. (Recommendation: Use a Multi-sig for the Owner address).

### Permit2 Signature Safety

- **Assessed:** Verified usage of `permit2.permitTransferFrom`.
- **Verdict:** **SAFE**. Correct implementation of nonce-based, time-limited signature transfers via Uniswap's Permit2.

### Native Token (ETH/CELO) Handling

- **Assessed:** Verified logic for `amountIn` vs `msg.value` and `IWETH` wrapping.
- **Verdict:** **SAFE**. The router correctly validates sent ETH and wraps it before orchestration.

---

## 5. Architectural Invariants

1. **Safety Cap**: Fees can never exceed **200 bps (2%)** due to a hard-coded check in `setFeeConfig`.
2. **Statelessness**: The router does not hold long-term balances except for transient states during execution.
3. **Rescue Mechanism**: In case of failed gateway calls, the Owner can safely recover stuck funds for users.

---

## 6. Recommendations

- **Multi-sig Ownership**: Transition the `Ownable` contract to a Gnosis Safe multi-sig for production deployment.
- **Emissions Monitoring**: Use the `RemittanceInitiated` events to monitor protocol healthy and revenue distribution via Dune Analytics.

---
