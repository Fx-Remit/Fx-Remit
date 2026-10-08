-- PayoutForwarderV2 (#191): the forwarder contract an order is pinned to, recorded at its first
-- forwarder claim. Retries and recovery use the recorded contract, never the current env, so an
-- order never switches contracts mid-send. Null on rows claimed before this (V1).
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "funding_contract" TEXT;
