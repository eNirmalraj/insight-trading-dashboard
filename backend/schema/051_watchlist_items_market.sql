-- 051_watchlist_items_market.sql
-- Phase 2 / Task 2.3 — Signal Engine Cleanup
-- Normalize watchlist_items symbols to Binance-native format.
-- Add explicit market column ('spot' | 'futures') replacing the .P suffix convention.

ALTER TABLE watchlist_items
    ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'futures';

-- Normalize: strip .P suffix (legacy futures marker)
UPDATE watchlist_items
   SET symbol = REPLACE(symbol, '.P', '')
 WHERE symbol LIKE '%.P';

-- Normalize: strip CCXT slash (BTC/USDT -> BTCUSDT)
UPDATE watchlist_items
   SET symbol = REPLACE(symbol, '/', '')
 WHERE symbol LIKE '%/%';

CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol_market
    ON watchlist_items (symbol, market);
