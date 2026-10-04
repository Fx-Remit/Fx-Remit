-- Stellar is removed (#166). No row used these columns. Apply only after the code
-- without them is live: older deploys still read them on every full-row query.
-- Dropping a column drops its unique constraint with it.
ALTER TABLE "transactions"
  DROP COLUMN IF EXISTS "stellar_payment_hash",
  DROP COLUMN IF EXISTS "rail";

DROP TYPE IF EXISTS "RemittanceRail";

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "stellar_public_key";
