-- 057_watchlist_strategies_rls.sql
-- Phase 2 (supplementary) — Signal Engine Cleanup
--
-- Enable RLS on watchlist_strategies and add policies so authenticated users
-- can manage the strategy assignments on THEIR OWN watchlists.
--
-- Without this, the frontend AssignStrategiesModal can't persist anything —
-- INSERT is silently rejected, the catch block logs to console, and the user
-- sees an empty Assigned list.

ALTER TABLE watchlist_strategies ENABLE ROW LEVEL SECURITY;

-- Clean up any old policies with these names so this is idempotent.
DO $$
DECLARE
    p TEXT;
BEGIN
    FOR p IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'watchlist_strategies'
           AND policyname IN (
               'watchlist_strategies_select_own',
               'watchlist_strategies_insert_own',
               'watchlist_strategies_update_own',
               'watchlist_strategies_delete_own'
           )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON watchlist_strategies', p);
    END LOOP;
END $$;

-- SELECT: users can read assignments on watchlists they own.
CREATE POLICY watchlist_strategies_select_own ON watchlist_strategies
    FOR SELECT
    TO authenticated
    USING (
        watchlist_id IN (
            SELECT id FROM watchlists WHERE user_id = auth.uid()
        )
    );

-- INSERT: users can create assignments on watchlists they own.
CREATE POLICY watchlist_strategies_insert_own ON watchlist_strategies
    FOR INSERT
    TO authenticated
    WITH CHECK (
        watchlist_id IN (
            SELECT id FROM watchlists WHERE user_id = auth.uid()
        )
    );

-- UPDATE: users can update assignments on watchlists they own.
CREATE POLICY watchlist_strategies_update_own ON watchlist_strategies
    FOR UPDATE
    TO authenticated
    USING (
        watchlist_id IN (
            SELECT id FROM watchlists WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        watchlist_id IN (
            SELECT id FROM watchlists WHERE user_id = auth.uid()
        )
    );

-- DELETE: users can delete assignments on watchlists they own.
CREATE POLICY watchlist_strategies_delete_own ON watchlist_strategies
    FOR DELETE
    TO authenticated
    USING (
        watchlist_id IN (
            SELECT id FROM watchlists WHERE user_id = auth.uid()
        )
    );
