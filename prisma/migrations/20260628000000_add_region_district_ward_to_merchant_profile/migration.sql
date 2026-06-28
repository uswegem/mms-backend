-- Add region, district, ward columns to merchant_profiles
-- city is relaxed from NOT NULL VARCHAR(15) to nullable VARCHAR(100)
-- to accommodate ward-driven location selection

ALTER TABLE "merchant_profiles"
  ADD COLUMN IF NOT EXISTS "region"   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "district" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "ward"     VARCHAR(100);

ALTER TABLE "merchant_profiles"
  ALTER COLUMN "city" DROP NOT NULL,
  ALTER COLUMN "city" TYPE VARCHAR(100);
