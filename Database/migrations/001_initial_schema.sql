-- =============================================================================
-- Merchant Management System (MMS) — PostgreSQL Initial Schema
-- Version: 1.0 | Date: 2026-06-04
-- Derived from: BRD, Enterprise Architecture, Module Breakdown
-- =============================================================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING_INVITE');
CREATE TYPE merchant_status AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE onboarding_status AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE qr_type AS ENUM ('STATIC', 'DYNAMIC');
CREATE TYPE qr_status AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE payment_status AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'REVERSED', 'DISPUTED', 'REFUND_PENDING');
CREATE TYPE payment_channel AS ENUM ('QR', 'LIPA_NAMBA', 'USSD', 'API', 'OTHER');
CREATE TYPE settlement_batch_status AS ENUM (
  'OPEN', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
  'POSTING', 'POSTED', 'PARTIAL_POSTED', 'FAILED'
);
CREATE TYPE cbs_posting_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRY');
CREATE TYPE recon_run_status AS ENUM ('INITIATED', 'DATA_COLLECTED', 'MATCHING', 'EXCEPTIONS_OPEN', 'IN_REVIEW', 'CLOSED');
CREATE TYPE recon_exception_status AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED');
CREATE TYPE invoice_status AS ENUM ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'OVERPAID', 'CANCELLED');
CREATE TYPE approval_task_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE approval_entity_type AS ENUM (
  'MERCHANT_ONBOARDING', 'SETTLEMENT_BATCH', 'FEE_RULE', 'MERCHANT_LIMIT', 'CONFIG_CHANGE'
);
CREATE TYPE tips_registration_status AS ENUM ('PENDING', 'REGISTERED', 'FAILED');
CREATE TYPE notification_channel AS ENUM ('SMS', 'EMAIL', 'IN_APP', 'PUSH');
CREATE TYPE notification_delivery_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED');
CREATE TYPE report_job_status AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE document_type AS ENUM ('KYC_ID', 'KYC_LICENSE', 'KYC_TIN', 'QR_ASSET', 'RECEIPT', 'OTHER');

-- =============================================================================
-- CORE: Acquirer & Configuration
-- =============================================================================

CREATE TABLE acquirers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(20) NOT NULL,
  legal_name      VARCHAR(255) NOT NULL,
  trading_name    VARCHAR(255),
  tips_participant_code VARCHAR(3),
  tips_acquirer_id_5    CHAR(5),
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID,
  CONSTRAINT uq_acquirers_code UNIQUE (code),
  CONSTRAINT chk_acquirers_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE mcc_reference (
  code        CHAR(4) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  category    VARCHAR(100),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE postcode_reference (
  code        CHAR(5) PRIMARY KEY,
  region      VARCHAR(100),
  city        VARCHAR(100),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id  UUID REFERENCES acquirers(id),
  config_key   VARCHAR(100) NOT NULL,
  config_value TEXT NOT NULL,
  value_type   VARCHAR(20) NOT NULL DEFAULT 'STRING',
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  updated_by   UUID,
  CONSTRAINT uq_system_config_key UNIQUE (acquirer_id, config_key)
);

CREATE TABLE feature_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id  UUID REFERENCES acquirers(id),
  flag_key     VARCHAR(100) NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  updated_by   UUID,
  CONSTRAINT uq_feature_flags_key UNIQUE (acquirer_id, flag_key)
);

CREATE TABLE business_calendar (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id  UUID NOT NULL REFERENCES acquirers(id),
  calendar_date DATE NOT NULL,
  day_type     VARCHAR(20) NOT NULL,
  description  VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  updated_by   UUID,
  CONSTRAINT uq_business_calendar UNIQUE (acquirer_id, calendar_date),
  CONSTRAINT chk_day_type CHECK (day_type IN ('HOLIDAY', 'CUTOFF', 'SPECIAL'))
);

CREATE TABLE fee_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  name          VARCHAR(100) NOT NULL,
  mcc           CHAR(4) REFERENCES mcc_reference(code),
  mdr_percent   NUMERIC(8,4) NOT NULL DEFAULT 0,
  fixed_fee     NUMERIC(18,2) NOT NULL DEFAULT 0,
  tips_fee      NUMERIC(18,2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID
);

