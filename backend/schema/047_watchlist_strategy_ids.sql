-- 047_watchlist_strategy_ids.sql
-- Add strategy_ids array to watchlists for multi-strategy assignment
-- Add watchlist_id FK to signals for watchlist-based filtering

-- 1. Add strategy_ids to watchlists
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS strategy_ids text[] DEFAULT '{}';

-- 2. Add watchlist_id to signals
ALTER TABLE signals ADD COLUMN IF NOT EXISTS watchlist_id uuid REFERENCES watchlists(id) ON DELETE SET NULL;

-- 3. Index for faster signal lookups by watchlist
CREATE INDEX IF NOT EXISTS idx_signals_watchlist_id ON signals(watchlist_id);
