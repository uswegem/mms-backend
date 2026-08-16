-- M4(d)+4(e) additive: exception cases, match groups, three-way fields, maker-checker entity

DO $$ BEGIN ALTER TYPE "approval_entity_type" ADD VALUE IF NOT EXISTS 'RECON_EXCEPTION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'DATE_VARIANCE_REVIEW'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'REFERENCE_INVALID'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'MISSING_CBS_LEG'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'MISSING_TIPS_LEG'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'MMS_MISSING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'CROSS_LEG_AMOUNT_CONFLICT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'BULK_SUM_MISMATCH'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'ORPHAN_CBS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_classification" ADD VALUE IF NOT EXISTS 'ORPHAN_TIPS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "reconciliation_match_rule" ADD VALUE IF NOT EXISTS 'TIPS_TO_MMS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_match_rule" ADD VALUE IF NOT EXISTS 'CBS_TO_TIPS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_match_rule" ADD VALUE IF NOT EXISTS 'CBS_TO_MMS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_match_rule" ADD VALUE IF NOT EXISTS 'MANUAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "reconciliation_match_rule" ADD VALUE IF NOT EXISTS 'BULK_CBS_SUM'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "match_group_status" AS ENUM (
  'FULLY_MATCHED', 'MMS_TIPS_ONLY', 'MMS_CBS_ONLY', 'TIPS_CBS_ONLY',
  'MMS_ONLY', 'TIPS_ONLY', 'CBS_ONLY', 'CONFLICT'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "match_group_leg_type" AS ENUM ('MMS', 'TIPS', 'CBS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "exception_case_status" AS ENUM (
  'OPEN', 'UNDER_INVESTIGATION', 'PENDING_APPROVAL', 'RESOLVED', 'ESCALATED', 'CLOSED', 'AUTO_CLOSED'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "exception_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "exception_resolution_action" AS ENUM (
  'MANUAL_MATCH', 'FORCE_CREATE_PAYMENT', 'BANK_SIDE_ERROR', 'REVERSE_PAYMENT', 'WRITE_OFF', 'ESCALATE', 'APPROVE', 'REJECT'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE external_settlement_records ADD COLUMN IF NOT EXISTS tips_txn_id VARCHAR(100);
ALTER TABLE external_settlement_records ADD COLUMN IF NOT EXISTS narration VARCHAR(255);
ALTER TABLE external_settlement_records ADD COLUMN IF NOT EXISTS credit_account VARCHAR(50);
ALTER TABLE external_settlement_records ADD COLUMN IF NOT EXISTS exclude_from_matching BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS external_settlement_records_tips_txn_idx ON external_settlement_records(tips_txn_id);

ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'TWO_WAY';
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS soft_date_variance_days INT NOT NULL DEFAULT 1;
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS hard_date_variance_days INT NOT NULL DEFAULT 3;

ALTER TABLE reconciliation_matches ADD COLUMN IF NOT EXISTS match_group_id UUID;
ALTER TABLE reconciliation_matches ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE school_daily_collection_snapshots ADD COLUMN IF NOT EXISTS tips_matched_count INT;
ALTER TABLE school_daily_collection_snapshots ADD COLUMN IF NOT EXISTS cbs_matched_count INT;
ALTER TABLE school_daily_collection_snapshots ADD COLUMN IF NOT EXISTS fully_matched_count INT;
ALTER TABLE school_daily_collection_snapshots ADD COLUMN IF NOT EXISTS exception_open_count INT;
ALTER TABLE school_daily_collection_snapshots ADD COLUMN IF NOT EXISTS three_way_summary JSONB;

CREATE TABLE IF NOT EXISTS reconciliation_match_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  status match_group_status NOT NULL,
  fingerprint VARCHAR(128),
  summary JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_match_groups_run_status_idx ON reconciliation_match_groups(run_id, status);
CREATE INDEX IF NOT EXISTS reconciliation_match_groups_merchant_idx ON reconciliation_match_groups(merchant_id, run_id);

CREATE TABLE IF NOT EXISTS reconciliation_match_group_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES reconciliation_match_groups(id) ON DELETE CASCADE,
  leg_type match_group_leg_type NOT NULL,
  fee_payment_id UUID REFERENCES fee_payments(id) ON DELETE SET NULL,
  external_settlement_record_id UUID REFERENCES external_settlement_records(id) ON DELETE SET NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'TZS',
  value_date TIMESTAMPTZ(6),
  payment_reference VARCHAR(40),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_match_group_legs_group_idx ON reconciliation_match_group_legs(group_id, leg_type);
CREATE INDEX IF NOT EXISTS reconciliation_match_group_legs_payment_idx ON reconciliation_match_group_legs(fee_payment_id);
CREATE INDEX IF NOT EXISTS reconciliation_match_group_legs_external_idx ON reconciliation_match_group_legs(external_settlement_record_id);

DO $$ BEGIN
  ALTER TABLE reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_match_group_id_fkey
    FOREIGN KEY (match_group_id) REFERENCES reconciliation_match_groups(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS reconciliation_matches_match_group_idx ON reconciliation_matches(match_group_id);

CREATE TABLE IF NOT EXISTS reconciliation_exception_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number VARCHAR(40) NOT NULL UNIQUE,
  run_id UUID REFERENCES reconciliation_runs(id) ON DELETE SET NULL,
  match_group_id UUID REFERENCES reconciliation_match_groups(id) ON DELETE SET NULL,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  classification reconciliation_classification NOT NULL,
  status exception_case_status NOT NULL DEFAULT 'OPEN',
  severity exception_severity NOT NULL DEFAULT 'MEDIUM',
  fingerprint VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  context JSONB,
  assignee_id UUID,
  approval_task_id UUID,
  pending_action exception_resolution_action,
  pending_payload JSONB,
  resolution_notes TEXT,
  sla_due_at TIMESTAMPTZ(6),
  resolved_at TIMESTAMPTZ(6),
  closed_at TIMESTAMPTZ(6),
  created_by UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_exception_cases_status_idx ON reconciliation_exception_cases(status, severity);
CREATE INDEX IF NOT EXISTS reconciliation_exception_cases_fingerprint_idx ON reconciliation_exception_cases(fingerprint);
CREATE INDEX IF NOT EXISTS reconciliation_exception_cases_merchant_idx ON reconciliation_exception_cases(merchant_id, status);
CREATE INDEX IF NOT EXISTS reconciliation_exception_cases_run_idx ON reconciliation_exception_cases(run_id);

CREATE TABLE IF NOT EXISTS reconciliation_exception_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES reconciliation_exception_cases(id) ON DELETE CASCADE,
  from_status exception_case_status,
  to_status exception_case_status,
  action exception_resolution_action,
  note TEXT,
  actor_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_exception_events_case_idx ON reconciliation_exception_events(case_id, created_at);

CREATE TABLE IF NOT EXISTS reconciliation_write_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES reconciliation_exception_cases(id) ON DELETE RESTRICT,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'TZS',
  reason VARCHAR(500) NOT NULL,
  approved_by UUID,
  created_by UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_write_offs_case_idx ON reconciliation_write_offs(case_id);
CREATE INDEX IF NOT EXISTS reconciliation_write_offs_merchant_idx ON reconciliation_write_offs(merchant_id, created_at);

CREATE TABLE IF NOT EXISTS reconciliation_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id UUID NOT NULL UNIQUE,
  soft_date_variance_days INT NOT NULL DEFAULT 1,
  hard_date_variance_days INT NOT NULL DEFAULT 3,
  maker_checker_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  exception_sla_hours INT NOT NULL DEFAULT 48,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
