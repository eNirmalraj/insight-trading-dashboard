-- 021_fix_strategies_schema.sql

-- Add missing columns to strategies table if they don't exist
ALTER TABLE public.strategies 
    ADD COLUMN IF NOT EXISTS entry_rules JSONB,
    ADD COLUMN IF NOT EXISTS exit_rules JSONB,
    ADD COLUMN IF NOT EXISTS indicators JSONB;

-- Ensure symbol_scope is treated as JSONB if possible, or just leave it. 
-- The error was specific to entry_rules, so we prioritize that.
