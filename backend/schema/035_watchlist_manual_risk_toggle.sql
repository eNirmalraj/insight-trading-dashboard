-- Migration: 035_watchlist_manual_risk_toggle
-- Description: Adds manual_risk_enabled column to watchlists table to allow overriding strategy risk settings.

ALTER TABLE public.watchlists 
ADD COLUMN IF NOT EXISTS manual_risk_enabled BOOLEAN DEFAULT FALSE;
