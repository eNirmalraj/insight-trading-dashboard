-- 043_migrate_strategy_data.sql

-- 1. Insert data from strategies to scripts, preserving IDs
INSERT INTO public.scripts (id, user_id, name, source_code, script_type, configuration, description, is_active, created_at, updated_at)
SELECT 
    id, 
    user_id, 
    name, 
    COALESCE(kuri_script, ''), -- Use the existing raw Kuri Script text if any
    COALESCE(type, 'STRATEGY'),
    COALESCE(content, '{}'::jsonb),
    description,
    is_active,
    created_at,
    updated_at
FROM public.strategies
WHERE user_id IS NOT NULL -- The scripts table requires user_id
ON CONFLICT (id) DO NOTHING;

-- 2. Remap Foreign Keys from strategies to scripts

-- signals
ALTER TABLE public.signals DROP CONSTRAINT IF EXISTS signals_strategy_id_fkey;
ALTER TABLE public.signals DROP CONSTRAINT IF EXISTS fk_signals_strategy;
ALTER TABLE public.signals ADD CONSTRAINT signals_script_id_fkey FOREIGN KEY (strategy_id) REFERENCES public.scripts(id) ON DELETE SET NULL;

-- paper_trades
ALTER TABLE public.paper_trades DROP CONSTRAINT IF EXISTS paper_trades_strategy_id_fkey;
ALTER TABLE public.paper_trades ADD CONSTRAINT paper_trades_script_id_fkey FOREIGN KEY (strategy_id) REFERENCES public.scripts(id) ON DELETE CASCADE;

-- strategy_signal_config
ALTER TABLE public.strategy_signal_config DROP CONSTRAINT IF EXISTS strategy_signal_config_strategy_id_fkey;
ALTER TABLE public.strategy_signal_config ADD CONSTRAINT strategy_signal_config_script_id_fkey FOREIGN KEY (strategy_id) REFERENCES public.scripts(id) ON DELETE CASCADE;

-- user_strategy_indicators
ALTER TABLE public.user_strategy_indicators DROP CONSTRAINT IF EXISTS user_strategy_indicators_strategy_id_fkey;
ALTER TABLE public.user_strategy_indicators ADD CONSTRAINT user_strategy_indicators_script_id_fkey FOREIGN KEY (strategy_id) REFERENCES public.scripts(id) ON DELETE CASCADE;

