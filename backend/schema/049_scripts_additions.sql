-- 049_scripts_additions.sql
-- Phase 2 / Task 2.1 — Signal Engine Cleanup
-- Add columns to scripts table for built-in sync, versioning, and param schema.

ALTER TABLE scripts
    ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS template_version text,
    ADD COLUMN IF NOT EXISTS param_schema jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_scripts_builtin
    ON scripts (is_builtin)
    WHERE is_builtin = true;
