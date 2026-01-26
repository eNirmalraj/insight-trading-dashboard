-- 026_market_data_cache.sql
-- =============================================================================
-- Create market_data_cache table for frontend persistence
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.market_data_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    candle_time BIGINT NOT NULL, -- Unix timestamp in seconds or ms
    open NUMERIC(20, 8) NOT NULL,
    high NUMERIC(20, 8) NOT NULL,
    low NUMERIC(20, 8) NOT NULL,
    close NUMERIC(20, 8) NOT NULL,
    volume NUMERIC(20, 8) NOT NULL,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Composite unique key for upserts
    CONSTRAINT market_data_cache_key UNIQUE (symbol, timeframe, candle_time)
);

-- Enable RLS
ALTER TABLE public.market_data_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Authenticated users can read market cache" ON public.market_data_cache;
DROP POLICY IF EXISTS "Authenticated users can insert market cache" ON public.market_data_cache;
DROP POLICY IF EXISTS "Authenticated users can update market cache" ON public.market_data_cache;

-- Policies

-- 1. Read: Allow all authenticated users to read the cache
CREATE POLICY "Authenticated users can read market cache"
    ON public.market_data_cache FOR SELECT
    USING (auth.role() = 'authenticated');

-- 2. Insert: Allow authenticated users to add to cache (e.g. from frontend fetch)
CREATE POLICY "Authenticated users can insert market cache"
    ON public.market_data_cache FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- 3. Update: Allow authenticated users to update cache
CREATE POLICY "Authenticated users can update market cache"
    ON public.market_data_cache FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_market_cache_lookup 
    ON public.market_data_cache(symbol, timeframe, candle_time);

-- Grant permissions (if needed for anon access in future, currently only authenticated)
GRANT SELECT, INSERT, UPDATE ON public.market_data_cache TO authenticated;
