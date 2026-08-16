-- M4(a) additive schema only — does not alter existing TIPS/QR/policy objects

DO $$ BEGIN
  CREATE TYPE "student_status" AS ENUM ('ACTIVE', 'TRANSFERRED', 'GRADUATED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "fee_structure_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "fee_invoice_status" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "fee_adjustment_type" AS ENUM ('DISCOUNT', 'WAIVER', 'SCHOLARSHIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "fee_payment_record_status" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'DUPLICATE_IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "fee_payment_channel" AS ENUM ('QR', 'LIPA_NAMBA', 'USSD', 'API', 'MOCK', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "guardian_name" VARCHAR(255);
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "status" "student_status" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS "academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "starts_on" DATE,
    "ends_on" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "academic_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "starts_on" DATE,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "class_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "class_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "student_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fee_structures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "academic_term_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "fee_structure_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fee_structure_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fee_structure_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "due_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_structure_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fee_invoice_sequences" (
    "merchant_id" UUID NOT NULL,
    "last_invoice" INTEGER NOT NULL DEFAULT 0,
    "last_reference" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_invoice_sequences_pkey" PRIMARY KEY ("merchant_id")
);

CREATE TABLE IF NOT EXISTS "fee_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_structure_id" UUID NOT NULL,
    "academic_term_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "invoice_number" VARCHAR(40) NOT NULL,
    "payment_reference" VARCHAR(40) NOT NULL,
    "status" "fee_invoice_status" NOT NULL DEFAULT 'UNPAID',
    "currency" CHAR(3) NOT NULL DEFAULT 'TZS',
    "subtotal_amount" DECIMAL(18,2) NOT NULL,
    "adjustment_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "amount_paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "outstanding_balance" DECIMAL(18,2) NOT NULL,
    "due_date" DATE,
    "is_overdue" BOOLEAN NOT NULL DEFAULT false,
    "is_late_payment" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" VARCHAR(500),
    "cancelled_by" UUID,
    "qr_code_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fee_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "fee_structure_item_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "due_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fee_invoice_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "invoice_line_id" UUID,
    "type" "fee_adjustment_type" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "percent_off" DECIMAL(5,2),
    "amount_off" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "fee_invoice_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fee_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "payment_reference" VARCHAR(40) NOT NULL,
    "gateway_txn_ref" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'TZS',
    "status" "fee_payment_record_status" NOT NULL DEFAULT 'PENDING',
    "channel" "fee_payment_channel" NOT NULL DEFAULT 'MOCK',
    "payer_name_masked" VARCHAR(100),
    "payer_msisdn_masked" VARCHAR(20),
    "paid_at" TIMESTAMPTZ(6),
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "student_account_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "fee_payment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_account_credits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "academic_years_merchant_id_idx" ON "academic_years"("merchant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "academic_years_merchant_id_name_key" ON "academic_years"("merchant_id", "name");
CREATE INDEX IF NOT EXISTS "academic_terms_merchant_id_idx" ON "academic_terms"("merchant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "academic_terms_academic_year_id_name_key" ON "academic_terms"("academic_year_id", "name");
CREATE INDEX IF NOT EXISTS "class_levels_merchant_id_idx" ON "class_levels"("merchant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "class_levels_merchant_id_code_key" ON "class_levels"("merchant_id", "code");
CREATE INDEX IF NOT EXISTS "student_enrollments_merchant_year_class_idx" ON "student_enrollments"("merchant_id", "academic_year_id", "class_level_id");
CREATE UNIQUE INDEX IF NOT EXISTS "student_enrollments_student_id_academic_year_id_key" ON "student_enrollments"("student_id", "academic_year_id");
CREATE INDEX IF NOT EXISTS "fee_structures_merchant_id_status_idx" ON "fee_structures"("merchant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_structures_year_term_class_version_key" ON "fee_structures"("merchant_id", "academic_year_id", "academic_term_id", "class_level_id", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_structure_items_fee_structure_id_code_key" ON "fee_structure_items"("fee_structure_id", "code");
CREATE INDEX IF NOT EXISTS "fee_invoices_merchant_id_status_idx" ON "fee_invoices"("merchant_id", "status");
CREATE INDEX IF NOT EXISTS "fee_invoices_merchant_id_class_level_id_idx" ON "fee_invoices"("merchant_id", "class_level_id");
CREATE INDEX IF NOT EXISTS "fee_invoices_student_id_idx" ON "fee_invoices"("student_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_invoices_invoice_number_key" ON "fee_invoices"("invoice_number");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_invoices_payment_reference_key" ON "fee_invoices"("payment_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_invoices_student_id_academic_term_id_key" ON "fee_invoices"("student_id", "academic_term_id");
CREATE INDEX IF NOT EXISTS "fee_invoice_lines_invoice_id_idx" ON "fee_invoice_lines"("invoice_id");
CREATE INDEX IF NOT EXISTS "fee_invoice_adjustments_invoice_id_idx" ON "fee_invoice_adjustments"("invoice_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_payments_gateway_txn_ref_key" ON "fee_payments"("gateway_txn_ref");
CREATE INDEX IF NOT EXISTS "fee_payments_invoice_id_idx" ON "fee_payments"("invoice_id");
CREATE INDEX IF NOT EXISTS "fee_payments_merchant_id_paid_at_idx" ON "fee_payments"("merchant_id", "paid_at");
CREATE INDEX IF NOT EXISTS "fee_payments_payment_reference_idx" ON "fee_payments"("payment_reference");
CREATE INDEX IF NOT EXISTS "student_account_credits_student_id_idx" ON "student_account_credits"("student_id");
CREATE INDEX IF NOT EXISTS "student_account_credits_merchant_id_idx" ON "student_account_credits"("merchant_id");
CREATE INDEX IF NOT EXISTS "students_merchant_id_status_idx" ON "students"("merchant_id", "status");

DO $$ BEGIN
  ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_term_id_fkey" FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoice_sequences" ADD CONSTRAINT "fee_invoice_sequences_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_academic_term_id_fkey" FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoice_lines" ADD CONSTRAINT "fee_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoice_lines" ADD CONSTRAINT "fee_invoice_lines_fee_structure_item_id_fkey" FOREIGN KEY ("fee_structure_item_id") REFERENCES "fee_structure_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoice_adjustments" ADD CONSTRAINT "fee_invoice_adjustments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_invoice_adjustments" ADD CONSTRAINT "fee_invoice_adjustments_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "fee_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_account_credits" ADD CONSTRAINT "student_account_credits_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "student_account_credits" ADD CONSTRAINT "student_account_credits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
