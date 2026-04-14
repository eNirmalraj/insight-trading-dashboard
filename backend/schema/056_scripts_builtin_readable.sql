-- 056_scripts_builtin_readable.sql
-- Phase 2 (supplementary) — Signal Engine Cleanup
--
-- Allow any authenticated user to SELECT built-in scripts.
-- Existing RLS only allowed user_id = auth.uid(), so rows with user_id IS NULL
-- (built-ins synced from .kuri files) were invisible to everyone except the
-- service key.
--
-- After this, the frontend's AssignStrategiesModal can see built-in strategies
-- via the user's anon session.

-- Enable RLS if not already (safe — idempotent)
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

-- Drop any prior policy with the same name so this is re-runnable
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'scripts'
           AND policyname = 'builtins_readable_by_authenticated'
    ) THEN
        DROP POLICY builtins_readable_by_authenticated ON scripts;
    END IF;
END $$;

-- Add the policy: any authenticated user can SELECT rows where is_builtin = true.
-- This is additive to any existing per-user SELECT policy (policies are OR'd).
CREATE POLICY builtins_readable_by_authenticated ON scripts
    FOR SELECT
    TO authenticated
    USING (is_builtin = true);
