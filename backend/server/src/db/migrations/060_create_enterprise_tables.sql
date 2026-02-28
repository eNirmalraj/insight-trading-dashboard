
-- Phase 12: Enterprise Audit and Portfolio Tables
-- Migration 060: Create audit_trades table
CREATE TABLE IF NOT EXISTS audit_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    script_id UUID NOT NULL REFERENCES scripts(id),
    symbol VARCHAR(50) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    quantity DECIMAL(18, 8) NOT NULL,
    price DECIMAL(18, 8) NOT NULL,
    pnl DECIMAL(18, 2),
    regulatory_flags JSONB DEFAULT '{}'::jsonb,
    risk_score DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_trades(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_symbol ON audit_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_audit_script ON audit_trades(script_id);

-- Portfolio positions table
CREATE TABLE IF NOT EXISTS portfolio_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    script_id UUID REFERENCES scripts(id),
    symbol VARCHAR(50) NOT NULL,
    quantity DECIMAL(18, 8) NOT NULL,
    entry_price DECIMAL(18, 8) NOT NULL,
    current_price DECIMAL(18, 8),
    current_pnl DECIMAL(18, 2),
    side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    closed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED'))
);

-- Create indexes for portfolio queries
CREATE INDEX IF NOT EXISTS idx_portfolio_user_status ON portfolio_positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON portfolio_positions(symbol);

-- User quotas table
CREATE TABLE IF NOT EXISTS user_quotas (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    tier VARCHAR(20) NOT NULL DEFAULT 'FREE' CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE')),
    max_scripts INT NOT NULL DEFAULT 5,
    max_backtests INT NOT NULL DEFAULT 10,
    max_execution_time_ms BIGINT NOT NULL DEFAULT 60000,
    allowed_symbols JSONB DEFAULT '["BTC/USDT", "ETH/USDT"]'::jsonb,
    can_publish_scripts BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create default quotas for existing users
INSERT INTO user_quotas (user_id, tier)
SELECT id, 'FREE' 
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_quotas)
ON CONFLICT (user_id) DO NOTHING;
