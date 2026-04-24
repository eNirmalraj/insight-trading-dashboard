-- Migration: Rename Binance environment from 'testnet' to 'demo'
-- Context: Binance now offers a unified Demo Trading portal at demo.binance.com.
-- The old standalone testnet (testnet.binancefuture.com) is deprecated.
-- We're dropping support for it entirely and routing all sandbox traffic to
-- demo-fapi.binance.com. Bitget testnet rows are NOT touched -- only Binance.

-- 1. Drop the existing CHECK constraint so we can update rows freely
ALTER TABLE public.user_exchange_keys
    DROP CONSTRAINT IF EXISTS user_exchange_keys_environment_check;

-- 2. Rename Binance 'testnet' rows to 'demo'
UPDATE public.user_exchange_keys
SET environment = 'demo'
WHERE exchange = 'binance' AND environment = 'testnet';

-- 3. Re-add the CHECK constraint with the widened allowed set.
--    'testnet' stays in the allowed set because Bitget rows may still use it.
ALTER TABLE public.user_exchange_keys
    ADD CONSTRAINT user_exchange_keys_environment_check
    CHECK (environment IN ('live', 'demo', 'testnet'));
