-- 058_drop_signals_p_suffix_trigger.sql
-- Drop the legacy BEFORE INSERT trigger on `signals` that enforces ".P" suffix
-- on symbol for futures. Post migration 051, symbols are Binance-native (BTCUSDT)
-- with market encoded as a separate column. The ".P" suffix is no longer used.
--
-- The trigger was added directly in the Supabase dashboard (not in any committed
-- migration file), and raises "Invalid Symbol: X - Futures signals must end with .P"
-- with error code P0001 on every insertSignal() call from the Signal Engine.
--
-- This migration finds ANY trigger on the signals table whose trigger function
-- contains the text "must end with" and drops both the trigger and the function.
-- It's written defensively so it doesn't fail if the trigger was already removed.

DO $$
DECLARE
    rec RECORD;
BEGIN
    -- Find triggers on signals whose function body mentions the offending text
    FOR rec IN
        SELECT
            t.tgname AS trigger_name,
            p.proname AS func_name,
            n.nspname AS schema_name
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_proc p ON t.tgfoid = p.oid
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE c.relname = 'signals'
          AND NOT t.tgisinternal
          AND (
              pg_get_functiondef(p.oid) ILIKE '%must end with%'
              OR pg_get_functiondef(p.oid) ILIKE '%.P%Futures%'
              OR pg_get_functiondef(p.oid) ILIKE '%Invalid Symbol%'
          )
    LOOP
        RAISE NOTICE 'Dropping trigger % and function %.%',
            rec.trigger_name, rec.schema_name, rec.func_name;
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON signals', rec.trigger_name);
        EXECUTE format('DROP FUNCTION IF EXISTS %I.%I()', rec.schema_name, rec.func_name);
    END LOOP;
END $$;
