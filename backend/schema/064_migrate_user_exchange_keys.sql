-- backend/schema/064_migrate_user_exchange_keys.sql
-- One-shot migration: read plaintext rows from user_exchange_keys,
-- encrypt via credential_encrypt(), insert into user_exchange_keys_v2.
-- The old table is left in place until Phase 1 confirms nothing reads it.

DO $$
DECLARE
    r RECORD;
    enc RECORD;
BEGIN
    FOR r IN
        SELECT id, user_id, exchange, nickname, api_key, api_secret, is_active, created_at, updated_at
        FROM public.user_exchange_keys src
        WHERE NOT EXISTS (
            SELECT 1 FROM public.user_exchange_keys_v2 v2
            WHERE v2.user_id = src.user_id
              AND v2.broker = src.exchange
              AND v2.nickname = src.nickname
        )
    LOOP
        SELECT * INTO enc FROM public.credential_encrypt(r.api_key, r.api_secret);
        INSERT INTO public.user_exchange_keys_v2
            (user_id, broker, nickname, api_key_encrypted, api_secret_encrypted, nonce, is_active, created_at, updated_at)
        VALUES
            (r.user_id, r.exchange, r.nickname, enc.api_key_encrypted, enc.api_secret_encrypted, enc.nonce, r.is_active, r.created_at, r.updated_at);
    END LOOP;
END $$;
