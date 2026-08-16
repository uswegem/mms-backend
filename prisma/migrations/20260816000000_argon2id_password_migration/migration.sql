-- bcrypt -> Argon2id password hashing migration (see docs/architecture-decisions).
-- Every existing row is genuinely BCRYPT at the moment this ships, so the
-- column default and the explicit backfill agree — there is nothing to
-- reclassify after the fact.

CREATE TYPE "password_algo" AS ENUM ('BCRYPT', 'ARGON2ID');

ALTER TABLE "auth_credentials"
  ADD COLUMN "password_algo" "password_algo" NOT NULL DEFAULT 'BCRYPT',
  ADD COLUMN "password_migrated_at" TIMESTAMPTZ(6),
  ADD COLUMN "must_reset_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "password_reset_warned_at" TIMESTAMPTZ(6);
