-- 008_strategies_type.sql
-- Add type column to strategies table to distinguish between Strategies and Indicators

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategies' AND column_name = 'type') THEN
        ALTER TABLE public.strategies ADD COLUMN type TEXT DEFAULT 'STRATEGY';
        ALTER TABLE public.strategies ADD CONSTRAINT strategies_type_check CHECK (type IN ('STRATEGY', 'INDICATOR'));
    END IF;
END $$;
