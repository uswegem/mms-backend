-- Step 1: Extend merchant_status enum (each statement auto-commits)
DO $$ BEGIN
  ALTER TYPE merchant_status RENAME VALUE 'PENDING' TO 'PENDING_REVIEW';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TYPE merchant_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE merchant_status ADD VALUE IF NOT EXISTS 'REJECTED';
