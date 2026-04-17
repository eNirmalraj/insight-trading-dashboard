-- Add MT5 support to user_exchange_keys table

-- 1. Expand exchange check constraint to include mt5
ALTER TABLE public.user_exchange_keys
    DROP CONSTRAINT IF EXISTS user_exchange_keys_exchange_check;

ALTER TABLE public.user_exchange_keys
    ADD CONSTRAINT user_exchange_keys_exchange_check
    CHECK (exchange IN ('binance', 'bitget', 'coinbase', 'kraken', 'mt5'));

-- 2. Add MT5-specific columns
ALTER TABLE public.user_exchange_keys
    ADD COLUMN IF NOT EXISTS mt5_login TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mt5_password TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mt5_server TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mt5_account_id TEXT DEFAULT NULL;
