-- Fee schedule / MDR configuration module (handoff §cfgfees, §ob7).
-- Replaces the single settlement_config.mdr override + hardcoded global
-- default with real, versioned, per-scope schedules (DEFAULT/MCC/MERCHANT),
-- plus an applicant acceptance record captured at onboarding Step 7.

CREATE TYPE "fee_schedule_scope" AS ENUM ('DEFAULT', 'MCC', 'MERCHANT');
CREATE TYPE "fee_schedule_status" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');
CREATE TYPE "fee_charge_type" AS ENUM ('MDR', 'SETTLEMENT_TRANSFER', 'QR_POSTER_REPRINT', 'DISPUTE_INVESTIGATION');
CREATE TYPE "fee_charge_basis" AS ENUM ('PERCENT_OF_TRANSACTION', 'FLAT_PER_SWEEP', 'FLAT_PER_ASSET', 'FLAT_PER_CASE');

CREATE TABLE "fee_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version" INTEGER NOT NULL,
  "scope" "fee_schedule_scope" NOT NULL,
  "scope_key" VARCHAR(50),
  "status" "fee_schedule_status" NOT NULL DEFAULT 'DRAFT',
  "effective_from" TIMESTAMPTZ(6),
  "superseded_at" TIMESTAMPTZ(6),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ(6),

  CONSTRAINT "fee_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_schedules_scope_scope_key_version_key" ON "fee_schedules"("scope", "scope_key", "version");
CREATE INDEX "fee_schedules_scope_scope_key_status_idx" ON "fee_schedules"("scope", "scope_key", "status");

CREATE TABLE "fee_schedule_charges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id" UUID NOT NULL,
  "charge_type" "fee_charge_type" NOT NULL,
  "basis" "fee_charge_basis" NOT NULL,
  "rate" DECIMAL(6,4),
  "flat_amount" DECIMAL(12,2),
  "cap_amount" DECIMAL(12,2),

  CONSTRAINT "fee_schedule_charges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fee_schedule_charges_schedule_id_idx" ON "fee_schedule_charges"("schedule_id");

ALTER TABLE "fee_schedule_charges"
  ADD CONSTRAINT "fee_schedule_charges_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "fee_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fee_schedule_acceptances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "accepted_by" UUID,
  "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "fee_schedule_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_schedule_acceptances_application_id_schedule_id_key" ON "fee_schedule_acceptances"("application_id", "schedule_id");
CREATE INDEX "fee_schedule_acceptances_merchant_id_idx" ON "fee_schedule_acceptances"("merchant_id");

ALTER TABLE "fee_schedule_acceptances"
  ADD CONSTRAINT "fee_schedule_acceptances_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_schedule_acceptances"
  ADD CONSTRAINT "fee_schedule_acceptances_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "fee_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
