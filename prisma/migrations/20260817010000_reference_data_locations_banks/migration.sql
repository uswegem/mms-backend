-- Reference-data module (Milestone B): authoritative Region -> District ->
-- Ward -> postcode hierarchy and bank/SWIFT catalog. Backs server-side
-- validation of MerchantProfile's region/district/ward/postalCode fields and
-- SettlementAccount.bankCode, both previously free text with no validation.

CREATE TABLE "reference_regions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(50) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "reference_regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_regions_name_key" ON "reference_regions"("name");

CREATE TABLE "reference_districts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "region_id" UUID NOT NULL,
  "name" VARCHAR(50) NOT NULL,

  CONSTRAINT "reference_districts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_districts_region_id_name_key" ON "reference_districts"("region_id", "name");

ALTER TABLE "reference_districts"
  ADD CONSTRAINT "reference_districts_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "reference_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- postcode is VARCHAR(6), not CHAR(5) like merchant_profiles.postal_code:
-- the source dataset has one ward (Morogoro/Malinyi/Kilosampepo) with a
-- 6-digit postcode ("678010"), stored faithfully rather than truncated.
CREATE TABLE "reference_wards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "district_id" UUID NOT NULL,
  "name" VARCHAR(50) NOT NULL,
  "postcode" VARCHAR(6) NOT NULL,

  CONSTRAINT "reference_wards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_wards_district_id_name_key" ON "reference_wards"("district_id", "name");
CREATE INDEX "reference_wards_postcode_idx" ON "reference_wards"("postcode");

ALTER TABLE "reference_wards"
  ADD CONSTRAINT "reference_wards_district_id_fkey"
  FOREIGN KEY ("district_id") REFERENCES "reference_districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reference_banks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "swift_code" VARCHAR(11) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "reference_banks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_banks_name_key" ON "reference_banks"("name");
CREATE UNIQUE INDEX "reference_banks_swift_code_key" ON "reference_banks"("swift_code");
