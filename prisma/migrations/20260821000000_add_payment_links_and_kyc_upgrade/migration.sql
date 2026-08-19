-- Payment links & storefront (handoff §links, §4.5 Online) and the KYC
-- tier-upgrade workflow (handoff §kycup, §5.2 Online). The upgrade
-- decision is a real ApprovalTask (entityType KYC_TIER_UPGRADE) going
-- through the same maker-checker pipeline as onboarding, merchant-status-
-- change, and dispute refunds.

ALTER TYPE "approval_entity_type" ADD VALUE 'KYC_TIER_UPGRADE';

CREATE TYPE "payment_link_status" AS ENUM ('ACTIVE', 'PAID', 'CANCELLED');

CREATE TABLE "payment_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "acquirer_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "item_name" VARCHAR(255) NOT NULL,
  "order_ref" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'TZS',
  "slug" VARCHAR(20) NOT NULL,
  "status" "payment_link_status" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "payment_id" UUID,
  "paid_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by" UUID NOT NULL,

  CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_links_slug_key" ON "payment_links"("slug");
CREATE UNIQUE INDEX "payment_links_payment_id_key" ON "payment_links"("payment_id");
CREATE INDEX "payment_links_merchant_id_status_idx" ON "payment_links"("merchant_id", "status");

ALTER TABLE "payment_links"
  ADD CONSTRAINT "payment_links_acquirer_id_fkey"
  FOREIGN KEY ("acquirer_id") REFERENCES "acquirers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_links"
  ADD CONSTRAINT "payment_links_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_links"
  ADD CONSTRAINT "payment_links_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "kyc_upgrade_status" AS ENUM ('IN_PROGRESS', 'PENDING_CHECKER_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TABLE "kyc_upgrade_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "acquirer_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "from_tier" "kyc_tier" NOT NULL,
  "to_tier" "kyc_tier" NOT NULL,
  "status" "kyc_upgrade_status" NOT NULL DEFAULT 'IN_PROGRESS',
  "tin" VARCHAR(50),
  "tin_verification_result" "verification_result",
  "tin_verified_name" VARCHAR(255),
  "tin_verified_at" TIMESTAMPTZ(6),
  "rejection_notes" TEXT,
  "decided_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by" UUID NOT NULL,

  CONSTRAINT "kyc_upgrade_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kyc_upgrade_requests_merchant_id_status_idx" ON "kyc_upgrade_requests"("merchant_id", "status");

ALTER TABLE "kyc_upgrade_requests"
  ADD CONSTRAINT "kyc_upgrade_requests_acquirer_id_fkey"
  FOREIGN KEY ("acquirer_id") REFERENCES "acquirers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kyc_upgrade_requests"
  ADD CONSTRAINT "kyc_upgrade_requests_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "kyc_upgrade_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "doc_type" VARCHAR(50) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "s3_bucket" VARCHAR(100) NOT NULL,
  "s3_key" TEXT NOT NULL,
  "mime_type" VARCHAR(100),
  "file_size" INTEGER,
  "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "uploaded_by" UUID NOT NULL,

  CONSTRAINT "kyc_upgrade_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kyc_upgrade_documents_request_id_idx" ON "kyc_upgrade_documents"("request_id");

ALTER TABLE "kyc_upgrade_documents"
  ADD CONSTRAINT "kyc_upgrade_documents_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "kyc_upgrade_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
