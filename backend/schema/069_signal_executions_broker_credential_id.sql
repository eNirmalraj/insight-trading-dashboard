-- 069_signal_executions_broker_credential_id.sql
-- Adds the broker_credential_id FK column that the DELETE guard in
-- brokerCredentials.ts expects. Without this column, every DELETE attempt
-- on a credential returned "column does not exist" from Postgres. Existing
-- rows get NULL (no historical executions tie back to a credential), which
-- is fine: the guard only blocks deletes when rows exist with
-- status='Active' for this credential id, and NULL rows won't match.
-- ON DELETE SET NULL so historical executions survive a credential delete.

ALTER TABLE signal_executions
  ADD COLUMN IF NOT EXISTS broker_credential_id uuid
      REFERENCES user_exchange_keys_v2(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_signal_executions_broker_credential_id
  ON signal_executions (broker_credential_id)
  WHERE broker_credential_id IS NOT NULL;
