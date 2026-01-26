-- 027_update_signals_table.sql
-- =============================================================================
-- Update signals table to include all fields required by Signal Engine
-- =============================================================================

-- Add strategy_category if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'strategy_category') THEN
        ALTER TABLE public.signals ADD COLUMN strategy_category TEXT;
    END IF;
END $$;

-- Add entry_type if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'entry_type') THEN
        ALTER TABLE public.signals ADD COLUMN entry_type TEXT DEFAULT 'MARKET';
    END IF;
END $$;

-- Add strategy_id if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'strategy_id') THEN
        ALTER TABLE public.signals ADD COLUMN strategy_id TEXT;
    END IF;
END $$;

-- Add profit_loss if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'profit_loss') THEN
        ALTER TABLE public.signals ADD COLUMN profit_loss NUMERIC;
    END IF;
END $$;

-- Add close_reason if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'close_reason') THEN
        ALTER TABLE public.signals ADD COLUMN close_reason TEXT;
    END IF;
END $$;

-- Add activated_at if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'activated_at') THEN
        ALTER TABLE public.signals ADD COLUMN activated_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add closed_at if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'closed_at') THEN
        ALTER TABLE public.signals ADD COLUMN closed_at TIMESTAMPTZ;
    END IF;
END $$;


-- Ensure RLS is enabled
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated users (needed for CLIENT-SIDE signal generation)
GRANT ALL ON public.signals TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.signals TO authenticated;

-- Create generic INSERT policy if it doesn't exist to allow authenticated users to create signals
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'signals' 
        AND policyname = 'Enable insert for authenticated users'
    ) THEN
        CREATE POLICY "Enable insert for authenticated users" ON public.signals
        FOR INSERT 
        TO authenticated 
        WITH CHECK (true);
    END IF;
END $$;

-- Create generic UPDATE policy if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'signals' 
        AND policyname = 'Enable update for authenticated users'
    ) THEN
        CREATE POLICY "Enable update for authenticated users" ON public.signals
        FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;
