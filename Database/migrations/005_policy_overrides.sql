-- Policy overrides for per-user ALLOW/DENY permission exceptions

DO $$ BEGIN
  CREATE TYPE policy_effect AS ENUM ('ALLOW', 'DENY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS policy_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquirer_id     UUID NOT NULL REFERENCES acquirers(id),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_code VARCHAR(100) NOT NULL,
  effect          policy_effect NOT NULL,
  scope_type      VARCHAR(20),
  scope_id        UUID,
  reason          TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID
);

CREATE INDEX IF NOT EXISTS idx_policy_overrides_user_perm
  ON policy_overrides (user_id, permission_code);

CREATE INDEX IF NOT EXISTS idx_policy_overrides_acquirer
  ON policy_overrides (acquirer_id);
