-- Bank payouts can be funded from Base or Celo (#196). Null on older rows, which are Base.
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "source_network" TEXT;
