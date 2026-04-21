-- backend/schema/063b_credential_encrypt_decrypt_fns.sql
-- pgsodium det-aead encrypt/decrypt helpers used by credentialVault.ts.
-- Creates a dedicated key 'insight_credentials' if it doesn't exist.
-- Functions are SECURITY DEFINER, accessible only by service_role.

CREATE OR REPLACE FUNCTION public.credential_encrypt(
    p_api_key TEXT,
    p_api_secret TEXT
) RETURNS TABLE (
    api_key_encrypted BYTEA,
    api_secret_encrypted BYTEA,
    nonce BYTEA
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_key_id UUID;
    v_nonce BYTEA;
BEGIN
    -- Get or create a dedicated key for this app. Reuse by name.
    SELECT id INTO v_key_id FROM pgsodium.valid_key WHERE name = 'insight_credentials' LIMIT 1;
    IF v_key_id IS NULL THEN
        SELECT id INTO v_key_id FROM pgsodium.create_key(
            name := 'insight_credentials',
            key_type := 'aead-det'
        );
    END IF;

    v_nonce := pgsodium.crypto_aead_det_noncegen();

    RETURN QUERY
    SELECT
        pgsodium.crypto_aead_det_encrypt(convert_to(p_api_key, 'utf8'), ''::bytea, v_key_id, v_nonce) AS api_key_encrypted,
        pgsodium.crypto_aead_det_encrypt(convert_to(p_api_secret, 'utf8'), ''::bytea, v_key_id, v_nonce) AS api_secret_encrypted,
        v_nonce AS nonce;
END;
$$;

CREATE OR REPLACE FUNCTION public.credential_decrypt(
    p_api_key_encrypted BYTEA,
    p_api_secret_encrypted BYTEA,
    p_nonce BYTEA
) RETURNS TABLE (
    api_key TEXT,
    api_secret TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_key_id UUID;
BEGIN
    SELECT id INTO v_key_id FROM pgsodium.valid_key WHERE name = 'insight_credentials' LIMIT 1;
    IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'insight_credentials key not found';
    END IF;

    RETURN QUERY
    SELECT
        convert_from(pgsodium.crypto_aead_det_decrypt(p_api_key_encrypted, ''::bytea, v_key_id, p_nonce), 'utf8') AS api_key,
        convert_from(pgsodium.crypto_aead_det_decrypt(p_api_secret_encrypted, ''::bytea, v_key_id, p_nonce), 'utf8') AS api_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.credential_encrypt FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credential_decrypt FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credential_encrypt TO service_role;
GRANT EXECUTE ON FUNCTION public.credential_decrypt TO service_role;
