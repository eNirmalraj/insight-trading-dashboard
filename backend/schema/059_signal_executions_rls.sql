-- 059_signal_executions_rls.sql
-- Enable RLS on signal_executions and add read policies so the Signals page
-- can load per-user executions AND platform executions (user_id IS NULL).
--
-- Write policies (INSERT/UPDATE/DELETE) are NOT needed here because all
-- writes come from the backend Signal Engine via the service key, which
-- bypasses RLS. Only SELECT needs a policy.

ALTER TABLE signal_executions ENABLE ROW LEVEL SECURITY;

-- Clean up any old policies with these names (idempotent)
DO $$
DECLARE
    p TEXT;
BEGIN
    FOR p IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'signal_executions'
           AND policyname IN (
               'signal_executions_select_own',
               'signal_executions_select_platform'
           )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON signal_executions', p);
    END LOOP;
END $$;

-- SELECT: users see executions they own (user_id = auth.uid())
CREATE POLICY signal_executions_select_own ON signal_executions
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- SELECT: all authenticated users see platform executions (user_id IS NULL).
-- These are the default SMA Trend stream on top 10 symbols, used as a
-- discovery/demo experience for users with no watchlists.
CREATE POLICY signal_executions_select_platform ON signal_executions
    FOR SELECT
    TO authenticated
    USING (user_id IS NULL);
