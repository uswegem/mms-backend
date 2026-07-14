-- Ties a dynamic QR to a stable, per-merchant-unique Bill Number (tag 62/01)
-- so a scan can be matched back to the exact version it came from, not just
-- "the latest active dynamic QR for this merchant" -- closes a replay gap
-- where a stale/expired dynamic QR image would otherwise be structurally
-- indistinguishable from a newer version issued to the same merchant.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS dynamic_qr_sequences (
  merchant_id UUID PRIMARY KEY,
  last_seq    INTEGER NOT NULL DEFAULT 0
);

DO $$ BEGIN
  ALTER TABLE qr_payload_versions
    ADD CONSTRAINT qr_payload_versions_merchant_billnumber_key
    UNIQUE (tag_26_02_merchant_id, bill_number);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
