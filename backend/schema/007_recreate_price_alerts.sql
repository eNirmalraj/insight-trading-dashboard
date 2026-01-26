-- Recreate price_alerts table with all required columns
CREATE TABLE IF NOT EXISTS public.price_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL DEFAULT auth.uid(),
    symbol TEXT NOT NULL,
    condition TEXT NOT NULL, -- 'ABOVE', 'BELOW', 'Crossing', etc.
    price NUMERIC NOT NULL,
    triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- New columns for Trend Line support
    drawing_id TEXT,
    fib_level NUMERIC,
    message TEXT,
    notify_app BOOLEAN DEFAULT TRUE,
    play_sound BOOLEAN DEFAULT TRUE,
    trigger_frequency TEXT DEFAULT 'Only Once'
);

-- Enable RLS
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

-- Creating policies
DROP POLICY IF EXISTS "Users can view their own alerts" ON public.price_alerts;
CREATE POLICY "Users can view their own alerts"
    ON public.price_alerts
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own alerts" ON public.price_alerts;
CREATE POLICY "Users can create their own alerts"
    ON public.price_alerts
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own alerts" ON public.price_alerts;
CREATE POLICY "Users can update their own alerts"
    ON public.price_alerts
    FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own alerts" ON public.price_alerts;
CREATE POLICY "Users can delete their own alerts"
    ON public.price_alerts
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON public.price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_triggered ON public.price_alerts(triggered);
