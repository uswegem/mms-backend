-- Persists TANQR tag 62/07 (Terminal Label) as its own column, matching the
-- existing tag_62_03_store_label / tag_62_05_internal_id columns, instead of
-- requiring it to be re-parsed out of the raw TLV string on regeneration
-- (which was unreliable for non-numeric terminal labels).
-- Safe to run multiple times.

ALTER TABLE qr_payload_versions
  ADD COLUMN IF NOT EXISTS tag_62_07_terminal_label VARCHAR(25);
