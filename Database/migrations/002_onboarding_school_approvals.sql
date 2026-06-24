-- MMS Migration 002: Onboarding, maker-checker, school contacts alignment
-- Run after 001_initial_schema.sql (or via Prisma db push)

BEGIN;

-- Extend merchant_status with DORMANT (Prisma/backend)
DO $$ BEGIN
  ALTER TYPE merchant_status ADD VALUE IF NOT EXISTS 'DORMANT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Legal entity type for sole proprietor vs company
DO $$ BEGIN
  CREATE TYPE legal_entity_type AS ENUM ('SOLE_PROPRIETOR', 'COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- KYC status (Prisma merchant_kyc)
DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Merchant KYC tables (Prisma runtime — may exist from db push)
CREATE TABLE IF NOT EXISTS merchant_kyc (
  merchant_id   UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  status        kyc_status NOT NULL DEFAULT 'PENDING',
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_kyc_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  reviewer_id   UUID NOT NULL,
  decision      VARCHAR(20) NOT NULL,
  notes         TEXT,
  reviewed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onboarding application extensions
ALTER TABLE onboarding_applications
  ADD COLUMN IF NOT EXISTS legal_entity_type legal_entity_type NOT NULL DEFAULT 'SOLE_PROPRIETOR',
  ADD COLUMN IF NOT EXISTS company_registration_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS maker_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS checker_id UUID REFERENCES users(id);

-- School contact fields
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS contact_email CITEXT,
  ADD COLUMN IF NOT EXISTS bursar_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bursar_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address VARCHAR(500);

-- Extend approval entity type for school onboarding
DO $$ BEGIN
  ALTER TYPE approval_entity_type ADD VALUE IF NOT EXISTS 'SCHOOL_ONBOARDING';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed rejection reasons (idempotent)
INSERT INTO onboarding_rejection_reasons (code, description) VALUES
  ('INCOMPLETE_KYC', 'Mandatory KYC documents missing or invalid'),
  ('AML_FAIL', 'AML screening failed'),
  ('ACCOUNT_MISMATCH', 'Settlement account verification failed'),
  ('INVALID_PROFILE', 'Merchant profile data incomplete or invalid'),
  ('POLICY_VIOLATION', 'Application does not meet acquirer policy'),
  ('OTHER', 'Other — see notes')
ON CONFLICT (code) DO NOTHING;

-- Default maker-checker policies per acquirer
INSERT INTO approval_policies (acquirer_id, entity_type, enabled, sla_hours)
SELECT a.id, 'MERCHANT_ONBOARDING'::approval_entity_type, true, 24
FROM acquirers a
WHERE NOT EXISTS (
  SELECT 1 FROM approval_policies p
  WHERE p.acquirer_id = a.id AND p.entity_type = 'MERCHANT_ONBOARDING'
);

INSERT INTO approval_policies (acquirer_id, entity_type, enabled, sla_hours)
SELECT a.id, 'SCHOOL_ONBOARDING'::approval_entity_type, true, 48
FROM acquirers a
WHERE NOT EXISTS (
  SELECT 1 FROM approval_policies p
  WHERE p.acquirer_id = a.id AND p.entity_type = 'SCHOOL_ONBOARDING'
);

COMMIT;
