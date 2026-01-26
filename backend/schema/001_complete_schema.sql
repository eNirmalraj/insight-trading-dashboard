-- =============================================================================
-- INSIGHT TRADING - POSTGRESQL SCHEMA FOR SUPABASE
-- =============================================================================
-- This schema is IDEMPOTENT - safe to run multiple times
-- =============================================================================
--
-- Database Schema Overview:
--
-- ┌─────────────────┐       ┌─────────────────┐
-- │   auth.users    │       │     signals     │
-- │  (Supabase)     │       │  (Global Read)  │
-- └────────┬────────┘       └─────────────────┘
--          │
--          │ 1:1 (auto-created via trigger)
--          ▼
-- ┌─────────────────┐
-- │    profiles     │
-- │   (User Data)   │
-- └────────┬────────┘
--          │
--          │ 1:N
--          ├─────────────────────────────────┐
--          ▼                                 ▼
-- ┌─────────────────┐               ┌─────────────────┐
-- │   watchlists    │               │   positions     │
-- │  (User Owned)   │               │  (User Owned)   │
-- └────────┬────────┘               └─────────────────┘
--          │
--          │ 1:N
--          ▼
-- ┌─────────────────┐
-- │ watchlist_items │
-- │  (Watchlist)    │
-- └─────────────────┘
--
-- =============================================================================

-- 001_profiles.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    plan TEXT DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- =============================================================================
-- 002_watchlists.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('forex', 'crypto', 'Forex', 'Crypto')),
    strategy_type TEXT,
    is_auto_trade_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own watchlists" ON public.watchlists;
DROP POLICY IF EXISTS "Users can create own watchlists" ON public.watchlists;
DROP POLICY IF EXISTS "Users can update own watchlists" ON public.watchlists;
DROP POLICY IF EXISTS "Users can delete own watchlists" ON public.watchlists;

CREATE POLICY "Users can view own watchlists"
    ON public.watchlists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own watchlists"
    ON public.watchlists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlists"
    ON public.watchlists FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlists"
    ON public.watchlists FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON public.watchlists(user_id);

-- =============================================================================
-- 003_watchlist_items.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    price NUMERIC(20, 8) DEFAULT 0,
    change NUMERIC(20, 8) DEFAULT 0,
    percent_change NUMERIC(10, 4) DEFAULT 0,
    pnl NUMERIC(20, 8) DEFAULT 0,
    auto_trade_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'watchlist_items_watchlist_id_symbol_key'
    ) THEN
        ALTER TABLE public.watchlist_items ADD CONSTRAINT watchlist_items_watchlist_id_symbol_key UNIQUE(watchlist_id, symbol);
    END IF;
END $$;

ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own watchlist items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Users can create own watchlist items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Users can update own watchlist items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Users can delete own watchlist items" ON public.watchlist_items;

CREATE POLICY "Users can view own watchlist items"
    ON public.watchlist_items FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.watchlists
        WHERE watchlists.id = watchlist_items.watchlist_id
        AND watchlists.user_id = auth.uid()
    ));

CREATE POLICY "Users can create own watchlist items"
    ON public.watchlist_items FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.watchlists
        WHERE watchlists.id = watchlist_items.watchlist_id
        AND watchlists.user_id = auth.uid()
    ));

CREATE POLICY "Users can update own watchlist items"
    ON public.watchlist_items FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.watchlists
        WHERE watchlists.id = watchlist_items.watchlist_id
        AND watchlists.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.watchlists
        WHERE watchlists.id = watchlist_items.watchlist_id
        AND watchlists.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete own watchlist items"
    ON public.watchlist_items FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM public.watchlists
        WHERE watchlists.id = watchlist_items.watchlist_id
        AND watchlists.user_id = auth.uid()
    ));

CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON public.watchlist_items(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON public.watchlist_items(symbol);

-- =============================================================================
-- 004_positions.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    account TEXT CHECK (account IN ('Forex', 'Binance', 'forex', 'binance')),
    direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell', 'BUY', 'SELL')),
    quantity NUMERIC(20, 8) DEFAULT 0,
    entry_price NUMERIC(20, 8) NOT NULL,
    stop_loss NUMERIC(20, 8),
    take_profit NUMERIC(20, 8),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending', 'Open', 'Closed', 'Pending')),
    pnl NUMERIC(20, 8) DEFAULT 0,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can create own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can update own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can delete own positions" ON public.positions;

CREATE POLICY "Users can view own positions"
    ON public.positions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own positions"
    ON public.positions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own positions"
    ON public.positions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own positions"
    ON public.positions FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_positions_user_id ON public.positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON public.positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON public.positions(symbol);

-- =============================================================================
-- 005_signals.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,
    strategy TEXT NOT NULL,
    strategy_category TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell', 'BUY', 'SELL')),
    entry_price NUMERIC(20, 8) NOT NULL,
    entry_type TEXT DEFAULT 'market' CHECK (entry_type IN ('market', 'limit', 'stop', 'Market', 'Limit', 'Stop')),
    stop_loss NUMERIC(20, 8),
    take_profit NUMERIC(20, 8),
    timeframe TEXT CHECK (timeframe IN ('5m', '15m', '30m', '1H', '4H', '1D')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'closed', 'Pending', 'Active', 'Closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signals are viewable by all authenticated users" ON public.signals;
DROP POLICY IF EXISTS "Service role can insert signals" ON public.signals;
DROP POLICY IF EXISTS "Service role can update signals" ON public.signals;

CREATE POLICY "Signals are viewable by all authenticated users"
    ON public.signals FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert signals"
    ON public.signals FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update signals"
    ON public.signals FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_signals_status ON public.signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON public.signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON public.signals(created_at DESC);

-- =============================================================================
-- 006_triggers.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 007_updated_at_triggers.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_watchlists_updated_at ON public.watchlists;
CREATE TRIGGER set_watchlists_updated_at
    BEFORE UPDATE ON public.watchlists
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_watchlist_items_updated_at ON public.watchlist_items;
CREATE TRIGGER set_watchlist_items_updated_at
    BEFORE UPDATE ON public.watchlist_items
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_positions_updated_at ON public.positions;
CREATE TRIGGER set_positions_updated_at
    BEFORE UPDATE ON public.positions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_signals_updated_at ON public.signals;
CREATE TRIGGER set_signals_updated_at
    BEFORE UPDATE ON public.signals
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.positions TO authenticated;
GRANT SELECT ON public.signals TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
