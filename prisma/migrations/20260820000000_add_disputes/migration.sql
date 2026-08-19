-- Disputes & refunds (handoff §disputes/§disputedet). A dispute is always
-- tied to a real Payment; the refund decision is a real ApprovalTask
-- (entityType DISPUTE_REFUND) going through the same maker-checker
-- pipeline as onboarding and merchant-status-change.

ALTER TYPE "approval_entity_type" ADD VALUE 'DISPUTE_REFUND';

CREATE TYPE "dispute_reason" AS ENUM ('DUPLICATE_PAYMENT', 'GOODS_NOT_RECEIVED', 'INCORRECT_AMOUNT', 'UNRECOGNIZED_TRANSACTION', 'OTHER');
CREATE TYPE "dispute_raised_by" AS ENUM ('MERCHANT', 'PAYER', 'LFB_OPS');
CREATE TYPE "dispute_stage" AS ENUM ('INVESTIGATION', 'EVIDENCE_REQUESTED', 'REFUND_PENDING_CHECKER', 'RESOLVED_REFUNDED', 'RESOLVED_NO_REFUND', 'REJECTED');

CREATE TABLE "disputes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "acquirer_id" UUID NOT NULL,
  "case_no" VARCHAR(20) NOT NULL,
  "merchant_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "raised_by" "dispute_raised_by" NOT NULL,
  "reason" "dispute_reason" NOT NULL,
  "description" TEXT NOT NULL,
  "disputed_amount" DECIMAL(14,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'TZS',
  "stage" "dispute_stage" NOT NULL DEFAULT 'INVESTIGATION',
  "sla_hours" INTEGER NOT NULL DEFAULT 72,
  "resolution_notes" TEXT,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by" UUID NOT NULL,

  CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "disputes_case_no_key" ON "disputes"("case_no");
CREATE INDEX "disputes_merchant_id_stage_idx" ON "disputes"("merchant_id", "stage");
CREATE INDEX "disputes_acquirer_id_stage_idx" ON "disputes"("acquirer_id", "stage");

ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_acquirer_id_fkey"
  FOREIGN KEY ("acquirer_id") REFERENCES "acquirers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "dispute_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dispute_id" UUID NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "s3_bucket" VARCHAR(100) NOT NULL,
  "s3_key" TEXT NOT NULL,
  "mime_type" VARCHAR(100),
  "file_size" INTEGER,
  "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "uploaded_by" UUID NOT NULL,

  CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispute_evidence_dispute_id_idx" ON "dispute_evidence"("dispute_id");

ALTER TABLE "dispute_evidence"
  ADD CONSTRAINT "dispute_evidence_dispute_id_fkey"
  FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
