# FX Remit 2.0: Multi-Partner Offramp Integration Specification

This document details the architectural design and API mapping for integrating our next-generation off-ramp partners: **DexPay** and **Bread Africa**.

---

## 1. Architectural Strategy: The Provider Factory Pattern

To prevent vendor lock-in, manage provider downtime, and optimize for regional pricing/liquidity, FX Remit 2.0 will abstract its payout layer behind a unified interface:

```typescript
export interface PayoutProvider {
  id: string;
  name: string;
  fetchRate(
    source: string,
    destination: string,
    amount: string,
  ): Promise<ProviderRate>;
  createOrder(params: PayoutParams): Promise<PayoutOrder>;
  verifyBeneficiary(
    accountNumber: string,
    bankCode: string,
    countryCode: string,
  ): Promise<VerificationResult>;
}
```

---

## 2. DexPay Integration Flow (Step-by-Step)

DexPay is a non-custodial B2B offramp utilizing temporary deposit addresses. It is extremely simple to integrate and requires zero upfront user KYC creation.

### Step 1: Quoting

- **Endpoint**: `POST https://api.dexpay.io/quote`
- **Payload**:
  ```json
  {
    "tokenAmount": 100,
    "asset": "USDC",
    "chain": "BASE",
    "type": "SELL",
    "bankCode": "090267",
    "accountName": "Beneficiary Name",
    "accountNumber": "1234567890"
  }
  ```
- **Mapping in PayoutService**:
  We send user transaction parameters directly to DexPay to acquire a temporary `quoteId`.

### Step 2: Order Creation & Deposit Routing

- **Endpoint**: `POST https://api.dexpay.io/quote/{quoteId}`
- **Response**: Returns a unique deposit address: `0x037d782373058981C3dfa06A4DdF6E7D921Db37e`.
- **FX Remit Action**: The frontend PWA initiates a standard ERC20 transfer directly to this address. There is no need for complex contract router calls!

---

## 3. Bread Africa Integration Flow (Step-by-Step)

Bread Africa is a fully compliant offramp provider, offering native CNGN support on Base. It requires pre-verifying identity and beneficiary endpoints.

### Step 1: Pre-requisites (KYC & Beneficiary Setup)

Before initiating an off-ramp, we must link the user to a Bread `identity_id` and `beneficiary_id`:

1. **Verify Identity**:
   ```bash
   POST https://api.bread.africa/identity
   {
     "type": "BVN",
     "name": "User Name",
     "details": { "bvn": "1234567890", "dob": "01-05-1990" }
   }
   ```
2. **Create Beneficiary**:
   ```bash
   POST https://api.bread.africa/beneficiary
   {
     "currency": "NGN",
     "identity_id": "bread_identity_id",
     "details": { "bank_code": "100004", "account_number": "1234567890" }
   }
   ```

### Step 2: Quoting & Execution

- **Quote**: `POST https://api.bread.africa/quote/offramp`
- **Execution**:
  ```bash
  POST https://api.bread.africa/offramp
  {
    "wallet_id": "bread_wallet_id",
    "amount": 100,
    "beneficiary_id": "bread_beneficiary_id",
    "asset": "base:usdc"
  }
  ```

---

## 4. Webhook Reconciliation & Signature Safety

Both Bread and DexPay support HMAC-SHA256 signature verification. We will apply the same cryptographic verification pattern built during our webhook security hardening:

```typescript
const computedSignature = crypto
  .createHmac("sha256", process.env.PARTNER_WEBHOOK_SECRET)
  .update(JSON.stringify(req.body))
  .digest("hex");
```

---

## 5. Schema Modifications for Multi-Provider Support

To support multiple providers, we will add a `provider` column to our prisma schema:

```prisma
enum PayoutProviderType {
  PAYCREST
  DEXPAY
  BREAD
}

model Transaction {
  // ...
  provider      PayoutProviderType @default(PAYCREST)
  providerRef   String?            @map("provider_ref") // Stores quoteId or beneficiaryId
}
```
