-- Create table for storing user's last visited market state
CREATE TABLE IF NOT EXISTS public.user_market_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL DEFAULT 'EURUSD',
    timeframe TEXT NOT NULL DEFAULT '1H',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_market_state ENABLE ROW LEVEL SECURITY;

-- Create policies for user_market_state
CREATE POLICY "Users can view their own market state" 
    ON public.user_market_state FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert/update their own market state" 
    ON public.user_market_state FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- Create table for storing complex chart settings
CREATE TABLE IF NOT EXISTS public.user_chart_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_chart_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for user_chart_settings
CREATE POLICY "Users can view their own chart settings" 
    ON public.user_chart_settings FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert/update their own chart settings" 
    ON public.user_chart_settings FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION public.handle_market_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS on_market_state_updated ON public.user_market_state;
CREATE TRIGGER on_market_state_updated
    BEFORE UPDATE ON public.user_market_state
    FOR EACH ROW EXECUTE PROCEDURE public.handle_market_updated_at();

DROP TRIGGER IF EXISTS on_chart_settings_updated ON public.user_chart_settings;
CREATE TRIGGER on_chart_settings_updated
    BEFORE UPDATE ON public.user_chart_settings
    FOR EACH ROW EXECUTE PROCEDURE public.handle_market_updated_at();
