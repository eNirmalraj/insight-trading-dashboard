-- 003_strategy_schema.sql

CREATE TABLE IF NOT EXISTS public.strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    timeframe TEXT NOT NULL,
    symbol_scope JSONB,
    entry_rules JSONB,
    exit_rules JSONB,
    indicators JSONB, -- Store indicator definitions too
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own strategies" ON public.strategies;
DROP POLICY IF EXISTS "Users can create own strategies" ON public.strategies;
DROP POLICY IF EXISTS "Users can update own strategies" ON public.strategies;
DROP POLICY IF EXISTS "Users can delete own strategies" ON public.strategies;

CREATE POLICY "Users can view own strategies" ON public.strategies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own strategies" ON public.strategies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strategies" ON public.strategies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own strategies" ON public.strategies FOR DELETE USING (auth.uid() = user_id);

-- Parameters Table
CREATE TABLE IF NOT EXISTS public.strategy_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'number',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.strategy_parameters ENABLE ROW LEVEL SECURITY;

-- Policies for params
DROP POLICY IF EXISTS "Users can view own strategy parameters" ON public.strategy_parameters;
DROP POLICY IF EXISTS "Users can create own strategy parameters" ON public.strategy_parameters;
DROP POLICY IF EXISTS "Users can update own strategy parameters" ON public.strategy_parameters;
DROP POLICY IF EXISTS "Users can delete own strategy parameters" ON public.strategy_parameters;

CREATE POLICY "Users can view own strategy parameters" ON public.strategy_parameters
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.strategies s WHERE s.id = strategy_parameters.strategy_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can create own strategy parameters" ON public.strategy_parameters
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.strategies s WHERE s.id = strategy_parameters.strategy_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can update own strategy parameters" ON public.strategy_parameters
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.strategies s WHERE s.id = strategy_parameters.strategy_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can delete own strategy parameters" ON public.strategy_parameters
    FOR DELETE USING (EXISTS (SELECT 1 FROM public.strategies s WHERE s.id = strategy_parameters.strategy_id AND s.user_id = auth.uid()));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_strategies_updated_at ON public.strategies;
CREATE TRIGGER set_strategies_updated_at
    BEFORE UPDATE ON public.strategies
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
