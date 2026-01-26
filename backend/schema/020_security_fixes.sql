-- Fix Security Warnings for Mutable Search Path
-- Applied to DB on 2026-01-16

ALTER FUNCTION public.increment_likes(uuid) SET search_path = public;

ALTER FUNCTION public.get_user_subscription_status(uuid) SET search_path = public;

-- Depending on if this function exists in the specific environment (it does in production)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_market_updated_at') THEN
        ALTER FUNCTION public.handle_market_updated_at() SET search_path = public;
    END IF;
END $$;

-- Safety wrappers for common functions that might be auto-generated or in extensions
DO $$ 
BEGIN
   IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at') THEN
       ALTER FUNCTION public.handle_updated_at() SET search_path = public;
   END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ 
BEGIN
   IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
       ALTER FUNCTION public.handle_new_user() SET search_path = public;
   END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
        ALTER FUNCTION public.set_updated_at() SET search_path = public;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
