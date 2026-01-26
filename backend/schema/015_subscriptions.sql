-- =============================================================================
-- 015_subscriptions.sql
-- =============================================================================

-- 1. Subscription Plans Table
-- Defines the available plans (Free, Pro, etc.)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- 'Free', 'Pro'
    price_monthly NUMERIC(10, 2) NOT NULL DEFAULT 0,
    features JSONB DEFAULT '[]'::jsonb, -- List of feature strings
    stripe_price_id TEXT, -- For integration with Stripe
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for plans
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans"
    ON public.subscription_plans FOR SELECT
    USING (is_active = TRUE);

-- 2. User Subscriptions Table
-- Links a user to a plan
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for user_subscriptions
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own subscription"
    ON public.user_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Only service role can update subscriptions (via webhook or admin API)
-- But for our Mock Mode functionality, we might need to allow users to update (upgrade/cancel) if we mock it client-side.
-- Ideally, even mock mode should use a secure RPC or Edge Function, but for this MVP, we will allow Authenticated users to INSERT/UPDATE
-- their own subscription to simulate the "Mock Payment Success" callback.

CREATE POLICY "Users can update their own subscription (Mock Mode Support)"
    ON public.user_subscriptions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- 3. Initial Seed Data
-- Insert default plans if they don't exist
INSERT INTO public.subscription_plans (name, price_monthly, features, stripe_price_id)
VALUES 
    ('Free', 0, '["Basic Charting", "1 Exchange Connection", "Manual Trading", "Community Access"]'::jsonb, NULL),
    ('Pro', 29.99, '["Advanced Charting", "Unlimited Connections", "Automated Signals", "Copy Trading", "Priority Support"]'::jsonb, 'price_mock_pro')
ON CONFLICT (name) DO NOTHING;


-- 4. Helper Function
-- Get user status
CREATE OR REPLACE FUNCTION public.get_user_subscription_status(uid UUID)
RETURNS TABLE (plan_name TEXT, status TEXT, features JSONB) AS $$
BEGIN
    RETURN QUERY
    SELECT p.name, s.status, p.features
    FROM public.user_subscriptions s
    JOIN public.subscription_plans p ON s.plan_id = p.id
    WHERE s.user_id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger
DROP TRIGGER IF EXISTS on_user_subscriptions_updated ON public.user_subscriptions;
CREATE TRIGGER on_user_subscriptions_updated
    BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
