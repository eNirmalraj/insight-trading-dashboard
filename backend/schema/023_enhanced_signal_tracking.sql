-- Migration: Enhanced Signal Tracking
-- Adds columns for better signal lifecycle management and performance tracking

-- Add new columns to signals table for enhanced tracking
ALTER TABLE signals 
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS close_reason TEXT,
ADD COLUMN IF NOT EXISTS profit_loss FLOAT,
ADD COLUMN IF NOT EXISTS risk_reward_ratio FLOAT;

-- Add index for faster querying by status
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);

-- Add index for faster querying by strategy_id
CREATE INDEX IF NOT EXISTS idx_signals_strategy_id ON signals(strategy_id);

-- Add index for faster querying by symbol and created_at
CREATE INDEX IF NOT EXISTS idx_signals_symbol_created ON signals(symbol, created_at DESC);

-- Add comment
COMMENT ON COLUMN signals.activated_at IS 'Timestamp when signal status changed from PENDING to ACTIVE';
COMMENT ON COLUMN signals.closed_at IS 'Timestamp when signal was closed';
COMMENT ON COLUMN signals.close_reason IS 'Reason for closing: TP (take profit), SL (stop loss), MANUAL, TIMEOUT';
COMMENT ON COLUMN signals.profit_loss IS 'Profit or loss in percentage';
COMMENT ON COLUMN signals.risk_reward_ratio IS 'Calculated risk/reward ratio';
