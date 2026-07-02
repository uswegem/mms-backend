-- MMS Milestone 2: Tanzania merchant onboarding fields
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS vrn VARCHAR(20),
  ADD COLUMN IF NOT EXISTS license_number VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_merchants_tax_id ON merchants (tax_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_merchants_vrn ON merchants (vrn) WHERE deleted_at IS NULL;
