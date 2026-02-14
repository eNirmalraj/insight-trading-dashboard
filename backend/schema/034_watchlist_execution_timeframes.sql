-- Add execution_timeframes column to watchlists table
ALTER TABLE public.watchlists
ADD COLUMN IF NOT EXISTS execution_timeframes text[] DEFAULT NULL;

-- Comment on column
COMMENT ON COLUMN public.watchlists.execution_timeframes IS 'Array of timeframes (e.g. ["1m", "5m"]) allowed for auto-execution. NULL means all timeframes allowed.';
