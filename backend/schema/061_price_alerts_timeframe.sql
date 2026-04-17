-- Add timeframe column to price_alerts for bar-close detection per-alert
-- Allows each alert to respect the chart timeframe at creation (1m, 5m, 15m, 1h, etc.)

ALTER TABLE price_alerts
    ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT '1m';

COMMENT ON COLUMN price_alerts.timeframe IS
    'Timeframe for bar-close detection (e.g. 1m, 5m, 15m, 1h, 4h, 1d). Used when trigger_frequency is Once Per Bar or Once Per Bar Close.';
