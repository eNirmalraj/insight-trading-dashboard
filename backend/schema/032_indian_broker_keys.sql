-- Add Indian broker support to user_exchange_keys table

-- 1. Expand exchange constraint
ALTER TABLE public.user_exchange_keys
    DROP CONSTRAINT IF EXISTS user_exchange_keys_exchange_check;

ALTER TABLE public.user_exchange_keys
    ADD CONSTRAINT user_exchange_keys_exchange_check
    CHECK (exchange IN (
        'binance', 'bitget', 'coinbase', 'kraken', 'mt5',
        'zerodha', 'angelone', 'upstox', 'dhan', 'fyers'
    ));

-- 2. Add Indian broker specific columns
ALTER TABLE public.user_exchange_keys
    ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS access_token TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT NULL;
