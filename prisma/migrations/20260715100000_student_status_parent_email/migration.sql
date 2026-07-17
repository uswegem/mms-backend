-- Create student_status enum
CREATE TYPE "student_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- Add status column (default ACTIVE, backfill from is_active)
ALTER TABLE "students"
  ADD COLUMN "status" "student_status" NOT NULL DEFAULT 'ACTIVE';

UPDATE "students"
  SET "status" = 'INACTIVE'
  WHERE "is_active" = false;

-- Add parent_email column (CITEXT for case-insensitive uniqueness queries)
ALTER TABLE "students"
  ADD COLUMN "parent_email" CITEXT;
