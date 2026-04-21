-- 066_broker_credentials_v2_extend.sql
-- Expand user_exchange_keys_v2 so it can hold every legacy broker credential shape.

BEGIN;

ALTER TABLE user_exchange_keys_v2
  ADD COLUMN IF NOT EXISTS environment text
      CHECK (environment IN ('testnet', 'live', 'mainnet', 'demo')),
  ADD COLUMN IF NOT EXISTS passphrase_encrypted bytea,
  ADD COLUMN IF NOT EXISTS mt5_login text,
  ADD COLUMN IF NOT EXISTS mt5_password_encrypted bytea,
  ADD COLUMN IF NOT EXISTS mt5_server text,
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS access_token_encrypted bytea,
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted bytea,
  ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_test_status text
      CHECK (last_test_status IS NULL OR last_test_status IN ('success', 'failed')),
  ADD COLUMN IF NOT EXISTS last_test_error text;

-- Expand broker check constraint to cover all 8 integrations.
-- The existing constraint from migration 061 covered 6 brokers
-- (binance, bybit, coinbase, kraken, oanda, zerodha); we now add bitget,
-- mt5, angelone, upstox, dhan, fyers and drop bybit/coinbase/kraken/oanda
-- which were never integrated. Drop and replace.
ALTER TABLE user_exchange_keys_v2
  DROP CONSTRAINT IF EXISTS user_exchange_keys_v2_broker_check;
ALTER TABLE user_exchange_keys_v2
  ADD CONSTRAINT user_exchange_keys_v2_broker_check CHECK (
    broker IN ('binance', 'bitget', 'mt5',
               'zerodha', 'angelone', 'upstox', 'dhan', 'fyers')
  );

COMMIT;