CREATE TABLE acquirer_code_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  block_start   INTEGER NOT NULL,
  block_end     INTEGER NOT NULL,
  used_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE qr_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  name          VARCHAR(100) NOT NULL,
  layout_version VARCHAR(20) NOT NULL DEFAULT 'ANNEX2_V1',
  branding_json JSONB NOT NULL DEFAULT '{}',
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID
);

CREATE TABLE onboarding_rejection_reasons (
  code        VARCHAR(30) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

-- =============================================================================
-- IDENTITY: Users, Auth, Authorization
-- =============================================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  merchant_id   UUID,
  email         CITEXT NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  status        user_status NOT NULL DEFAULT 'PENDING_INVITE',
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID,
  CONSTRAINT uq_users_email_acquirer UNIQUE (acquirer_id, email)
);

CREATE TABLE user_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  phone         VARCHAR(20),
  department    VARCHAR(100),
  locale        VARCHAR(10) NOT NULL DEFAULT 'en',
  timezone      VARCHAR(50) NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  email         CITEXT NOT NULL,
  role_id       UUID NOT NULL,
  token_hash    VARCHAR(255) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  invited_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_credentials (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash     VARCHAR(255) NOT NULL,
  mfa_secret_enc    BYTEA,
  mfa_enabled       BOOLEAN NOT NULL DEFAULT false,
  failed_attempts   SMALLINT NOT NULL DEFAULT 0,
  lockout_until     TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(255) NOT NULL,
  family_id     UUID NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  replaced_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_ip    INET
);

CREATE TABLE login_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL,
  success       BOOLEAN NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(255) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  merchant_id     UUID,
  client_id       VARCHAR(64) NOT NULL,
  secret_hash     VARCHAR(255) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID,
  CONSTRAINT uq_api_clients_client_id UNIQUE (client_id)
);

CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(100) NOT NULL,
  module      VARCHAR(50) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_permissions_code UNIQUE (code)
);

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id UUID REFERENCES acquirers(id),
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID,
  updated_by  UUID,
  deleted_at  TIMESTAMPTZ,
  deleted_by  UUID,
  CONSTRAINT uq_roles_code UNIQUE (acquirer_id, code)
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles(id),
  scope_type  VARCHAR(20) NOT NULL DEFAULT 'ACQUIRER',
  scope_id    UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id),
  CONSTRAINT uq_user_roles UNIQUE (user_id, role_id, scope_type, scope_id),
  CONSTRAINT chk_scope_type CHECK (scope_type IN ('ACQUIRER', 'MERCHANT', 'STORE', 'SCHOOL'))
);

-- =============================================================================
-- MERCHANT & ONBOARDING
-- =============================================================================

CREATE TABLE merchants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  legal_name      VARCHAR(255) NOT NULL,
  trading_name    VARCHAR(100) NOT NULL,
  status          merchant_status NOT NULL DEFAULT 'DRAFT',
  mcc             CHAR(4) NOT NULL REFERENCES mcc_reference(code) DEFAULT '0000',
  tax_id          VARCHAR(50),
  is_school       BOOLEAN NOT NULL DEFAULT false,
  onboarded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES users(id)
);

ALTER TABLE users ADD CONSTRAINT fk_users_merchant
  FOREIGN KEY (merchant_id) REFERENCES merchants(id);

CREATE TABLE merchant_profiles (
  merchant_id     UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  address_line1   VARCHAR(255),
  address_line2   VARCHAR(255),
  city            VARCHAR(15) NOT NULL,
  postal_code     CHAR(5) NOT NULL REFERENCES postcode_reference(code),
  country_code    CHAR(2) NOT NULL DEFAULT 'TZ',
  contact_phone   VARCHAR(20),
  contact_email   CITEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id),
  store_label   VARCHAR(25) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  address       VARCHAR(255),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id),
  updated_by    UUID REFERENCES users(id),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id),
  CONSTRAINT uq_stores_label UNIQUE (merchant_id, store_label)
);

