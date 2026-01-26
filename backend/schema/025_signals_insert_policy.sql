-- 025_signals_insert_policy.sql
-- Allow authenticated users to insert signals (for client-side signal generation)

DROP POLICY IF EXISTS "Authenticated users can insert signals" ON public.signals;

CREATE POLICY "Authenticated users can insert signals"
    ON public.signals FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Grant INSERT permission to authenticated role
GRANT INSERT ON public.signals TO authenticated;

COMMENT ON POLICY "Authenticated users can insert signals" ON public.signals IS 
'Allows client-side signal generation engine to create signals';
