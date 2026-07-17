-- Migration: 10-digit student alias (flat global sequence)
--
-- Replaces the old 8-digit-per-school student alias scheme with a single flat
-- global 10-digit alias: [780][globalSeq6][DammCheck1].
--
-- Existing student alias rows are incompatible with the new format (the body
-- digit structure is completely different) and are deleted. In a production
-- cutover, export and re-issue student aliases before running this migration.

-- Step 1: Remove student-linked QR codes (they carry the old 8-digit storeLabel)
DELETE FROM qr_codes WHERE student_id IS NOT NULL;

-- Step 2: Remove all existing student alias rows
DELETE FROM student_aliases;

-- Step 3: Create the flat global sequence table for 10-digit student aliases
CREATE TABLE student_alias_sequences (
    id      VARCHAR(6)  NOT NULL DEFAULT 'GLOBAL',
    last_seq INTEGER    NOT NULL DEFAULT 0,
    CONSTRAINT student_alias_sequences_pkey PRIMARY KEY (id)
);
INSERT INTO student_alias_sequences (id, last_seq) VALUES ('GLOBAL', 0);

-- Step 4: Rename alias_8digit → alias_10digit and widen to CHAR(10)
ALTER TABLE student_aliases
    RENAME COLUMN alias_8digit TO alias_10digit;

ALTER TABLE student_aliases
    ALTER COLUMN alias_10digit TYPE CHAR(10);

-- Step 5: Rename alias_seq_4 → alias_seq_6 and widen to CHAR(6)
ALTER TABLE student_aliases
    RENAME COLUMN alias_seq_4 TO alias_seq_6;

ALTER TABLE student_aliases
    ALTER COLUMN alias_seq_6 TYPE CHAR(6);

-- Step 6: Drop obsolete per-school-hierarchy columns
ALTER TABLE student_aliases
    DROP COLUMN internal_id_8digit,
    DROP COLUMN school_seq_3,
    DROP COLUMN student_seq_4;
