-- Migration: 037_restore_paper_trading_accounts
-- Description: Restores/Documents the paper_trading_accounts table which is used for portfolio balance tracking.
-- This table exists in production but was missing from the local schema definitions.

CREATE TABLE IF NOT EXISTS public.paper_trading_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth.users or profiles, constraint might be missing in prod but good to have
    name TEXT NOT NULL,
    broker TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    balance NUMERIC NOT NULL DEFAULT 10000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attempt to add foreign key if it validates (optional, based on my best guess of intended schema)
-- ALTER TABLE public.paper_trading_accounts 
-- ADD CONSTRAINT fk_paper_trading_accounts_user 
-- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
