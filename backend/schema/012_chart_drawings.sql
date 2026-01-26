-- Create table for storing user's chart drawings
CREATE TABLE IF NOT EXISTS public.user_chart_drawings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    drawing_type TEXT NOT NULL, 
    drawing_data JSONB NOT NULL, 
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, symbol, timeframe)
);

-- Safely add unique constraint if it doesn't exist (migration fix)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_chart_drawings_user_id_symbol_timeframe_key') THEN
        ALTER TABLE public.user_chart_drawings ADD CONSTRAINT user_chart_drawings_user_id_symbol_timeframe_key UNIQUE (user_id, symbol, timeframe);
    END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE public.user_chart_drawings ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Users can view their own drawings" ON public.user_chart_drawings;
CREATE POLICY "Users can view their own drawings" 
    ON public.user_chart_drawings FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert/update their own drawings" ON public.user_chart_drawings;
CREATE POLICY "Users can insert/update their own drawings" 
    ON public.user_chart_drawings FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS on_user_chart_drawings_updated ON public.user_chart_drawings;
CREATE TRIGGER on_user_chart_drawings_updated
    BEFORE UPDATE ON public.user_chart_drawings
    FOR EACH ROW EXECUTE PROCEDURE public.handle_market_updated_at();
