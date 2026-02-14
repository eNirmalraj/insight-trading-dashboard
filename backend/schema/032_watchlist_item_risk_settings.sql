-- Add Risk Management Columns to Watchlist Items
ALTER TABLE public.watchlist_items 
ADD COLUMN IF NOT EXISTS lot_size NUMERIC DEFAULT 0.01,
ADD COLUMN IF NOT EXISTS risk_percent NUMERIC DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS take_profit_distance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS stop_loss_distance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS trailing_stop_loss_distance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS leverage NUMERIC DEFAULT 1;

-- Add comment for documentation
COMMENT ON COLUMN public.watchlist_items.lot_size IS 'Lot size for Forex or fixed quantity for Crypto';
COMMENT ON COLUMN public.watchlist_items.risk_percent IS 'Desired risk percentage per trade based on account balance';
COMMENT ON COLUMN public.watchlist_items.take_profit_distance IS 'Distance from entry for TP (pips for Forex, points/percent for Crypto)';
COMMENT ON COLUMN public.watchlist_items.stop_loss_distance IS 'Distance from entry for SL (pips for Forex, points/percent for Crypto)';
COMMENT ON COLUMN public.watchlist_items.trailing_stop_loss_distance IS 'Trailing stop distance';
COMMENT ON COLUMN public.watchlist_items.leverage IS 'Leverage to use for Crypto trades';
