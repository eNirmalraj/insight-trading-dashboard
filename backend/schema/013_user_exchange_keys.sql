-- Create table for storing user's exchange API keys
-- Ideally, secrets should be encrypted at application layer before storage
-- For this level, we enforce strict RLS.

CREATE TABLE IF NOT EXISTS public.user_exchange_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange TEXT NOT NULL CHECK (exchange IN ('binance', 'coinbase', 'kraken')), -- Expandable
    nickname TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL, -- In production, storing plain text secrets is risky. Recommend using Vault or Supabase Vault.
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, api_key) -- Prevent duplicate keys for same user
);

-- Enable Row Level Security
ALTER TABLE public.user_exchange_keys ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Users can view their own keys
CREATE POLICY "Users can view their own exchange keys" 
    ON public.user_exchange_keys FOR SELECT 
    USING (auth.uid() = user_id);

-- 2. Users can insert their own keys
CREATE POLICY "Users can insert their own exchange keys" 
    ON public.user_exchange_keys FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- 3. Users can update their own keys
CREATE POLICY "Users can update their own exchange keys" 
    ON public.user_exchange_keys FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. Users can delete their own keys
CREATE POLICY "Users can delete their own exchange keys" 
    ON public.user_exchange_keys FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS on_user_exchange_keys_updated ON public.user_exchange_keys;
CREATE TRIGGER on_user_exchange_keys_updated
    BEFORE UPDATE ON public.user_exchange_keys
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
