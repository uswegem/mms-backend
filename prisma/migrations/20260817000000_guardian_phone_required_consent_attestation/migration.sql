-- Guardian phone becomes mandatory (brief §4.3.4), and a per-batch
-- consent-attestation record for bulk student roster uploads (brief §4.3.2).

-- Backfill first so this doesn't fail against any dev/UAT row that predates
-- the field being required. This sentinel is a deploy-safety net, not real
-- data — any row landing on it needs its real guardian phone collected;
-- it is intentionally obviously-fake (all zeros) so it's easy to find.
UPDATE "students"
  SET "guardian_phone" = '000000000000'
  WHERE "guardian_phone" IS NULL;

ALTER TABLE "students"
  ALTER COLUMN "guardian_phone" SET NOT NULL;

CREATE TABLE "student_roster_uploads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "row_count" INTEGER NOT NULL,
  "parental_consent_attested" BOOLEAN NOT NULL DEFAULT false,
  "consent_statement_text" TEXT NOT NULL,
  "attested_by" UUID NOT NULL,
  "attested_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "student_roster_uploads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_roster_uploads_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
);

CREATE UNIQUE INDEX "student_roster_uploads_batch_id_key" ON "student_roster_uploads"("batch_id");
CREATE INDEX "student_roster_uploads_merchant_id_idx" ON "student_roster_uploads"("merchant_id");
