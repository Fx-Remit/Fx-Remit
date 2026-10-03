-- Bank payout funding through PayoutForwarder (relayer path).
-- funding_path: "direct" | "forwarder", fixed on the first send and reused by every retry.
-- funding_tx_hash / funding_tx_raw: the signed relayer transaction, stored before broadcast
-- so a timeout resends the same transaction instead of signing a new one.
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "funding_path" TEXT,
  ADD COLUMN IF NOT EXISTS "funding_tx_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "funding_tx_raw" TEXT;
