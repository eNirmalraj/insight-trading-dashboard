-- 068_drop_user_exchange_keys.sql
-- Legacy table retired. All production data was copied into
-- user_exchange_keys_v2 via migration 067 (verified by
-- backend/server/scripts/verifyMigration067.ts). No runtime code
-- reads from user_exchange_keys — see commits c7a0aa1 through 43a3b59
-- for the full consolidation chain.

BEGIN;

DROP POLICY IF EXISTS "Users manage their exchange keys" ON user_exchange_keys;
DROP POLICY IF EXISTS "Allow users to manage their own exchange keys" ON user_exchange_keys;

DROP TABLE IF EXISTS user_exchange_keys;

COMMIT;
