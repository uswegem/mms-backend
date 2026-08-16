-- M4(c) additive: payment lifecycle, snapshots, settlement staging, reconciliation

-- Enum: rename SUCCESS -> COMPLETED if present
DO $$ BEGIN
  ALTER TYPE fee_payment_record_status RENAME VALUE 'SUCCESS' TO 'COMPLETED';
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN ALTER TYPE fee_payment_record_status ADD VALUE IF NOT EXISTS 'INITIATED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE fee_payment_record_status ADD VALUE IF NOT EXISTS 'REVERSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE fee_payment_record_status ADD VALUE IF NOT EXISTS 'DISPUTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE fee_payment_channel ADD VALUE IF NOT EXISTS 'BANK_BRANCH'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE fee_payment_channel ADD VALUE IF NOT EXISTS 'MOBILE_MONEY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "external_settlement_source" AS ENUM ('TIPS', 'CBS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "reconciliation_run_status" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "reconciliation_classification" AS ENUM ('MATCHED', 'MATCHED_WITH_VARIANCE', 'AMOUNT_MISMATCH', 'DUPLICATE_EXTERNAL', 'UNMATCHED_EXTERNAL', 'UNMATCHED_INTERNAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "reconciliation_match_rule" AS ENUM ('EXACT_TXN_ID', 'REF_AMOUNT_DATE_WINDOW', 'REF_AMOUNT_DATE_VARIANCE', 'REF_AMOUNT_MISMATCH', 'NONE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS channel_detail VARCHAR(100);
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS gateway_paid_at TIMESTAMPTZ(6);
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS mms_received_at TIMESTAMPTZ(6);
UPDATE fee_payments SET mms_received_at = COALESCE(mms_received_at, created_at) WHERE mms_received_at IS NULL;
UPDATE fee_payments SET gateway_paid_at = COALESCE(gateway_paid_at, paid_at, created_at) WHERE gateway_paid_at IS NULL AND status::text IN ('COMPLETED', 'SUCCESS');
ALTER TABLE fee_payments ALTER COLUMN mms_received_at SET DEFAULT NOW();
ALTER TABLE fee_payments ALTER COLUMN mms_received_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS fee_payment_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_payment_id UUID NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  from_status fee_payment_record_status,
  to_status fee_payment_record_status NOT NULL,
  reason VARCHAR(500),
  actor_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fee_payment_lifecycle_events_payment_idx ON fee_payment_lifecycle_events(fee_payment_id, created_at);

CREATE TABLE IF NOT EXISTS fee_payment_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_payment_id UUID NOT NULL REFERENCES fee_payments(id) ON DELETE RESTRICT,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount DECIMAL(18,2) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  actor_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fee_payment_reversals_payment_idx ON fee_payment_reversals(fee_payment_id);
CREATE INDEX IF NOT EXISTS fee_payment_reversals_merchant_idx ON fee_payment_reversals(merchant_id, created_at);

CREATE TABLE IF NOT EXISTS school_daily_collection_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_collected DECIMAL(18,2) NOT NULL,
  payment_count INT NOT NULL,
  total_outstanding DECIMAL(18,2) NOT NULL,
  by_channel JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS school_daily_snapshots_date_idx ON school_daily_collection_snapshots(snapshot_date);

CREATE TABLE IF NOT EXISTS settlement_ingest_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source external_settlement_source NOT NULL,
  file_name VARCHAR(255),
  file_hash VARCHAR(64),
  accepted INT NOT NULL DEFAULT 0,
  rejected INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  report JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS settlement_ingest_batches_file_hash_key ON settlement_ingest_batches(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS settlement_ingest_batches_created_idx ON settlement_ingest_batches(created_at);

CREATE TABLE IF NOT EXISTS external_settlement_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_batch_id UUID REFERENCES settlement_ingest_batches(id) ON DELETE SET NULL,
  source external_settlement_source NOT NULL,
  external_txn_id VARCHAR(100) NOT NULL,
  payment_reference VARCHAR(40),
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'TZS',
  value_date TIMESTAMPTZ(6) NOT NULL,
  payer_msisdn VARCHAR(30),
  payer_name VARCHAR(100),
  external_status VARCHAR(40),
  raw_payload JSONB NOT NULL,
  classification reconciliation_classification,
  classification_meta JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_txn_id)
);
CREATE INDEX IF NOT EXISTS external_settlement_ref_date_idx ON external_settlement_records(payment_reference, value_date);
CREATE INDEX IF NOT EXISTS external_settlement_value_date_idx ON external_settlement_records(value_date);
CREATE INDEX IF NOT EXISTS external_settlement_class_idx ON external_settlement_records(classification);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source external_settlement_source,
  date_from TIMESTAMPTZ(6) NOT NULL,
  date_to TIMESTAMPTZ(6) NOT NULL,
  status reconciliation_run_status NOT NULL DEFAULT 'RUNNING',
  date_window_days INT NOT NULL DEFAULT 1,
  summary JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ(6),
  created_by UUID
);
CREATE INDEX IF NOT EXISTS reconciliation_runs_started_idx ON reconciliation_runs(started_at);

CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  external_settlement_record_id UUID UNIQUE REFERENCES external_settlement_records(id) ON DELETE SET NULL,
  fee_payment_id UUID UNIQUE REFERENCES fee_payments(id) ON DELETE SET NULL,
  rule reconciliation_match_rule NOT NULL,
  classification reconciliation_classification NOT NULL,
  flags JSONB,
  amount_delta DECIMAL(18,2),
  date_delta_hours INT,
  context JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_matches_run_class_idx ON reconciliation_matches(run_id, classification);
CREATE INDEX IF NOT EXISTS reconciliation_matches_merchant_run_idx ON reconciliation_matches(merchant_id, run_id);

CREATE INDEX IF NOT EXISTS fee_payments_merchant_status_paid_idx ON fee_payments(merchant_id, status, paid_at);
CREATE INDEX IF NOT EXISTS fee_payments_merchant_channel_paid_idx ON fee_payments(merchant_id, channel, paid_at);
