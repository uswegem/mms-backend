-- QR module schema alignment (Prisma ↔ Postgres)
-- Safe to run multiple times.

-- qr_codes: store/terminal scoping (optional UUIDs; no FK if merchant_stores schema differs)
ALTER TABLE qr_codes
  ADD COLUMN IF NOT EXISTS store_id UUID,
  ADD COLUMN IF NOT EXISTS terminal_id UUID;

ALTER TABLE qr_payload_versions
  ADD COLUMN IF NOT EXISTS reference_label VARCHAR(25);

-- tips_registrations (from MMS initial schema; may be missing on partial DB setups)
DO $$ BEGIN
  CREATE TYPE tips_registration_status AS ENUM ('PENDING', 'REGISTERED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tips_registrations (
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

-- qr_render_assets metadata (table may exist from initial schema with fewer columns)
CREATE TABLE IF NOT EXISTS qr_render_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id         UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  format        VARCHAR(10) NOT NULL,
  s3_bucket     VARCHAR(100) NOT NULL,
  s3_key        VARCHAR(500) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE qr_render_assets
  ADD COLUMN IF NOT EXISTS payload_version_id UUID REFERENCES qr_payload_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

CREATE INDEX IF NOT EXISTS idx_qr_render_assets_qr_id ON qr_render_assets(qr_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_merchant_static_lookup
  ON qr_codes(merchant_id, qr_type, status, store_id, terminal_id);
