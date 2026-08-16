-- Settlement cycles + reconciliation exception queue (§4.6 backend).

CREATE TYPE "settlement_cycle_status" AS ENUM ('PENDING', 'SWEPT', 'POSTED', 'FAILED');
CREATE TYPE "reconciliation_exception_type" AS ENUM ('UNMATCHED_IN_REPORT', 'UNMATCHED_IN_LEDGER', 'DUPLICATE_REFERENCE');
CREATE TYPE "reconciliation_exception_status" AS ENUM ('OPEN', 'RESOLVED', 'WRITTEN_OFF');

CREATE TABLE "settlement_cycles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID NOT NULL,
  "cycle_date" DATE NOT NULL,
  "status" "settlement_cycle_status" NOT NULL DEFAULT 'PENDING',
  "transaction_count" INTEGER NOT NULL DEFAULT 0,
  "gross_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "mdr_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "settlement_account_id" UUID,
  "cbs_posting_ref" VARCHAR(100),
  "swept_at" TIMESTAMPTZ(6),
  "posted_at" TIMESTAMPTZ(6),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "settlement_cycles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_cycles_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
);

CREATE UNIQUE INDEX "settlement_cycles_merchant_id_cycle_date_key" ON "settlement_cycles"("merchant_id", "cycle_date");
CREATE INDEX "settlement_cycles_merchant_id_status_idx" ON "settlement_cycles"("merchant_id", "status");

CREATE TABLE "reconciliation_exceptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID NOT NULL,
  "cycle_date" DATE NOT NULL,
  "type" "reconciliation_exception_type" NOT NULL,
  "tips_end_to_end_id" VARCHAR(100),
  "amount" DECIMAL(18,2),
  "status" "reconciliation_exception_status" NOT NULL DEFAULT 'OPEN',
  "resolution_notes" TEXT,
  "resolved_by" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "reconciliation_exceptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reconciliation_exceptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
);

CREATE INDEX "reconciliation_exceptions_merchant_id_status_idx" ON "reconciliation_exceptions"("merchant_id", "status");
CREATE INDEX "reconciliation_exceptions_cycle_date_idx" ON "reconciliation_exceptions"("cycle_date");

ALTER TABLE "payments"
  ADD COLUMN "payer_fsp" VARCHAR(50),
  ADD COLUMN "settlement_cycle_id" UUID,
  ADD CONSTRAINT "payments_settlement_cycle_id_fkey" FOREIGN KEY ("settlement_cycle_id") REFERENCES "settlement_cycles"("id");

CREATE INDEX "payments_merchant_id_status_idx" ON "payments"("merchant_id", "status");
CREATE INDEX "payments_merchant_id_received_at_idx" ON "payments"("merchant_id", "received_at");
CREATE INDEX "payments_settlement_cycle_id_idx" ON "payments"("settlement_cycle_id");
