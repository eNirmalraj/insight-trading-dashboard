-- 009_signals_strategy_id.sql
-- Add strategy_id foreign key to signals table to link signals to strategies

DO $$ 
BEGIN 
    -- Add strategy_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'signals' AND column_name = 'strategy_id'
    ) THEN
        ALTER TABLE public.signals ADD COLUMN strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL;
        
        -- Add index for performance
        CREATE INDEX IF NOT EXISTS idx_signals_strategy_id ON public.signals(strategy_id);
        
        -- Add comment
        COMMENT ON COLUMN public.signals.strategy_id IS 'Links signal to the strategy that generated it (nullable for manual signals)';
    END IF;
END $$;
