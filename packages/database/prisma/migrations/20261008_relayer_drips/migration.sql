-- PayoutForwarderV2 (#191): relayer ETH sent so a wallet can approve V2 once for a token with no
-- EIP-3009 (USDT on Base). One drip per user, chain and token, ever: the unique index is the limit.
CREATE TABLE IF NOT EXISTS "relayer_drips" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "wallet" TEXT NOT NULL,
  "amount_wei" TEXT NOT NULL,
  "tx_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relayer_drips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "relayer_drips_user_id_chain_id_token_key"
  ON "relayer_drips"("user_id", "chain_id", "token");

DO $$ BEGIN
  ALTER TABLE "relayer_drips"
    ADD CONSTRAINT "relayer_drips_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
