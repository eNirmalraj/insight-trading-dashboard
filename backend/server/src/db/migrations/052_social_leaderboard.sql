-- Migration: 052_social_leaderboard
-- Description: Adds tables for social features (Reports, Forks) and Leaderboard backing store (Backtest Results)

-- 1. Script Reports
CREATE TABLE IF NOT EXISTS script_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES scripts(id),
    reporter_id UUID NOT NULL REFERENCES auth.users(id),
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'bug', 'plagiarism', 'other')),
    details TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Script Suggestions
CREATE TABLE IF NOT EXISTS script_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES scripts(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'planned', 'implemented', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Forks (Tracking branching)
-- Note: 'forks' count is already on marketplace_listings, but we need to track relationship
CREATE TABLE IF NOT EXISTS script_forks (
    original_script_id UUID NOT NULL REFERENCES scripts(id),
    forked_script_id UUID NOT NULL REFERENCES scripts(id),
    forked_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (original_script_id, forked_script_id)
);

-- 4. Backtest Results (For Sharpe Leaderboard)
CREATE TABLE IF NOT EXISTS backtest_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES scripts(id),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    total_trades INTEGER,
    win_rate NUMERIC,
    sharpe_ratio NUMERIC,
    max_drawdown NUMERIC,
    total_return_percent NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    
    -- Ensure we only keep the 'best' or 'latest' representative result per script for leaderboard
    -- Or we can just query the max sharpe per script
    INDEX idx_backtest_sharpe (sharpe_ratio DESC)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_status ON script_reports(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_script ON script_suggestions(script_id);
