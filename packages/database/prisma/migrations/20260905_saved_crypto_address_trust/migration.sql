-- Trust cooldown for saved crypto addresses (Instant Send fast-path eligibility).
ALTER TABLE "saved_crypto_addresses"
  ADD COLUMN IF NOT EXISTS "first_confirmed_at" TIMESTAMP(3);

-- Out-of-band alert when a new crypto send address is added.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NEW_CRYPTO_ADDRESS';
