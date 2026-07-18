-- Deposit idempotency: allow multiple ERC-20 logs per tx.
-- Run against Supabase/Postgres before deploying creditInboundDeposit composite keys.

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_tx_hash_key";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_tx_hash_log_index_key'
  ) THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_tx_hash_log_index_key" UNIQUE ("tx_hash", "log_index");
  END IF;
END $$;
