-- Migration: 036_paper_trades_risk_levels
-- Description: Adds columns to persist trade-specific risk levels (SL, TP, TSL) when the trade is created.
-- This allows supporting Manual Risk Override without affecting other trades or relying on strategy settings that might change.

ALTER TABLE public.paper_trades 
ADD COLUMN IF NOT EXISTS stop_loss NUMERIC,
ADD COLUMN IF NOT EXISTS take_profit NUMERIC,
ADD COLUMN IF NOT EXISTS trailing_stop_loss NUMERIC;
