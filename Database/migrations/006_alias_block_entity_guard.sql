-- DB-level guard preventing alias block/entity-type mismatches.
-- Block 780 is reserved for schools/students; 781/782 are for retail merchants.
-- Safe to run multiple times.

ALTER TABLE merchant_aliases
  ADD COLUMN IF NOT EXISTS is_school BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the source of truth (merchants.is_school) rather than trusting
-- the column default, so any legitimate school alias issued before this
-- column existed is correctly flagged before the CHECK constraint is added.
UPDATE merchant_aliases ma
SET is_school = m.is_school
FROM merchants m
WHERE m.id = ma.merchant_id
  AND ma.is_school IS DISTINCT FROM m.is_school;

-- Added NOT VALID: enforces the rule for every new INSERT/UPDATE from here on
-- without failing this migration if legacy mismatched rows already exist.
-- Existing violations (e.g. a merchant with a 780 alias) need a business
-- decision to reissue before `VALIDATE CONSTRAINT` can be run to close the gap.
DO $$ BEGIN
  ALTER TABLE merchant_aliases
    ADD CONSTRAINT merchant_aliases_block_matches_entity_type
    CHECK (
      (is_school AND acquirer_code_3 = '780')
      OR (NOT is_school AND acquirer_code_3 IN ('781', '782'))
    ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE student_aliases
    ADD CONSTRAINT student_aliases_block_is_school_block
    CHECK (acquirer_code_3 = '780') NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
