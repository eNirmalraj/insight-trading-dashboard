-- 050_watchlist_strategies.sql
-- Phase 2 / Task 2.2 — Signal Engine Cleanup
-- Per-assignment strategy configuration table.
-- Replaces watchlists.strategy_ids with a richer model supporting params,
-- risk settings, and per-assignment error tracking.

CREATE TABLE IF NOT EXISTS watchlist_strategies (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id       uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    strategy_id        uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    params             jsonb NOT NULL DEFAULT '{}'::jsonb,
    timeframe          text NOT NULL DEFAULT '1H',
    risk_settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error         text,
    last_error_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_strategies_wl
    ON watchlist_strategies (watchlist_id);

CREATE INDEX IF NOT EXISTS idx_watchlist_strategies_strategy
    ON watchlist_strategies (strategy_id);

-- Enable Realtime for Supabase Realtime subscriptions (Issue #5 fix)
ALTER PUBLICATION supabase_realtime ADD TABLE watchlist_strategies;

-- Backfill from existing watchlists.strategy_ids arrays.
-- Each strategy_id becomes one row with empty params and default timeframe.
INSERT INTO watchlist_strategies (watchlist_id, strategy_id, params, timeframe)
SELECT
    w.id AS watchlist_id,
    strategy_id_text::uuid AS strategy_id,
    '{}'::jsonb AS params,
    COALESCE(w.execution_timeframes[1], '1H') AS timeframe
FROM watchlists w,
     unnest(w.strategy_ids) AS strategy_id_text
WHERE w.strategy_ids IS NOT NULL
  AND array_length(w.strategy_ids, 1) > 0
  AND EXISTS (
      SELECT 1 FROM scripts s WHERE s.id = strategy_id_text::uuid
  )
ON CONFLICT DO NOTHING;
