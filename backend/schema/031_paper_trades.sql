-- Create paper_trades table for simulated execution
CREATE TABLE IF NOT EXISTS public.paper_trades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    signal_id UUID REFERENCES public.signals(id),
    strategy_id UUID REFERENCES public.strategies(id),
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
    entry_price NUMERIC NOT NULL,
    quantity NUMERIC NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
    exit_price NUMERIC,
    pnl NUMERIC,
    pnl_percent NUMERIC,
    exit_reason TEXT CHECK (exit_reason IN ('TP', 'SL', 'MANUAL')),
    filled_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own paper trades"
    ON public.paper_trades FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own paper trades"
    ON public.paper_trades FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own paper trades"
    ON public.paper_trades FOR UPDATE
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_paper_trades_user_id ON public.paper_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_symbol ON public.paper_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON public.paper_trades(status);
