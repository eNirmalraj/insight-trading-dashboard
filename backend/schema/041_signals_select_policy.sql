
-- 041_signals_select_policy.sql
-- Allow authenticated users to view signals

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'signals' 
        AND policyname = 'Enable read access for authenticated users'
    ) THEN
        CREATE POLICY "Enable read access for authenticated users" ON public.signals
        FOR SELECT 
        TO authenticated 
        USING (true);
    END IF;
END $$;
