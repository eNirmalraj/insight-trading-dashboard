-- 054_drop_legacy_signal_columns.sql
-- Phase 5 / Task 5.1 — Signal Engine Cleanup
-- IRREVERSIBLE. Run ONLY after Phase 4 has been verified in production for 24+ hours
-- AND a full DB backup has been taken via the Supabase dashboard.

-- Drop watchlists.strategy_ids (moved to watchlist_strategies)
ALTER TABLE watchlists DROP COLUMN IF EXISTS strategy_ids;

-- Drop execution state columns from signals (moved to signal_executions)
ALTER TABLE signals DROP COLUMN IF EXISTS stop_loss;
ALTER TABLE signals DROP COLUMN IF EXISTS take_profit;
ALTER TABLE signals DROP COLUMN IF EXISTS status;
ALTER TABLE signals DROP COLUMN IF EXISTS closed_at;
ALTER TABLE signals DROP COLUMN IF EXISTS close_reason;
ALTER TABLE signals DROP COLUMN IF EXISTS profit_loss;
ALTER TABLE signals DROP COLUMN IF EXISTS activated_at;
ALTER TABLE signals DROP COLUMN IF EXISTS user_id;
