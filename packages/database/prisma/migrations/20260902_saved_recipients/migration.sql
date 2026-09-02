-- Paycrest institution code on remittances (reuse / recon).
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "recipient_bank_code" TEXT;

-- Saved bank / mobile recipients address book.
DO $$ BEGIN
  CREATE TYPE "RecipientType" AS ENUM ('BANK', 'MOBILE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "saved_recipients" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "RecipientType" NOT NULL DEFAULT 'BANK',
  "currency" TEXT NOT NULL,
  "institution_code" TEXT NOT NULL,
  "institution_name" TEXT NOT NULL,
  "account_identifier" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saved_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "saved_recipients_user_id_currency_institution_code_account_identifier_key"
  ON "saved_recipients"("user_id", "currency", "institution_code", "account_identifier");

CREATE INDEX IF NOT EXISTS "saved_recipients_user_id_last_used_at_idx"
  ON "saved_recipients"("user_id", "last_used_at" DESC);

DO $$ BEGIN
  ALTER TABLE "saved_recipients"
    ADD CONSTRAINT "saved_recipients_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
