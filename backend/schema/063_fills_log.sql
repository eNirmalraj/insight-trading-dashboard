-- backend/schema/063_fills_log.sql
-- Immutable audit trail of every fill event from the broker.

CREATE TABLE IF NOT EXISTS public.fills_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_order_id UUID REFERENCES public.broker_orders(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES public.signal_executions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    fill_qty NUMERIC NOT NULL,
    fill_price NUMERIC NOT NULL,
    is_maker BOOLEAN,
    commission NUMERIC,
    commission_asset TEXT,
    raw_event JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fills_log_execution ON public.fills_log (execution_id);
CREATE INDEX IF NOT EXISTS idx_fills_log_user_created ON public.fills_log (user_id, created_at DESC);

ALTER TABLE public.fills_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_or_platform_fills"
    ON public.fills_log FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

-- Immutable: no UPDATE or DELETE policy. service_role only inserts.
