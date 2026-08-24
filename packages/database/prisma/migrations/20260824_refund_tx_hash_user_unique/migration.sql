-- Per-user unique refund link: closes concurrent double-credit without
-- suppressing another user's Transfer logs that share the same tx hash.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_user_id_refund_tx_hash_key"
  ON "transactions" ("user_id", "refund_tx_hash");