CREATE TABLE terminals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id),
  terminal_label  VARCHAR(25) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES users(id),
  CONSTRAINT uq_terminals_label UNIQUE (store_id, terminal_label)
);

CREATE TABLE settlement_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  account_number  VARCHAR(30) NOT NULL,
  account_name    VARCHAR(255) NOT NULL,
  bank_code       VARCHAR(20) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'TZS',
  is_primary      BOOLEAN NOT NULL DEFAULT true,
  verified_at     TIMESTAMPTZ,
  verified_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES users(id)
);

CREATE TABLE merchant_limits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       UUID NOT NULL REFERENCES merchants(id) UNIQUE,
  daily_limit_amount NUMERIC(18,2),
  single_txn_max    NUMERIC(18,2),
  daily_txn_count   INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES users(id)
);

CREATE TABLE merchant_risk_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id),
  score         NUMERIC(5,2) NOT NULL,
  factors_json  JSONB NOT NULL DEFAULT '{}',
  assessed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assessed_by   UUID REFERENCES users(id)
);

CREATE TABLE merchant_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id),
  doc_type      document_type NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  s3_bucket     VARCHAR(100) NOT NULL,
  s3_key        VARCHAR(500) NOT NULL,
  mime_type     VARCHAR(100),
  file_size     BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id)
);

CREATE TABLE onboarding_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  merchant_id     UUID REFERENCES merchants(id),
  application_no  VARCHAR(30) NOT NULL,
  status          onboarding_status NOT NULL DEFAULT 'DRAFT',
  submitted_at    TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  rejection_code  VARCHAR(30) REFERENCES onboarding_rejection_reasons(code),
  rejection_notes TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES users(id),
  CONSTRAINT uq_onboarding_app_no UNIQUE (acquirer_id, application_no)
);

CREATE TABLE onboarding_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES onboarding_applications(id) ON DELETE CASCADE,
  step_code       VARCHAR(50) NOT NULL,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_onboarding_steps UNIQUE (application_id, step_code)
);

CREATE TABLE kyc_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES onboarding_applications(id) ON DELETE CASCADE,
  document_id     UUID REFERENCES merchant_documents(id),
  doc_type        document_type NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kyc_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES onboarding_applications(id),
  reviewer_id     UUID NOT NULL REFERENCES users(id),
  decision        VARCHAR(20) NOT NULL,
  notes           TEXT,
  reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_kyc_decision CHECK (decision IN ('APPROVED', 'REJECTED', 'MORE_INFO'))
);

CREATE TABLE beneficial_owners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES onboarding_applications(id) ON DELETE CASCADE,
  full_name       VARCHAR(255) NOT NULL,
  id_number_enc   BYTEA NOT NULL,
  ownership_pct   NUMERIC(5,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES users(id)
);

CREATE TABLE aml_screening_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES onboarding_applications(id),
  provider_ref    VARCHAR(100),
  result          VARCHAR(20) NOT NULL,
  raw_response    JSONB,
  screened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_aml_result CHECK (result IN ('PASS', 'FAIL', 'REVIEW'))
);

-- =============================================================================
-- TIPS, QR, ALIAS
-- =============================================================================

CREATE TABLE tips_registrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID NOT NULL REFERENCES merchants(id) UNIQUE,
  domain_name         VARCHAR(14) NOT NULL DEFAULT 'tz.go.bot.tips',
  acquirer_id_5       CHAR(5) NOT NULL,
  merchant_id_15      VARCHAR(15) NOT NULL,
  status              tips_registration_status NOT NULL DEFAULT 'PENDING',
  tips_directory_ref  VARCHAR(100),
  registered_at       TIMESTAMPTZ,
  last_sync_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tips_merchant_id_15 UNIQUE (acquirer_id_5, merchant_id_15)
);

CREATE TABLE merchant_aliases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id) UNIQUE,
  alias_8digit    CHAR(8) NOT NULL,
  acquirer_code_3 CHAR(3) NOT NULL,
  merchant_code_4 CHAR(4) NOT NULL,
  checksum_1      CHAR(1) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_merchant_aliases_8digit UNIQUE (alias_8digit),
  CONSTRAINT chk_alias_numeric CHECK (alias_8digit ~ '^[0-9]{8}$')
);

