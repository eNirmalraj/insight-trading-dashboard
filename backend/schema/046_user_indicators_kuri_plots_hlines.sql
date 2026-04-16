-- Migration: Add kuri_plots and kuri_hlines JSONB columns to user_indicators
-- Description: Store full plot definitions and hline definitions so custom Kuri
--              indicators fully persist across page reloads (settings + style + hlines)
-- Version: 046

ALTER TABLE public.user_indicators
    ADD COLUMN IF NOT EXISTS kuri_plots JSONB,
    ADD COLUMN IF NOT EXISTS kuri_hlines JSONB;

COMMENT ON COLUMN public.user_indicators.kuri_plots IS 'JSONB array of plot definitions: [{title, color, linewidth, style}]';
COMMENT ON COLUMN public.user_indicators.kuri_hlines IS 'JSONB array of hline definitions: [{price, title, color}]';
