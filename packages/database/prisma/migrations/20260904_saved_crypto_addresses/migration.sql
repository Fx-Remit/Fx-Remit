-- Saved crypto cash-out destination addresses, auto-backfilled from history.
CREATE TABLE IF NOT EXISTS "saved_crypto_addresses" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "label" TEXT,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saved_crypto_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "saved_crypto_addresses_user_id_network_address_key"
  ON "saved_crypto_addresses"("user_id", "network", "address");

CREATE INDEX IF NOT EXISTS "saved_crypto_addresses_user_id_last_used_at_idx"
  ON "saved_crypto_addresses"("user_id", "last_used_at" DESC);

DO $$ BEGIN
  ALTER TABLE "saved_crypto_addresses"
    ADD CONSTRAINT "saved_crypto_addresses_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
