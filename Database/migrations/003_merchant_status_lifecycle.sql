-- MMS Migration 003: Merchant status lifecycle management
BEGIN;

-- Extend merchant_status enum with review/approval/rejected states
DO $$ BEGIN
  ALTER TYPE merchant_status RENAME VALUE 'PENDING' TO 'PENDING_REVIEW';
EXCEPTION WHEN OTHERS THEN
  BEGIN
    ALTER TYPE merchant_status ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  ALTER TYPE merchant_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE merchant_status ADD VALUE IF NOT EXISTS 'REJECTED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE merchant_status_action AS ENUM (
    'SUBMIT_FOR_REVIEW',
    'MOVE_TO_PENDING_APPROVAL',
    'APPROVE',
    'REJECT',
    'SUSPEND',
    'REACTIVATE',
    'MARK_DORMANT',
    'CLOSE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS status_transitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_status         merchant_status NOT NULL,
  to_status           merchant_status NOT NULL,
  action              merchant_status_action NOT NULL,
  required_permission VARCHAR(100) NOT NULL,
  description         VARCHAR(255),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_status_transition UNIQUE (from_status, to_status, action)
);

CREATE TABLE IF NOT EXISTS merchant_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  from_status   merchant_status NOT NULL,
  to_status     merchant_status NOT NULL,
  action        merchant_status_action NOT NULL,
  actor_id      UUID NOT NULL,
  reason        VARCHAR(100),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_status_history_merchant
  ON merchant_status_history(merchant_id, created_at DESC);

-- Migrate legacy PENDING rows if enum rename failed
UPDATE merchants SET status = 'PENDING_REVIEW' WHERE status::text = 'PENDING';

-- Seed allowed transitions (idempotent)
INSERT INTO status_transitions (from_status, to_status, action, required_permission, description) VALUES
  ('DRAFT', 'PENDING_REVIEW', 'SUBMIT_FOR_REVIEW', 'merchant:status:submit', 'Submit merchant for compliance review'),
  ('PENDING_REVIEW', 'PENDING_APPROVAL', 'MOVE_TO_PENDING_APPROVAL', 'merchant:status:approve', 'Maker moves to pending checker approval'),
  ('PENDING_APPROVAL', 'ACTIVE', 'APPROVE', 'merchant:status:checker:approve', 'Checker approves merchant'),
  ('PENDING_REVIEW', 'REJECTED', 'REJECT', 'merchant:status:reject', 'Reject during review'),
  ('PENDING_APPROVAL', 'REJECTED', 'REJECT', 'merchant:status:reject', 'Reject during approval'),
  ('REJECTED', 'PENDING_REVIEW', 'SUBMIT_FOR_REVIEW', 'merchant:status:submit', 'Resubmit after rejection'),
  ('ACTIVE', 'SUSPENDED', 'SUSPEND', 'merchant:suspend', 'Suspend active merchant'),
  ('ACTIVE', 'DORMANT', 'MARK_DORMANT', 'merchant:suspend', 'Mark active merchant dormant'),
  ('SUSPENDED', 'ACTIVE', 'REACTIVATE', 'merchant:suspend', 'Reactivate suspended merchant'),
  ('DORMANT', 'ACTIVE', 'REACTIVATE', 'merchant:suspend', 'Reactivate dormant merchant'),
  ('ACTIVE', 'CLOSED', 'CLOSE', 'merchant:close', 'Permanently close merchant'),
  ('SUSPENDED', 'CLOSED', 'CLOSE', 'merchant:close', 'Close suspended merchant'),
  ('DORMANT', 'CLOSED', 'CLOSE', 'merchant:close', 'Close dormant merchant')
ON CONFLICT (from_status, to_status, action) DO NOTHING;

COMMIT;
