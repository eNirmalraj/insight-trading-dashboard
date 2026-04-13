-- 055_scripts_user_id_nullable.sql
-- Phase 2 (supplementary) — Signal Engine Cleanup
-- Allow NULL user_id on scripts rows for built-in strategies.
-- Enforce via CHECK constraint: either a user owns the row, or it's a built-in.
--
-- Why: Built-in strategies are synced from .kuri files on backend startup and
-- have no owning user. The original scripts table required user_id NOT NULL.

-- Step 1: Drop the NOT NULL constraint.
ALTER TABLE scripts
    ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Add a CHECK ensuring the row either has a user OR is a built-in.
-- Use DO block so we can drop-then-add cleanly without failing on re-run.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'scripts_owner_or_builtin'
    ) THEN
        ALTER TABLE scripts DROP CONSTRAINT scripts_owner_or_builtin;
    END IF;
END $$;

ALTER TABLE scripts
    ADD CONSTRAINT scripts_owner_or_builtin
    CHECK (user_id IS NOT NULL OR is_builtin = true);
