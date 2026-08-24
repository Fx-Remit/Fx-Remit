-- Paycrest on-chain refund hash linked to remittance (#90).
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "refund_tx_hash" TEXT;