CREATE TABLE alias_generation_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id),
  alias_8digit  CHAR(8) NOT NULL,
  algorithm     VARCHAR(20) NOT NULL DEFAULT 'DAMM_V1',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE qr_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  store_id        UUID REFERENCES stores(id),
  terminal_id     UUID REFERENCES terminals(id),
  qr_type         qr_type NOT NULL,
  status          qr_status NOT NULL DEFAULT 'ACTIVE',
  poi_method      CHAR(2) NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES users(id),
  CONSTRAINT chk_poi_method CHECK (poi_method IN ('11', '12'))
);

CREATE TABLE qr_payload_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id           UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  tlv_payload     TEXT NOT NULL,
  crc_value       CHAR(4) NOT NULL,
  amount          NUMERIC(18,2),
  bill_number     VARCHAR(25),
  reference_label VARCHAR(25),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_qr_payload_version UNIQUE (qr_id, version)
);

CREATE TABLE qr_render_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id         UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  format        VARCHAR(10) NOT NULL,
  s3_bucket     VARCHAR(100) NOT NULL,
  s3_key        VARCHAR(500) NOT NULL,
  template_id   UUID REFERENCES qr_templates(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- PAYMENTS & SETTLEMENT
-- =============================================================================

CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id         UUID NOT NULL REFERENCES acquirers(id),
  merchant_id         UUID NOT NULL REFERENCES merchants(id),
  store_id            UUID REFERENCES stores(id),
  terminal_id         UUID REFERENCES terminals(id),
  tips_end_to_end_id  VARCHAR(100) NOT NULL,
  amount              NUMERIC(18,2) NOT NULL,
  currency            CHAR(3) NOT NULL DEFAULT 'TZS',
  status              payment_status NOT NULL,
  channel             payment_channel NOT NULL,
  payer_msisdn_masked VARCHAR(20),
  payer_name_masked   VARCHAR(100),
  tips_settled_at     TIMESTAMPTZ,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payments_tips_e2e UNIQUE (tips_end_to_end_id),
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
);

CREATE TABLE payment_metadata (
  payment_id      UUID PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  qr_id           UUID REFERENCES qr_codes(id),
  alias_used      CHAR(8),
  bill_number     VARCHAR(25),
  reference_label VARCHAR(25),
  purpose         VARCHAR(25),
  invoice_id      UUID,
  raw_tips_json   JSONB
);

CREATE TABLE payment_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type    VARCHAR(50) NOT NULL,
  old_status    payment_status,
  new_status    payment_status,
  payload_json  JSONB,
  correlation_id VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash      VARCHAR(64) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  response_code SMALLINT,
  response_body JSONB,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_idempotency_key UNIQUE (key_hash)
);

CREATE TABLE refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID NOT NULL REFERENCES payments(id),
  amount          NUMERIC(18,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  tips_reversal_ref VARCHAR(100),
  reason          TEXT,
  initiated_by    UUID REFERENCES users(id),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_refund_amount CHECK (amount > 0)
);

CREATE TABLE settlement_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  batch_no      VARCHAR(30) NOT NULL,
  status        settlement_batch_status NOT NULL DEFAULT 'OPEN',
  cut_off_at    TIMESTAMPTZ NOT NULL,
  gross_total   NUMERIC(18,2) NOT NULL DEFAULT 0,
  fee_total     NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_total     NUMERIC(18,2) NOT NULL DEFAULT 0,
  approved_at   TIMESTAMPTZ,
  posted_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id),
  updated_by    UUID REFERENCES users(id),
  CONSTRAINT uq_settlement_batch_no UNIQUE (acquirer_id, batch_no)
);

CREATE TABLE settlement_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID NOT NULL REFERENCES settlement_batches(id),
  payment_id        UUID NOT NULL REFERENCES payments(id),
  merchant_id       UUID NOT NULL REFERENCES merchants(id),
  gross_amount      NUMERIC(18,2) NOT NULL,
  mdr_fee           NUMERIC(18,2) NOT NULL DEFAULT 0,
  tips_fee          NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(18,2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_settlement_line_payment UNIQUE (payment_id)
);

