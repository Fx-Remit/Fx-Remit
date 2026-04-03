# FX Remit: Splash & Onboarding Architecture (Brainstorm)

This document outlines the proposed flow for welcoming new users to the FX Remit PWA, integrating secure Web3 authentication with a personalized, high-fidelity experience.

## The Core Concept

The goal is to move from a raw "Wallet Address" to a **"Personalized Account"** (Name, Email, Avatar) immediately after authentication.

---

## The 5-Phase Flow

### 1. Splash Screen (Initial Launch)

- **Visuals**: Logo animation with a premium gradient background.
- **Logic**:
  - Check if `privy.ready` and `privy.authenticated`.
  - **Authenticated**: Fetch user profile from the backend database.
    - If profile exists -> **Dashboard**.
    - If profile is missing -> **Onboarding Phase**.
  - **Unauthenticated**: Show the "Welcome" Auth view.

### 2. Authentication (Privy Shield)

- User enters Email or chooses a social login.
- Privy handles the OTP/Magic Link and **Embedded Wallet** creation.
- Once success is returned, the app triggers the "New User Check."

### 3. High-Fidelity Onboarding (The Data Collection)

A sleek, modal-based flow to personalize the account:

- **Screen 1: Personal Details**
  - Collect **Full Name** (Required for remittance receipts).
  - Collect **Username** (Optional, for easy P2P transfers).
- **Screen 2: Visual Identity**
  - Interactive **Avatar Upload**.
  - Fallback: Initials-based avatar (e.g., "JD") with a custom color picker.
- **Screen 3: Final Security Confirmation**
  - Display a "3 Correct" checklist:
    1. [✓] Email Verified
    2. [✓] Wallet Secured
    3. [✓] Profile Completed

### 4. Database Synchronization 🔄

- **Action**: Call a backend API (e.g., `POST /api/user/onboard`).
- **Payload**:
  - `privy_did`: The unique Privy identifier.
  - `wallet_address`: The generated embedded wallet address.
  - `name`: User's full name.
  - `email`: Retreived from Privy.
  - `avatar_url`: User uploaded image.
- **Goal**: Create a link between the blockchain identity (wallet) and the personal identity (database).

### 5. Final Handover

- After successful DB sync, trigger a celebratory animation (e.g., subtle confetti or a "Welcome" slide).
- Smooth transition into the **Home Dashboard**.

---

## Technical Stack & Refs

- **Auth**: Privy SDK (`usePrivy`, `useLogin`).
- **Backend**: Node.js/Next.js API routes + Database (Supabase/PostgreSQL/Firebase).
- **UI**: Tailwind CSS + `max-w-[430px]` PWA container.
- **Icons**: Lucide React (`ShieldCheck`, `UserPlus`, `CheckCircle2`).

---

---

## Privy SDK Priority List 🛠️

Based on our brainstorming, these are the features we will implement from the Privy documentation:

### **1. The Essentials (Must Have)**

- **Privy Auth Provider**: Email, SMS, and Social login for maximum user accessibility.
- **Embedded Wallets (`useCreateWallet`)**: Seamless background wallet creation for new users.
- **Transaction Execution (`useSendTransaction`)**: Essential for the core remittance flow (stablecoin transfers).
- **Viem Integration**: Proper ERC-20 (`erc20Abi`) encoding for USDC/cUSD payments.
- **Backend API Auth**: Securing user profile creation with Privy's Server SDK.

### **2. Post-MVP Scaling (Phase 2)**

- **Custodial Integration (Bridge)**: Moving to institutional-grade fiat/stablecoin handling for compliance.
- **Webhooks (`wallet.funds_deposited`)**: Real-time app notifications when blockchain transfers settle.
- **EIP-7702 Upgrades**: Upgrading simple accounts to Smart Accounts for gasless batch transactions.

### **3. Out of Scope (For Now)**

- **Own Auth Provider**: Privy will be our source of truth; no need for a manual legacy provider.
- **Manual SIWE Messages**: Privy’s `login()` handles the SIWE UI. We don’t need the low-level `useLoginWithSiwe` hooks yet.
- **Non-EVM Chains**: We are focusing on high-speed L2s (Celo/Base) first.

---

> [!TIP]
> Keep the Onboarding screens as minimal as possible. The faster the user gets to the Dashboard, the more likely they are to perform their first transaction. 🎯🔩🧗‍♂️✨
