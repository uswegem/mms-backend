-- Flags a static QR whose latest regeneration changed its fixed amount
-- (tag 54) — a previously printed sticker now encodes a stale amount and
-- needs reprinting. Cleared via the acknowledge-reprint action.
-- Safe to run multiple times.

ALTER TABLE qr_codes
  ADD COLUMN IF NOT EXISTS reprint_required BOOLEAN NOT NULL DEFAULT false;
