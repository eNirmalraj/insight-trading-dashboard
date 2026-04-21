-- 066b_credential_encrypt_one.sql
-- Per-field encrypt/decrypt helpers for pgsodium. The v2 table used to store
-- only api_key + api_secret behind a single two-field RPC. Task 2 broadens
-- the schema to include passphrase, MT5 password, OAuth access token, and
-- TOTP secret — all as independent encrypted columns. Use a single-field RPC
-- so each column carries its own nonce.
--
-- Key name: 'insight_credentials' (matches 063b_credential_encrypt_decrypt_fns.sql)

-- Generate a fresh nonce (one per row, shared across all fields of that row)
CREATE OR REPLACE FUNCTION public.credential_gen_nonce()
RETURNS bytea AS $$
BEGIN
    RETURN pgsodium.crypto_aead_det_noncegen();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Encrypt a single plaintext field using a caller-supplied nonce
CREATE OR REPLACE FUNCTION public.credential_encrypt_with_nonce(p_plain text, p_nonce bytea)
RETURNS bytea AS $$
DECLARE
    v_key_id uuid;
BEGIN
    SELECT id INTO v_key_id FROM pgsodium.valid_key WHERE name = 'insight_credentials' LIMIT 1;
    IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'insight_credentials key not found';
    END IF;
    RETURN pgsodium.crypto_aead_det_encrypt(convert_to(p_plain, 'utf8'), ''::bytea, v_key_id, p_nonce);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrypt a single ciphertext field using the row's shared nonce
CREATE OR REPLACE FUNCTION public.credential_decrypt_one(p_ct bytea, p_nonce bytea)
RETURNS text AS $$
DECLARE
    v_key_id uuid;
BEGIN
    SELECT id INTO v_key_id FROM pgsodium.valid_key WHERE name = 'insight_credentials' LIMIT 1;
    IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'insight_credentials key not found';
    END IF;
    RETURN convert_from(
        pgsodium.crypto_aead_det_decrypt(p_ct, ''::bytea, v_key_id, p_nonce),
        'utf8'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- One-shot encrypt (generates its own nonce; useful for isolated encryption e.g. Task 13)
CREATE OR REPLACE FUNCTION public.credential_encrypt_one(p_plain text)
RETURNS TABLE(ciphertext bytea, nonce bytea) AS $$
DECLARE
    v_nonce bytea := pgsodium.crypto_aead_det_noncegen();
    v_key_id uuid;
BEGIN
    SELECT id INTO v_key_id FROM pgsodium.valid_key WHERE name = 'insight_credentials' LIMIT 1;
    IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'insight_credentials key not found';
    END IF;
    RETURN QUERY SELECT
        pgsodium.crypto_aead_det_encrypt(convert_to(p_plain, 'utf8'), ''::bytea, v_key_id, v_nonce),
        v_nonce;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant to service_role only
REVOKE ALL ON FUNCTION public.credential_gen_nonce() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credential_encrypt_with_nonce(text, bytea) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credential_decrypt_one(bytea, bytea) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credential_encrypt_one(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.credential_gen_nonce() TO service_role;
GRANT EXECUTE ON FUNCTION public.credential_encrypt_with_nonce(text, bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.credential_decrypt_one(bytea, bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.credential_encrypt_one(text) TO service_role;
