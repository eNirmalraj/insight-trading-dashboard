-- Migration: Strategy Signal Configuration
-- Tracks which strategies should generate signals and their target symbols/timeframes

CREATE TABLE IF NOT EXISTS strategy_signal_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    is_signal_enabled BOOLEAN DEFAULT true,
    target_symbols TEXT[] DEFAULT '{}',
    target_timeframes TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(strategy_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_strategy_signal_config_strategy ON strategy_signal_config(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_signal_config_enabled ON strategy_signal_config(is_signal_enabled);

-- Add comments
COMMENT ON TABLE strategy_signal_config IS 'Configuration for which strategies should generate signals';
COMMENT ON COLUMN strategy_signal_config.is_signal_enabled IS 'Whether this strategy should generate signals';
COMMENT ON COLUMN strategy_signal_config.target_symbols IS 'Array of symbols to monitor (e.g., [BTCUSDT, EURUSD]). Empty array means all symbols.';
COMMENT ON COLUMN strategy_signal_config.target_timeframes IS 'Array of timeframes to monitor (e.g., [1H, 4H]). Empty array means all timeframes.';
