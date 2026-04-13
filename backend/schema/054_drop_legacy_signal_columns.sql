-- 054_drop_legacy_signal_columns.sql
-- Phase 5 / Task 5.1 — Signal Engine Cleanup
-- IRREVERSIBLE. Run ONLY after Phase 4 has been verified in production for 24+ hours
-- AND a full DB backup has been taken via the Supabase dashboard.
--
-- Drops all legacy columns whose responsibility has moved to other tables:
--   - signals: execution-state columns move to signal_executions
--   - signals: denormalized text columns replaced by joins
--   - watchlists: strategy_ids array replaced by watchlist_strategies table

-- Drop watchlists.strategy_ids (moved to watchlist_strategies)
ALTER TABLE watchlists DROP COLUMN IF EXISTS strategy_ids;

-- Drop execution state from signals (moved to signal_executions)
ALTER TABLE signals DROP COLUMN IF EXISTS stop_loss;
ALTER TABLE signals DROP COLUMN IF EXISTS take_profit;
ALTER TABLE signals DROP COLUMN IF EXISTS status;
ALTER TABLE signals DROP COLUMN IF EXISTS closed_at;
ALTER TABLE signals DROP COLUMN IF EXISTS activated_at;
ALTER TABLE signals DROP COLUMN IF EXISTS close_reason;
ALTER TABLE signals DROP COLUMN IF EXISTS profit_loss;
ALTER TABLE signals DROP COLUMN IF EXISTS risk_reward_ratio;

-- Drop denormalized/legacy columns from signals
-- 'strategy' (text) was the strategy name — now derivable via join to scripts
-- 'strategy_category' — same reason
-- 'entry_type' — always 'market' for our engine
-- 'is_pinned' — execution-level concern, move to signal_executions if needed later
-- 'watchlist_id' — execution-level, moved to signal_executions.watchlist_strategy_id
-- 'user_id' — execution-level, moved to signal_executions.user_id
ALTER TABLE signals DROP COLUMN IF EXISTS strategy;
ALTER TABLE signals DROP COLUMN IF EXISTS strategy_category;
ALTER TABLE signals DROP COLUMN IF EXISTS entry_type;
ALTER TABLE signals DROP COLUMN IF EXISTS is_pinned;
ALTER TABLE signals DROP COLUMN IF EXISTS watchlist_id;
ALTER TABLE signals DROP COLUMN IF EXISTS user_id;
