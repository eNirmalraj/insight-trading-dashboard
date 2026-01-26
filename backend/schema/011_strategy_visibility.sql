-- Create table for storing user's strategy indicator visibility preferences
CREATE TABLE IF NOT EXISTS public.user_strategy_indicators (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
    is_visible BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, strategy_id)
);

-- Safely add is_visible column if it doesn't exist (migration fix)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_strategy_indicators' AND column_name = 'is_visible') THEN
        ALTER TABLE public.user_strategy_indicators ADD COLUMN is_visible BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE public.user_strategy_indicators ENABLE ROW LEVEL SECURITY;

-- Create policies for user_strategy_indicators
-- Drop existing policies to avoid conflicts on re-run
DROP POLICY IF EXISTS "Users can view their own strategy visibility" ON public.user_strategy_indicators;
CREATE POLICY "Users can view their own strategy visibility" 
    ON public.user_strategy_indicators FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert/update their own strategy visibility" ON public.user_strategy_indicators;
CREATE POLICY "Users can insert/update their own strategy visibility" 
    ON public.user_strategy_indicators FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS on_user_strategy_indicators_updated ON public.user_strategy_indicators;
CREATE TRIGGER on_user_strategy_indicators_updated
    BEFORE UPDATE ON public.user_strategy_indicators
    FOR EACH ROW EXECUTE PROCEDURE public.handle_market_updated_at();
