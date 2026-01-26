-- Migration: Add Indicator Alert Support
-- This migration extends the price_alerts table to support indicator-based alerts
-- Indicators define alert conditions in their JSON schema which are evaluated by the engine

-- Add columns for indicator alerts
ALTER TABLE price_alerts 
ADD COLUMN IF NOT EXISTS indicator_id VARCHAR,
ADD COLUMN IF NOT EXISTS alert_condition_id VARCHAR,
ADD COLUMN IF NOT EXISTS condition_parameters JSONB;

-- Add index for faster queries on indicator alerts
CREATE INDEX IF NOT EXISTS idx_price_alerts_indicator 
ON price_alerts(indicator_id) 
WHERE indicator_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN price_alerts.indicator_id IS 'Reference to the indicator instance (from Strategy Studio)';
COMMENT ON COLUMN price_alerts.alert_condition_id IS 'The alertCondition ID from the indicator''s JSON definition';
COMMENT ON COLUMN price_alerts.condition_parameters IS 'User-provided parameter values (e.g., {"level": 70} for RSI threshold)';
