-- 048_clear_old_signals.sql
-- Clear all old signals from the pre-watchlist scanner era
-- Starting fresh with the new watchlist-driven signal scanner

DELETE FROM signals;
