-- KYC tiers and per-tier transaction-limit policy (brief §4.3.3).

-- New enum value: a payment TIPS has already confirmed/settled, but whose
-- receiving merchant breached their kycTier's transaction-limit policy.
-- Not used elsewhere in this migration, so safe inside this transaction.
ALTER TYPE "payment_status" ADD VALUE 'LIMIT_EXCEEDED';

CREATE TYPE "kyc_tier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- Backfill first: every existing merchant gets a tier from the one signal
-- already available (isSchool) before the column becomes NOT NULL. This is
-- the same rule every merchant-creation write path applies going forward.
ALTER TABLE "merchants" ADD COLUMN "kyc_tier" "kyc_tier" NOT NULL DEFAULT 'TIER_2';
UPDATE "merchants" SET "kyc_tier" = 'TIER_3' WHERE "is_school" = true;

CREATE TABLE "transaction_limit_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tier" "kyc_tier" NOT NULL,
  "per_transaction_limit" DECIMAL(18,2) NOT NULL,
  "daily_limit" DECIMAL(18,2) NOT NULL,
  "monthly_limit" DECIMAL(18,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'TZS',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_by" UUID,

  CONSTRAINT "transaction_limit_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transaction_limit_policies_tier_key" ON "transaction_limit_policies"("tier");