CREATE TABLE cbs_postings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_line_id  UUID NOT NULL REFERENCES settlement_lines(id) UNIQUE,
  idempotency_key     VARCHAR(64) NOT NULL,
  status              cbs_posting_status NOT NULL DEFAULT 'PENDING',
  cbs_reference       VARCHAR(100),
  error_message       TEXT,
  posted_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cbs_idempotency UNIQUE (idempotency_key)
);

-- =============================================================================
-- RECONCILIATION
-- =============================================================================

CREATE TABLE recon_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  run_date      DATE NOT NULL,
  status        recon_run_status NOT NULL DEFAULT 'INITIATED',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  CONSTRAINT uq_recon_run_date UNIQUE (acquirer_id, run_date)
);

CREATE TABLE recon_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES recon_runs(id) ON DELETE CASCADE,
  source_type   VARCHAR(10) NOT NULL,
  record_count  INTEGER NOT NULL DEFAULT 0,
  file_s3_key   VARCHAR(500),
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_recon_source CHECK (source_type IN ('MMS', 'TIPS', 'CBS'))
);

CREATE TABLE recon_matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES recon_runs(id) ON DELETE CASCADE,
  payment_id    UUID NOT NULL REFERENCES payments(id),
  match_type    VARCHAR(30) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recon_exceptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES recon_runs(id),
  exception_type VARCHAR(30) NOT NULL,
  payment_id    UUID REFERENCES payments(id),
  external_ref  VARCHAR(100),
  amount        NUMERIC(18,2),
  status        recon_exception_status NOT NULL DEFAULT 'OPEN',
  assigned_to   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recon_resolutions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id  UUID NOT NULL REFERENCES recon_exceptions(id),
  action        VARCHAR(50) NOT NULL,
  notes         TEXT,
  resolver_id   UUID NOT NULL REFERENCES users(id),
  resolved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- SCHOOL FEES
-- =============================================================================

CREATE TABLE schools (
  merchant_id       UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  registration_no   VARCHAR(50),
  head_name         VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE academic_years (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id),
  name          VARCHAR(50) NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  is_current    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id)
);

CREATE TABLE school_classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id),
  name          VARCHAR(100) NOT NULL,
  level         VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id)
);

CREATE TABLE terms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id),
  name              VARCHAR(50) NOT NULL,
  due_date          DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID REFERENCES users(id)
);

CREATE TABLE fee_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES merchants(id),
  code          VARCHAR(30) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  default_amount NUMERIC(18,2),
  is_mandatory  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id),
  CONSTRAINT uq_fee_items_code UNIQUE (merchant_id, code)
);

CREATE TABLE students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  class_id        UUID REFERENCES school_classes(id),
  admission_no    VARCHAR(30) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  guardian_phone_enc BYTEA,
  guardian_email_enc BYTEA,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES users(id),
  CONSTRAINT uq_students_admission UNIQUE (merchant_id, admission_no)
);

CREATE TABLE invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id),
  term_id       UUID NOT NULL REFERENCES terms(id),
  bill_number   VARCHAR(25) NOT NULL,
  total_amount  NUMERIC(18,2) NOT NULL,
  paid_amount   NUMERIC(18,2) NOT NULL DEFAULT 0,
  status        invoice_status NOT NULL DEFAULT 'DRAFT',
  issued_at     TIMESTAMPTZ,
  due_date      DATE,
  qr_id         UUID REFERENCES qr_codes(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id),
  CONSTRAINT uq_invoices_bill_number UNIQUE (bill_number),
  CONSTRAINT chk_invoice_total CHECK (total_amount >= 0)
);

