-- backend/schema/061_user_exchange_keys_v2.sql
-- Vault-encrypted exchange credentials. Supersedes user_exchange_keys.

CREATE EXTENSION IF NOT EXISTS pgsodium;

CREATE TABLE IF NOT EXISTS public.user_exchange_keys_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    broker TEXT NOT NULL CHECK (broker IN ('binance', 'bybit', 'coinbase', 'kraken', 'oanda', 'zerodha')),
    nickname TEXT NOT NULL,
    api_key_encrypted BYTEA NOT NULL,
    api_secret_encrypted BYTEA NOT NULL,
    nonce BYTEA NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_exchange_keys_v2_user_broker
    ON public.user_exchange_keys_v2 (user_id, broker)
    WHERE is_active = TRUE;

ALTER TABLE public.user_exchange_keys_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_v2"
    ON public.user_exchange_keys_v2 FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "insert_own_v2"
    ON public.user_exchange_keys_v2 FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_v2"
    ON public.user_exchange_keys_v2 FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_v2"
    ON public.user_exchange_keys_v2 FOR DELETE
    USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_user_exchange_keys_v2_updated ON public.user_exchange_keys_v2;
CREATE TRIGGER on_user_exchange_keys_v2_updated
    BEFORE UPDATE ON public.user_exchange_keys_v2
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
