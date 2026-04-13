-- 053_signals_dedupe_index.sql
-- Phase 2 / Task 2.5 — Signal Engine Cleanup
-- Add unique dedupe index on signals.
-- Prevents duplicate event rows for (strategy, params, symbol, timeframe, candle).
-- CRITICAL: run AFTER any data cleanup so it doesn't fail on existing duplicates.

-- Step 1: Backfill candle_time from created_at for existing rows.
UPDATE signals
   SET candle_time = created_at
 WHERE candle_time IS NULL;

-- Step 2: De-duplicate existing rows by keeping the earliest id per tuple.
DELETE FROM signals a
 USING signals b
 WHERE a.id > b.id
   AND a.strategy_id = b.strategy_id
   AND a.symbol = b.symbol
   AND a.timeframe = b.timeframe
   AND a.candle_time = b.candle_time
   AND COALESCE(a.params_snapshot, '{}'::jsonb) = COALESCE(b.params_snapshot, '{}'::jsonb);

-- Step 3: Add the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedupe
    ON signals (strategy_id, params_snapshot, symbol, timeframe, candle_time);

-- Step 4: Enforce NOT NULL now that data is populated.
ALTER TABLE signals ALTER COLUMN candle_time SET NOT NULL;
