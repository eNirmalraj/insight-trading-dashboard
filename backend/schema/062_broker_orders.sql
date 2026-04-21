-- backend/schema/062_broker_orders.sql
-- One row per order leg placed on a broker (entry, SL, TP).
-- For paper broker: broker_order_id is NULL.

CREATE TABLE IF NOT EXISTS public.broker_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES public.signal_executions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    broker TEXT NOT NULL,
    broker_order_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    type TEXT NOT NULL CHECK (type IN ('MARKET', 'LIMIT', 'STOP_MARKET', 'TAKE_PROFIT_MARKET')),
    role TEXT NOT NULL CHECK (role IN ('ENTRY', 'SL', 'TP')),
    price NUMERIC,
    stop_price NUMERIC,
    qty NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Open', 'Filled', 'Cancelled', 'Rejected')),
    filled_qty NUMERIC DEFAULT 0,
    avg_fill_price NUMERIC,
    rejected_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_orders_execution
    ON public.broker_orders (execution_id);
CREATE INDEX IF NOT EXISTS idx_broker_orders_user_status
    ON public.broker_orders (user_id, status)
    WHERE status IN ('Pending', 'Open');

ALTER TABLE public.broker_orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own broker orders (platform orders with user_id NULL are visible to all authenticated)
CREATE POLICY "select_own_or_platform_broker_orders"
    ON public.broker_orders FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

-- Writes are done by service_role only (backend) — no user INSERT/UPDATE/DELETE policies.

DROP TRIGGER IF EXISTS on_broker_orders_updated ON public.broker_orders;
CREATE TRIGGER on_broker_orders_updated
    BEFORE UPDATE ON public.broker_orders
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