CREATE TABLE invoice_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  fee_item_id   UUID NOT NULL REFERENCES fee_items(id),
  amount        NUMERIC(18,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_allocations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    UUID NOT NULL REFERENCES payments(id),
  invoice_id    UUID NOT NULL REFERENCES invoices(id),
  amount        NUMERIC(18,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_invoice UNIQUE (payment_id, invoice_id)
);

CREATE TABLE student_balances (
  student_id    UUID PRIMARY KEY REFERENCES students(id),
  balance       NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_metadata ADD CONSTRAINT fk_payment_metadata_invoice
  FOREIGN KEY (invoice_id) REFERENCES invoices(id);

-- =============================================================================
-- APPROVALS (MAKER-CHECKER)
-- =============================================================================

CREATE TABLE approval_policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  entity_type   approval_entity_type NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  sla_hours     INTEGER NOT NULL DEFAULT 24,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_approval_policy UNIQUE (acquirer_id, entity_type)
);

CREATE TABLE approval_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  entity_type   approval_entity_type NOT NULL,
  entity_id     UUID NOT NULL,
  maker_id      UUID NOT NULL REFERENCES users(id),
  status        approval_task_status NOT NULL DEFAULT 'PENDING',
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE approval_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES approval_tasks(id),
  checker_id    UUID NOT NULL REFERENCES users(id),
  decision      VARCHAR(20) NOT NULL,
  notes         TEXT,
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_approval_decision CHECK (decision IN ('APPROVED', 'REJECTED')),
  CONSTRAINT uq_approval_decision_task UNIQUE (task_id)
);

-- =============================================================================
-- NOTIFICATIONS & REPORTING
-- =============================================================================

CREATE TABLE notification_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID REFERENCES acquirers(id),
  code          VARCHAR(50) NOT NULL,
  channel       notification_channel NOT NULL,
  language      VARCHAR(5) NOT NULL DEFAULT 'en',
  subject       VARCHAR(255),
  body_template TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_template UNIQUE (acquirer_id, code, channel, language)
);

CREATE TABLE notification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  channel         notification_channel NOT NULL,
  recipient       VARCHAR(255) NOT NULL,
  template_code   VARCHAR(50),
  status          notification_delivery_status NOT NULL DEFAULT 'PENDING',
  correlation_id  VARCHAR(64),
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  merchant_id   UUID REFERENCES merchants(id),
  channel       notification_channel NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE in_app_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  body          TEXT NOT NULL,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  query_template TEXT NOT NULL,
  param_schema  JSONB NOT NULL DEFAULT '{}',
  is_regulatory BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id   UUID NOT NULL REFERENCES report_definitions(id),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  requested_by    UUID NOT NULL REFERENCES users(id),
  status          report_job_status NOT NULL DEFAULT 'QUEUED',
  params_json     JSONB NOT NULL DEFAULT '{}',
  output_s3_key   VARCHAR(500),
  row_count       INTEGER,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id   UUID NOT NULL REFERENCES report_definitions(id),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  cron_expression VARCHAR(100) NOT NULL,
  recipients      TEXT[] NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id)
);

CREATE TABLE dashboard_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID REFERENCES acquirers(id),
  merchant_id   UUID REFERENCES merchants(id),
  widget_key    VARCHAR(50) NOT NULL,
  snapshot_date DATE NOT NULL,
  metrics_json  JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dashboard_snapshot UNIQUE (acquirer_id, merchant_id, widget_key, snapshot_date)
);

-- =============================================================================
-- INTEGRATION LOGS (TIPS / CBS) — append-only
-- =============================================================================

CREATE TABLE tips_message_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  direction       VARCHAR(10) NOT NULL,
  message_type    VARCHAR(50) NOT NULL,
  correlation_id  VARCHAR(64),
  merchant_id     UUID REFERENCES merchants(id),
  payload_json    JSONB,
  status          VARCHAR(20) NOT NULL,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tips_direction CHECK (direction IN ('INBOUND', 'OUTBOUND'))
);

CREATE TABLE tips_settlement_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  file_date     DATE NOT NULL,
  s3_bucket     VARCHAR(100) NOT NULL,
  s3_key        VARCHAR(500) NOT NULL,
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tips_settlement_file UNIQUE (acquirer_id, file_date)
);

