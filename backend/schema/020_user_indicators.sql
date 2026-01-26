-- Migration: User Indicators Storage
-- Description: Store user-specific technical indicators with settings and visibility
-- Version: 020

-- Create user_indicators table
CREATE TABLE IF NOT EXISTS public.user_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    indicator_type TEXT NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_visible BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate indicators with same settings
    CONSTRAINT unique_user_indicator UNIQUE(user_id, symbol, timeframe, indicator_type, settings)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_indicators_user_id 
    ON public.user_indicators(user_id);

CREATE INDEX IF NOT EXISTS idx_user_indicators_symbol_timeframe 
    ON public.user_indicators(user_id, symbol, timeframe);

CREATE INDEX IF NOT EXISTS idx_user_indicators_display_order 
    ON public.user_indicators(user_id, display_order);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_user_indicators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER update_user_indicators_updated_at
    BEFORE UPDATE ON public.user_indicators
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_indicators_updated_at();

-- Enable Row Level Security
ALTER TABLE public.user_indicators ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own indicators
CREATE POLICY "Users can view own indicators"
    ON public.user_indicators 
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own indicators"
    ON public.user_indicators 
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own indicators"
    ON public.user_indicators 
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own indicators"
    ON public.user_indicators 
    FOR DELETE
    USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE public.user_indicators IS 'Stores user-specific technical indicator configurations';
COMMENT ON COLUMN public.user_indicators.settings IS 'JSONB containing indicator-specific settings (period, colors, etc.)';
COMMENT ON COLUMN public.user_indicators.display_order IS 'Order in which indicators are displayed (lower = first)';
