-- backend/schema/065_broker_network.sql
-- Add network (testnet|mainnet) to user_exchange_keys_v2 so one user can
-- have both a Binance testnet key and a Binance mainnet key.

ALTER TABLE public.user_exchange_keys_v2
    ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'mainnet'
    CHECK (network IN ('testnet', 'mainnet'));

CREATE INDEX IF NOT EXISTS idx_user_exchange_keys_v2_user_broker_network
    ON public.user_exchange_keys_v2 (user_id, broker, network)
    WHERE is_active = TRUE;