CREATE TABLE cbs_message_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  operation       VARCHAR(50) NOT NULL,
  idempotency_key VARCHAR(64),
  request_ref     VARCHAR(100),
  response_ref    VARCHAR(100),
  status          VARCHAR(20) NOT NULL,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cbs_account_verifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  account_number  VARCHAR(30) NOT NULL,
  result          VARCHAR(20) NOT NULL,
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by     UUID REFERENCES users(id)
);

CREATE TABLE cbs_statements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID NOT NULL REFERENCES acquirers(id),
  statement_date DATE NOT NULL,
  s3_bucket     VARCHAR(100) NOT NULL,
  s3_key        VARCHAR(500) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cbs_statement UNIQUE (acquirer_id, statement_date)
);

-- =============================================================================
-- AUDIT (immutable — no soft delete)
-- =============================================================================

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id     UUID REFERENCES acquirers(id),
  actor_id        UUID REFERENCES users(id),
  actor_email     CITEXT,
  action          VARCHAR(100) NOT NULL,
  entity_type     VARCHAR(50) NOT NULL,
  entity_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  correlation_id  VARCHAR(64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- MONITORING
-- =============================================================================

CREATE TABLE health_check_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name  VARCHAR(50) NOT NULL,
  status        VARCHAR(20) NOT NULL,
  latency_ms    INTEGER,
  details_json  JSONB,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sla_metrics_daily (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id   UUID REFERENCES acquirers(id),
  metric_key    VARCHAR(50) NOT NULL,
  metric_date   DATE NOT NULL,
  value         NUMERIC(18,4) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sla_metric UNIQUE (acquirer_id, metric_key, metric_date)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Users & auth
CREATE INDEX idx_users_acquirer ON users(acquirer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_merchant ON users(merchant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at DESC);

-- Merchants
CREATE INDEX idx_merchants_acquirer_status ON merchants(acquirer_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_merchants_trading_name ON merchants(trading_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_stores_merchant ON stores(merchant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_terminals_store ON terminals(store_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_onboarding_status ON onboarding_applications(acquirer_id, status);
CREATE INDEX idx_onboarding_merchant ON onboarding_applications(merchant_id);

-- QR & alias
CREATE INDEX idx_qr_codes_merchant ON qr_codes(merchant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_merchant_aliases_lookup ON merchant_aliases(alias_8digit) WHERE is_active = true;

-- Payments (high volume)
CREATE INDEX idx_payments_merchant_date ON payments(merchant_id, received_at DESC);
CREATE INDEX idx_payments_status_date ON payments(status, received_at DESC);
CREATE INDEX idx_payments_acquirer_date ON payments(acquirer_id, received_at DESC);
CREATE INDEX idx_payment_events_payment ON payment_events(payment_id, created_at);
CREATE INDEX idx_payment_metadata_bill ON payment_metadata(bill_number) WHERE bill_number IS NOT NULL;

-- Settlement & recon
CREATE INDEX idx_settlement_batches_status ON settlement_batches(acquirer_id, status);
CREATE INDEX idx_settlement_lines_batch ON settlement_lines(batch_id);
CREATE INDEX idx_recon_exceptions_run ON recon_exceptions(run_id, status);

-- School
CREATE INDEX idx_students_merchant ON students(merchant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_student ON invoices(student_id, status);
CREATE INDEX idx_invoices_bill ON invoices(bill_number);

-- Audit & integration
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_tips_message_correlation ON tips_message_log(correlation_id);
CREATE INDEX idx_tips_message_merchant ON tips_message_log(merchant_id, created_at DESC);
CREATE INDEX idx_cbs_message_idempotency ON cbs_message_log(idempotency_key);
CREATE INDEX idx_notification_log_correlation ON notification_log(correlation_id);

-- Approvals
CREATE INDEX idx_approval_tasks_checker ON approval_tasks(acquirer_id, status) WHERE status = 'PENDING';

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at (representative set)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acquirers','users','merchants','stores','terminals','settlement_accounts',
    'onboarding_applications','qr_codes','payments','settlement_batches',
    'invoices','fee_items','students','approval_tasks','fee_rules','system_config'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

COMMIT;
