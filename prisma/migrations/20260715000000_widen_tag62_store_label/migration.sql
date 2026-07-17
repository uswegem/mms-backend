-- Widen tag_62_03_store_label and tag_62_05_internal_id from VARCHAR(8) to
-- VARCHAR(25) to accommodate 10-digit student aliases (and any future
-- sub-field value up to the TANQR spec max of 25 characters).

ALTER TABLE qr_payload_versions
    ALTER COLUMN tag_62_03_store_label TYPE VARCHAR(25),
    ALTER COLUMN tag_62_05_internal_id TYPE VARCHAR(25);
