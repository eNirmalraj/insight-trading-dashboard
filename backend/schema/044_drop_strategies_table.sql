-- 044_drop_strategies_table.sql

-- Drop the old parameter table
DROP TABLE IF EXISTS public.strategy_parameters CASCADE;

-- Drop the strategies table
DROP TABLE IF EXISTS public.strategies CASCADE;
