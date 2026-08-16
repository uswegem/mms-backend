-- M4(b) additive: reference binding, allocations, lookup logs, settings

DO $$ BEGIN
  CREATE TYPE "fee_reference_type" AS ENUM ('INVOICE', 'STUDENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "fee_allocation_rule" AS ENUM ('OLDEST_DUE_FIRST', 'NEWEST_DUE_FIRST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "reference_lookup_outcome" AS ENUM (
    'SUCCESS', 'SETTLED', 'INVALID_FORMAT', 'BAD_CHECK_DIGIT', 'NOT_FOUND',
    'CANCELLED', 'SCHOOL_SUSPENDED', 'SCHOOL_INACTIVE', 'NO_OPEN_BALANCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "fee_payments" ALTER COLUMN "invoice_id" DROP NOT NULL;
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "reference_type" "fee_reference_type";
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "resolved_student_id" UUID;
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "resolved_invoice_id" UUID;
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "amount_due_at_lookup" DECIMAL(18,2);

UPDATE "fee_payments"
SET "reference_type" = 'INVOICE',
    "amount_due_at_lookup" = COALESCE("amount_due_at_lookup", "amount"),
    "resolved_invoice_id" = COALESCE("resolved_invoice_id", "invoice_id")
WHERE "reference_type" IS NULL;

ALTER TABLE "fee_payments" ALTER COLUMN "reference_type" SET NOT NULL;
ALTER TABLE "fee_payments" ALTER COLUMN "amount_due_at_lookup" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "fee_payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fee_payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "school_fee_settings" (
    "merchant_id" UUID NOT NULL,
    "allocation_rule" "fee_allocation_rule" NOT NULL DEFAULT 'OLDEST_DUE_FIRST',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "school_fee_settings_pkey" PRIMARY KEY ("merchant_id")
);

CREATE TABLE IF NOT EXISTS "reference_lookup_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID,
    "reference" VARCHAR(40) NOT NULL,
    "reference_type" "fee_reference_type",
    "outcome" "reference_lookup_outcome" NOT NULL,
    "channel" VARCHAR(40) NOT NULL DEFAULT 'API',
    "amount_due" DECIMAL(18,2),
    "error_code" VARCHAR(60),
    "resolved_invoice_id" UUID,
    "resolved_student_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reference_lookup_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fee_payments_resolved_student_id_idx" ON "fee_payments"("resolved_student_id");
CREATE INDEX IF NOT EXISTS "fee_payment_allocations_fee_payment_id_idx" ON "fee_payment_allocations"("fee_payment_id");
CREATE INDEX IF NOT EXISTS "fee_payment_allocations_invoice_id_idx" ON "fee_payment_allocations"("invoice_id");
CREATE INDEX IF NOT EXISTS "fee_payment_allocations_merchant_invoice_idx" ON "fee_payment_allocations"("merchant_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "reference_lookup_logs_reference_created_idx" ON "reference_lookup_logs"("reference", "created_at");
CREATE INDEX IF NOT EXISTS "reference_lookup_logs_merchant_created_idx" ON "reference_lookup_logs"("merchant_id", "created_at");
CREATE INDEX IF NOT EXISTS "reference_lookup_logs_outcome_created_idx" ON "reference_lookup_logs"("outcome", "created_at");

DO $$ BEGIN
  ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_fee_payment_id_fkey"
    FOREIGN KEY ("fee_payment_id") REFERENCES "fee_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "school_fee_settings" ADD CONSTRAINT "school_fee_settings_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "reference_lookup_logs" ADD CONSTRAINT "reference_lookup_logs_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_resolved_student_id_fkey"
    FOREIGN KEY ("resolved_student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill allocations for existing single-invoice payments
INSERT INTO "fee_payment_allocations" ("fee_payment_id", "invoice_id", "merchant_id", "amount")
SELECT p."id", p."invoice_id", p."merchant_id", p."amount"
FROM "fee_payments" p
WHERE p."invoice_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "fee_payment_allocations" a WHERE a."fee_payment_id" = p."id"
  );
