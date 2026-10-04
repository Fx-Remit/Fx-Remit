-- Visible fee saved when a bank payout is reserved, so history shows the same fee and
-- rate the user confirmed. Null on rows reserved before it existed.
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "order_fee_usd" TEXT;
