-- Migration: Add Kuri script metadata columns to user_indicators
-- Description: Store Kuri script source, input definitions, and plot title
--              so KURI_LINE indicators persist and recalculate across page reloads
-- Version: 045

-- Add kuri-specific columns (all nullable — only populated for KURI_LINE indicators)
ALTER TABLE public.user_indicators
    ADD COLUMN IF NOT EXISTS kuri_script TEXT,
    ADD COLUMN IF NOT EXISTS kuri_input_defs JSONB,
    ADD COLUMN IF NOT EXISTS kuri_plot_title TEXT;

-- Drop the old unique constraint that doesn't account for kuri scripts
-- (two KURI_LINE indicators with different scripts but same settings would collide)
ALTER TABLE public.user_indicators
    DROP CONSTRAINT IF EXISTS unique_user_indicator;

-- Index for quickly finding all Kuri indicators for a user
CREATE INDEX IF NOT EXISTS idx_user_indicators_kuri
    ON public.user_indicators(user_id, symbol, timeframe)
    WHERE kuri_script IS NOT NULL;

COMMENT ON COLUMN public.user_indicators.kuri_script IS 'Full Kuri source code for KURI_LINE indicators';
COMMENT ON COLUMN public.user_indicators.kuri_input_defs IS 'JSONB array of input definitions extracted from the Kuri script';
COMMENT ON COLUMN public.user_indicators.kuri_plot_title IS 'Display title for the Kuri plot';
