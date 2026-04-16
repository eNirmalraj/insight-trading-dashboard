-- Upgrade user_exchange_keys table for Broker Connect v2
-- Adds: bitget support, passphrase, environment, permissions, test tracking

-- 1. Expand exchange check constraint to include bitget
ALTER TABLE public.user_exchange_keys
    DROP CONSTRAINT IF EXISTS user_exchange_keys_exchange_check;

ALTER TABLE public.user_exchange_keys
    ADD CONSTRAINT user_exchange_keys_exchange_check
    CHECK (exchange IN ('binance', 'bitget', 'coinbase', 'kraken'));

-- 2. Add new columns
ALTER TABLE public.user_exchange_keys
    ADD COLUMN IF NOT EXISTS passphrase TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'testnet'
        CHECK (environment IN ('live', 'testnet')),
    ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_test_status TEXT DEFAULT NULL
        CHECK (last_test_status IN ('success', 'failed', NULL));

-- 3. Index for quick lookups by user + active status
CREATE INDEX IF NOT EXISTS idx_exchange_keys_user_active
    ON public.user_exchange_keys (user_id, is_active)
    WHERE is_active = TRUE;
