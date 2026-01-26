-- Create Trading Journal Table
CREATE TABLE IF NOT EXISTS public.trading_journal (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sentiment TEXT CHECK (sentiment IN ('Bullish', 'Bearish', 'Neutral')),
    mood TEXT CHECK (mood IN ('Confident', 'Anxious', 'Neutral', 'Excited', 'Frustrated', 'Bored', 'Greedy', 'Fearful')),
    tags TEXT[] DEFAULT '{}',
    symbol TEXT,
    images TEXT[] DEFAULT '{}',
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    pnl NUMERIC,
    setup_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.trading_journal ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own journal entries"
    ON public.trading_journal
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own journal entries"
    ON public.trading_journal
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal entries"
    ON public.trading_journal
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal entries"
    ON public.trading_journal
    FOR DELETE
    USING (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_journal;
