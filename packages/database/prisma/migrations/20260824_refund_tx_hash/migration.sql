-- Paycrest on-chain refund hash linked to remittance (#90).
-- UNIQUE allows multiple NULLs in Postgres; non-null values are one-refund-one-row.
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "refund_tx_hash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_refund_tx_hash_key"
  ON "transactions" ("refund_tx_hash");
