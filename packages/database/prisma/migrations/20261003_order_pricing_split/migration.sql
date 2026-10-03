-- Paycrest order split saved when a bank payout is reserved, so every later order create
-- (retry, resume, nightly recovery) uses the same bank amount, sender fee and locked rate.
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "order_bank_amount" TEXT,
  ADD COLUMN IF NOT EXISTS "order_sender_fee" TEXT,
  ADD COLUMN IF NOT EXISTS "order_rate" TEXT;
