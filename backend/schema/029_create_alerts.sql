-- Create alerts table for Signal Engine events
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    signal_id UUID REFERENCES public.signals(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('CREATED', 'ACTIVATED', 'CLOSED_TP', 'CLOSED_SL', 'CLOSED_MANUAL', 'CLOSED_OTHER')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL for system-wide broadcast alerts
    read BOOLEAN DEFAULT FALSE
);

-- Enable RLS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view system alerts and their own alerts"
    ON public.alerts
    FOR SELECT
    USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Service role can manage all alerts"
    ON public.alerts
    FOR ALL
    USING (auth.role() = 'service_role');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alerts_signal_id ON public.alerts(signal_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.alerts(created_at DESC);
