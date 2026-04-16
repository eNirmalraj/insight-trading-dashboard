
-- Create script_executions table for tracking backtest/execution history
CREATE TABLE IF NOT EXISTS script_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID REFERENCES scripts(id),
    symbol VARCHAR(50),
    timeframe VARCHAR(10),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMP WITH TIME ZONE,
    result JSONB, -- Stores execution metrics/results
    
    -- Index for optimized lookup of executions by script and time
    CONSTRAINT fk_script FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);

-- Optimize for historical queries by script
CREATE INDEX IF NOT EXISTS idx_executions_script_started ON script_executions(script_id, started_at DESC);
