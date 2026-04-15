-- 060_signal_executions_pinned.sql
-- Add is_pinned column to signal_executions so users can pin individual
-- signal cards. Pinned signals sort to the top of the Signals page.
--
-- RLS: add UPDATE policy for is_pinned so authenticated users can toggle
-- the pin on their own executions (but still can't touch status/SL/TP —
-- those are backend-only).

ALTER TABLE signal_executions
    ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- Fast lookups for pinned signals in the UI
CREATE INDEX IF NOT EXISTS idx_signal_executions_user_pinned
    ON signal_executions (user_id, is_pinned) WHERE is_pinned = true;

-- Update policy: users can toggle is_pinned on their own executions
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'signal_executions'
           AND policyname = 'signal_executions_update_pinned_own'
    ) THEN
        DROP POLICY signal_executions_update_pinned_own ON signal_executions;
    END IF;
END $$;

CREATE POLICY signal_executions_update_pinned_own ON signal_executions
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
