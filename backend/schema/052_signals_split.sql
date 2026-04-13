-- 052_signals_split.sql
-- Phase 2 / Task 2.4 — Signal Engine Cleanup
-- Split the signals table into immutable events (signals) and per-user executions
-- (signal_executions). This migration is ADDITIVE — the original signals columns
-- remain in place through Phase 4. Phase 5 (migration 054) drops the legacy columns.

-- Step 1: Add new columns to signals for the event-only form.
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'futures',
    ADD COLUMN IF NOT EXISTS candle_time timestamptz,
    ADD COLUMN IF NOT EXISTS params_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS template_version text;

-- Normalize existing symbol values (same as watchlist_items migration).
UPDATE signals
   SET symbol = REPLACE(REPLACE(symbol, '.P', ''), '/', '')
 WHERE symbol LIKE '%.P'
    OR symbol LIKE '%/%';

-- Step 2: Create signal_executions table.
CREATE TABLE IF NOT EXISTS signal_executions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id               uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    watchlist_strategy_id   uuid REFERENCES watchlist_strategies(id) ON DELETE SET NULL,
    user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Copied from signal at creation
    symbol                  text NOT NULL,
    market                  text NOT NULL DEFAULT 'futures',
    direction               text NOT NULL,
    entry_price             numeric NOT NULL,
    timeframe               text NOT NULL,

    -- Computed from watchlist_strategies.risk_settings
    stop_loss               numeric,
    take_profit             numeric,
    lot_size                numeric,
    leverage                int,

    -- Lifecycle
    status                  text NOT NULL DEFAULT 'Active',
    closed_at               timestamptz,
    close_reason            text,
    close_price             numeric,
    profit_loss             numeric,

    -- Broker dispatch
    broker                  text NOT NULL DEFAULT 'paper',
    broker_order_id         text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_executions_user_status
    ON signal_executions (user_id, status) WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_signal_executions_symbol_active
    ON signal_executions (symbol, status) WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_signal_executions_signal
    ON signal_executions (signal_id);

-- Realtime publication for live updates (e.g. execution status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE signal_executions;

-- Step 3: Backfill signal_executions from existing signals rows.
-- Each legacy signal row becomes one execution.
-- The signal row itself keeps its old columns until Phase 5 cleanup.
INSERT INTO signal_executions
    (id, signal_id, user_id, symbol, market, direction, entry_price, timeframe,
     stop_loss, take_profit, status, closed_at, close_reason, profit_loss,
     created_at, updated_at, broker)
SELECT
    gen_random_uuid(),
    s.id,
    s.user_id,
    s.symbol,
    'futures',
    s.direction,
    s.entry_price,
    s.timeframe,
    s.stop_loss,
    s.take_profit,
    COALESCE(s.status, 'Closed'),
    s.closed_at,
    s.close_reason,
    s.profit_loss,
    s.created_at,
    COALESCE(s.activated_at, s.created_at),
    'paper'
FROM signals s
WHERE NOT EXISTS (
    SELECT 1 FROM signal_executions se WHERE se.signal_id = s.id
);
