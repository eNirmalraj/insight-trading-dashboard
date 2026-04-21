-- 066c_nullable_api_key_secret.sql
-- Make api_key_encrypted, api_secret_encrypted, and nonce nullable so that
-- MT5 and Indian broker rows (which have no API key/secret) can be inserted.
ALTER TABLE user_exchange_keys_v2
    ALTER COLUMN api_key_encrypted DROP NOT NULL,
    ALTER COLUMN api_secret_encrypted DROP NOT NULL,
    ALTER COLUMN nonce DROP NOT NULL;
