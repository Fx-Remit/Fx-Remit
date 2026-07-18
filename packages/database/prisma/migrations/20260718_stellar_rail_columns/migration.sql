
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RemittanceRail') THEN
    CREATE TYPE "RemittanceRail" AS ENUM ('EVM', 'STELLAR');
  END IF;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "stellar_public_key" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_stellar_public_key_key'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_stellar_public_key_key" UNIQUE ("stellar_public_key");
  END IF;
END $$;

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "rail" "RemittanceRail" NOT NULL DEFAULT 'EVM',
  ADD COLUMN IF NOT EXISTS "stellar_payment_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "anchor_transaction_id" TEXT,
  ADD COLUMN IF NOT EXISTS "corridor" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_stellar_payment_hash_key'
  ) THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_stellar_payment_hash_key" UNIQUE ("stellar_payment_hash");
  END IF;
END $$;
