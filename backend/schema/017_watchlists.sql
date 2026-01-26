-- Create Watchlists Table
CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    strategy_type TEXT,
    is_auto_trade_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for watchlists
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

-- Create policies for watchlists
CREATE POLICY "Users can view their own watchlists"
    ON public.watchlists
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watchlists"
    ON public.watchlists
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlists"
    ON public.watchlists
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlists"
    ON public.watchlists
    FOR DELETE
    USING (auth.uid() = user_id);


-- Create Watchlist Items Table
CREATE TABLE IF NOT EXISTS public.watchlist_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    watchlist_id UUID REFERENCES public.watchlists(id) ON DELETE CASCADE NOT NULL,
    symbol TEXT NOT NULL,
    price NUMERIC,
    change NUMERIC,
    percent_change NUMERIC,
    pnl NUMERIC,
    auto_trade_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(watchlist_id, symbol)
);

-- Enable RLS for watchlist_items
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

-- Create policies for watchlist_items
-- We check permission via the parent watchlist
CREATE POLICY "Users can view items of their watchlists"
    ON public.watchlist_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.watchlists
            WHERE watchlists.id = watchlist_items.watchlist_id
            AND watchlists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert items to their watchlists"
    ON public.watchlist_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.watchlists
            WHERE watchlists.id = watchlist_items.watchlist_id
            AND watchlists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update items of their watchlists"
    ON public.watchlist_items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.watchlists
            WHERE watchlists.id = watchlist_items.watchlist_id
            AND watchlists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete items from their watchlists"
    ON public.watchlist_items
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.watchlists
            WHERE watchlists.id = watchlist_items.watchlist_id
            AND watchlists.user_id = auth.uid()
        )
    );

-- Add real-time publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.watchlists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.watchlist_items;
