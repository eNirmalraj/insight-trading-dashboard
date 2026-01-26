-- =============================================================================
-- 014_social_features.sql
-- =============================================================================

-- 1. Social Follows Table
-- Tracks who follows who.
CREATE TABLE IF NOT EXISTS public.social_follows (
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

-- RLS for social_follows
ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read follows"
    ON public.social_follows FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Users can follow others"
    ON public.social_follows FOR INSERT
    WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow others"
    ON public.social_follows FOR DELETE
    USING (auth.uid() = follower_id);


-- 2. Shared Strategies / Community Feed
-- A pointer table. Strategies themselves live in `strategies` table or in user JSON blobs.
-- This table surfaces them to the public feed.
CREATE TABLE IF NOT EXISTS public.shared_strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_name TEXT NOT NULL,
    description TEXT,
    original_strategy_id UUID, -- Optional pointer to the private strategy
    performance_metrics JSONB DEFAULT '{}'::jsonb, -- e.g. { "winRate": 65, "profitFactor": 2.1 }
    likes_count INT DEFAULT 0,
    clones_count INT DEFAULT 0,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shared_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read shared strategies"
    ON public.shared_strategies FOR SELECT
    USING (is_public = TRUE);

CREATE POLICY "Users can share their own strategies"
    ON public.shared_strategies FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their shared strategies"
    ON public.shared_strategies FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their shared strategies"
    ON public.shared_strategies FOR DELETE
    USING (auth.uid() = user_id);


-- 3. Social Likes
-- Likes on strategies (and potentially other items in future)
CREATE TABLE IF NOT EXISTS public.social_likes (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id UUID NOT NULL, -- Generic ID (could be shared_strategy_id)
    target_type TEXT NOT NULL CHECK (target_type IN ('strategy')), -- Expandable
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, target_id, target_type)
);

ALTER TABLE public.social_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read likes"
    ON public.social_likes FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Users can like items"
    ON public.social_likes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike items"
    ON public.social_likes FOR DELETE
    USING (auth.uid() = user_id);

-- Update trigger for shared_strategies
DROP TRIGGER IF EXISTS on_shared_strategies_updated ON public.shared_strategies;
CREATE TRIGGER on_shared_strategies_updated
    BEFORE UPDATE ON public.shared_strategies
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 4. RPC Functions for atomic updates

-- Increment likes count
CREATE OR REPLACE FUNCTION public.increment_likes(row_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.shared_strategies
    SET likes_count = likes_count + 1
    WHERE id = row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
