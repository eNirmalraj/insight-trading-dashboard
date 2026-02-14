-- Migration: 038_watchlist_crypto_risk
-- Description: Adds columns to support enhanced crypto risk management (Spot vs Futures, Auto-Leverage).

ALTER TABLE public.watchlists
ADD COLUMN IF NOT EXISTS market_type TEXT CHECK (market_type IN ('spot', 'futures', 'SPOT', 'FUTURES')),
ADD COLUMN IF NOT EXISTS risk_method TEXT DEFAULT 'fixed' CHECK (risk_method IN ('fixed', 'percent')),
ADD COLUMN IF NOT EXISTS auto_leverage_enabled BOOLEAN DEFAULT FALSE;
