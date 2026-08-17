-- NIDA verification (onboarding Step 2, brief §4.3) and TRA TIN
-- verification (Step 3). Append-only attempt logs, not mutable status
-- fields — an applicant can correct a typo'd ID/TIN and re-verify.

CREATE TYPE "verification_result" AS ENUM ('MATCH', 'MISMATCH', 'NOT_FOUND', 'PROVIDER_ERROR');

CREATE TABLE "nida_verification_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "beneficial_owner_id" UUID NOT NULL,
  "result" "verification_result" NOT NULL,
  "verified_name" VARCHAR(255),
  "failure_reason" TEXT,
  "raw_response" JSONB,
  "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "verified_by" UUID,

  CONSTRAINT "nida_verification_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nida_verification_results_application_id_idx" ON "nida_verification_results"("application_id");
CREATE INDEX "nida_verification_results_beneficial_owner_id_idx" ON "nida_verification_results"("beneficial_owner_id");

ALTER TABLE "nida_verification_results"
  ADD CONSTRAINT "nida_verification_results_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nida_verification_results"
  ADD CONSTRAINT "nida_verification_results_beneficial_owner_id_fkey"
  FOREIGN KEY ("beneficial_owner_id") REFERENCES "beneficial_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tra_verification_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "tin" VARCHAR(50) NOT NULL,
  "result" "verification_result" NOT NULL,
  "verified_name" VARCHAR(255),
  "failure_reason" TEXT,
  "raw_response" JSONB,
  "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "verified_by" UUID,

  CONSTRAINT "tra_verification_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tra_verification_results_application_id_idx" ON "tra_verification_results"("application_id");

ALTER TABLE "tra_verification_results"
  ADD CONSTRAINT "tra_verification_results_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
