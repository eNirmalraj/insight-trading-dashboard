# Broker Foundation — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the broker-agnostic foundation (OMS + BrokerAdapter interface + credential vault + 3 new DB tables + rewritten paper broker) without changing any user-visible behavior. Paper trading must continue to work identically.

**Architecture:** Every order flows through `oms.submit(intent)` which runs a 9-step pipeline (validate → normalize → size → risk-check → resolve creds → insert execution → call broker adapter → record broker orders → activate/reject). The existing `executionEngine.handleNewSignal` is rewired to call OMS instead of writing directly. The `paperBrokerAdapter` is rewritten to the new interface; Binance comes in Phase 1.

**Tech Stack:** Node 18 + TypeScript, Supabase (Postgres + pgsodium Vault + RLS), existing eventBus, no new runtime dependencies.

Spec: [docs/superpowers/specs/2026-04-17-broker-foundation-phase0-design.md](../specs/2026-04-17-broker-foundation-phase0-design.md)

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `backend/server/src/engine/brokerAdapters/types.ts` | Create | All BrokerAdapter-related types |
| `backend/server/src/engine/brokerAdapters/index.ts` | Modify | Export new interface; re-plumb registry |
| `backend/server/src/engine/brokerAdapters/paperBroker.ts` | Rewrite | Implement full BrokerAdapter |
| `backend/server/src/services/oms.ts` | Create | `oms.submit(intent)` — single public entry point |
| `backend/server/src/services/omsErrors.ts` | Create | `OmsError` discriminated union |
| `backend/server/src/services/credentialVault.ts` | Create | pgsodium-backed encrypt/decrypt |
| `backend/server/src/services/brokerOrderStorage.ts` | Create | CRUD for `broker_orders` + `fills_log` |
| `backend/server/src/engine/executionEngine.ts:123-205` | Modify | Rewire `handleNewSignal` to call `oms.submit()` |
| `backend/schema/061_user_exchange_keys_v2.sql` | Create | Vault-encrypted credentials table |
| `backend/schema/062_broker_orders.sql` | Create | Order-leg tracking table |
| `backend/schema/063_fills_log.sql` | Create | Immutable audit trail |

No test framework is wired up for backend tests — this codebase uses manual verification. Each task therefore includes a **Verify** step instead of automated tests (TypeScript compile check + targeted `node -e` smoke test where applicable).

**Note: this is NOT a git repository.** Do NOT run `git add` or `git commit` — skip those steps. Each task ends with a verify step, not a commit.

---

## Task 1: Database migration — `user_exchange_keys_v2`

**Files:**
- Create: `backend/schema/061_user_exchange_keys_v2.sql`

- [ ] **Step 1: Write the SQL migration**

```sql
-- backend/schema/061_user_exchange_keys_v2.sql
-- Vault-encrypted exchange credentials. Supersedes user_exchange_keys.

CREATE EXTENSION IF NOT EXISTS pgsodium;

CREATE TABLE IF NOT EXISTS public.user_exchange_keys_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    broker TEXT NOT NULL CHECK (broker IN ('binance', 'bybit', 'coinbase', 'kraken', 'oanda', 'zerodha')),
    nickname TEXT NOT NULL,
    api_key_encrypted BYTEA NOT NULL,
    api_secret_encrypted BYTEA NOT NULL,
    nonce BYTEA NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_exchange_keys_v2_user_broker
    ON public.user_exchange_keys_v2 (user_id, broker)
    WHERE is_active = TRUE;

ALTER TABLE public.user_exchange_keys_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_v2"
    ON public.user_exchange_keys_v2 FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "insert_own_v2"
    ON public.user_exchange_keys_v2 FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_v2"
    ON public.user_exchange_keys_v2 FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_v2"
    ON public.user_exchange_keys_v2 FOR DELETE
    USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_user_exchange_keys_v2_updated ON public.user_exchange_keys_v2;
CREATE TRIGGER on_user_exchange_keys_v2_updated
    BEFORE UPDATE ON public.user_exchange_keys_v2
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
```

- [ ] **Step 2: Apply the migration manually via Supabase SQL editor**

The user runs the SQL in their Supabase project. Report back the result.

- [ ] **Step 3: Verify**

In the Supabase SQL editor:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_exchange_keys_v2';
```

Expected: 10 columns listed (id, user_id, broker, nickname, api_key_encrypted, api_secret_encrypted, nonce, is_active, last_verified_at, created_at, updated_at — the trigger is fine).

```sql
SELECT * FROM pg_extension WHERE extname = 'pgsodium';
```

Expected: one row.

---

## Task 2: Database migration — `broker_orders`

**Files:**
- Create: `backend/schema/062_broker_orders.sql`

- [ ] **Step 1: Write the SQL migration**

```sql
-- backend/schema/062_broker_orders.sql
-- One row per order leg placed on a broker (entry, SL, TP).
-- For paper broker: broker_order_id is NULL.

CREATE TABLE IF NOT EXISTS public.broker_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES public.signal_executions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    broker TEXT NOT NULL,
    broker_order_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    type TEXT NOT NULL CHECK (type IN ('MARKET', 'LIMIT', 'STOP_MARKET', 'TAKE_PROFIT_MARKET')),
    role TEXT NOT NULL CHECK (role IN ('ENTRY', 'SL', 'TP')),
    price NUMERIC,
    stop_price NUMERIC,
    qty NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Open', 'Filled', 'Cancelled', 'Rejected')),
    filled_qty NUMERIC DEFAULT 0,
    avg_fill_price NUMERIC,
    rejected_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_orders_execution
    ON public.broker_orders (execution_id);
CREATE INDEX IF NOT EXISTS idx_broker_orders_user_status
    ON public.broker_orders (user_id, status)
    WHERE status IN ('Pending', 'Open');

ALTER TABLE public.broker_orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own broker orders (platform orders with user_id NULL are visible to all authenticated)
CREATE POLICY "select_own_or_platform_broker_orders"
    ON public.broker_orders FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

-- Writes are done by service_role only (backend) — no user INSERT/UPDATE/DELETE policies.

DROP TRIGGER IF EXISTS on_broker_orders_updated ON public.broker_orders;
CREATE TRIGGER on_broker_orders_updated
    BEFORE UPDATE ON public.broker_orders
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
```

- [ ] **Step 2: Apply via Supabase SQL editor**

User runs it, reports back.

- [ ] **Step 3: Verify**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'broker_orders';
```

Expected: 17 columns. CHECK constraints visible in `pg_constraint`.

---

## Task 3: Database migration — `fills_log`

**Files:**
- Create: `backend/schema/063_fills_log.sql`

- [ ] **Step 1: Write the SQL migration**

```sql
-- backend/schema/063_fills_log.sql
-- Immutable audit trail of every fill event from the broker.

CREATE TABLE IF NOT EXISTS public.fills_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_order_id UUID REFERENCES public.broker_orders(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES public.signal_executions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    fill_qty NUMERIC NOT NULL,
    fill_price NUMERIC NOT NULL,
    is_maker BOOLEAN,
    commission NUMERIC,
    commission_asset TEXT,
    raw_event JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fills_log_execution ON public.fills_log (execution_id);
CREATE INDEX IF NOT EXISTS idx_fills_log_user_created ON public.fills_log (user_id, created_at DESC);

ALTER TABLE public.fills_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_or_platform_fills"
    ON public.fills_log FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

-- Immutable: no UPDATE or DELETE policy. service_role only inserts.
```

- [ ] **Step 2: Apply via Supabase SQL editor**

- [ ] **Step 3: Verify**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'fills_log';
```

Expected: 11 columns. No UPDATE policy exists.

---

## Task 4: BrokerAdapter interface and types

**Files:**
- Create: `backend/server/src/engine/brokerAdapters/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// backend/server/src/engine/brokerAdapters/types.ts

export interface BrokerCredentials {
    id: string;
    userId: string;
    broker: string;
    apiKey: string;
    apiSecret: string;
}

export interface BracketInput {
    symbol: string;
    side: 'BUY' | 'SELL';
    qty: number;
    entryType: 'MARKET' | 'LIMIT';
    entryPrice?: number;
    stopLoss: number;
    takeProfit: number;
    reduceOnly?: boolean;
}

export type BrokerOrderRole = 'ENTRY' | 'SL' | 'TP';
export type BrokerOrderStatus = 'Pending' | 'Open' | 'Filled' | 'Cancelled' | 'Rejected';
export type BrokerOrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';

export interface BrokerOrderLeg {
    brokerOrderId: string | null;
    role: BrokerOrderRole;
    type: BrokerOrderType;
    status: BrokerOrderStatus;
    price: number | null;
    stopPrice: number | null;
    qty: number;
    rejectedReason?: string;
}

export interface BracketResult {
    legs: BrokerOrderLeg[];
    rejectedReason?: string;
}

export interface FillEvent {
    brokerOrderId: string;
    symbol: string;
    fillQty: number;
    fillPrice: number;
    isMaker: boolean;
    commission: number;
    commissionAsset: string;
    raw: unknown;
}

export interface BrokerPosition {
    symbol: string;
    qty: number;
    avgEntryPrice: number;
    unrealizedPnl: number;
}

export interface BrokerAdapter {
    submitBracket(input: BracketInput, creds: BrokerCredentials | null): Promise<BracketResult>;
    cancelOrder(brokerOrderId: string, symbol: string, creds: BrokerCredentials | null): Promise<void>;
    getOpenOrders(symbol: string, creds: BrokerCredentials | null): Promise<BrokerOrderLeg[]>;
    getPosition(symbol: string, creds: BrokerCredentials | null): Promise<BrokerPosition | null>;
    subscribeFills(creds: BrokerCredentials | null, onFill: (fill: FillEvent) => void): () => void;
    ping(creds: BrokerCredentials | null): Promise<boolean>;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit` (from `backend/server/`)
Expected: No new errors related to this file.

---

## Task 5: OmsError discriminated union

**Files:**
- Create: `backend/server/src/services/omsErrors.ts`

- [ ] **Step 1: Create the file**

```typescript
// backend/server/src/services/omsErrors.ts
// Typed errors thrown by oms.submit().

export type OmsErrorKind =
    | 'validation'
    | 'sizing'
    | 'risk'
    | 'credential'
    | 'broker'
    | 'db';

export class OmsError extends Error {
    public readonly kind: OmsErrorKind;
    public readonly retryable: boolean;

    constructor(kind: OmsErrorKind, message: string, retryable = false) {
        super(message);
        this.name = 'OmsError';
        this.kind = kind;
        this.retryable = retryable;
    }

    static validation(msg: string) { return new OmsError('validation', msg, false); }
    static sizing(msg: string) { return new OmsError('sizing', msg, false); }
    static risk(msg: string) { return new OmsError('risk', msg, false); }
    static credential(msg: string) { return new OmsError('credential', msg, false); }
    static broker(msg: string, retryable = false) { return new OmsError('broker', msg, retryable); }
    static db(msg: string, retryable = true) { return new OmsError('db', msg, retryable); }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: clean.

---

## Task 6: brokerOrderStorage — CRUD for broker_orders + fills_log

**Files:**
- Create: `backend/server/src/services/brokerOrderStorage.ts`

- [ ] **Step 1: Create the storage service**

```typescript
// backend/server/src/services/brokerOrderStorage.ts
// Thin CRUD wrapper over broker_orders and fills_log tables.

import { supabaseAdmin } from './supabaseAdmin';
import { BrokerOrderLeg, BrokerOrderStatus, FillEvent } from '../engine/brokerAdapters/types';

export interface BrokerOrderRow {
    id: string;
    execution_id: string;
    user_id: string | null;
    broker: string;
    broker_order_id: string | null;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: string;
    role: string;
    price: number | null;
    stop_price: number | null;
    qty: number;
    status: BrokerOrderStatus;
    filled_qty: number;
    avg_fill_price: number | null;
    rejected_reason: string | null;
    created_at: string;
    updated_at: string;
}

export interface InsertBrokerOrderInput {
    executionId: string;
    userId: string | null;
    broker: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    leg: BrokerOrderLeg;
}

export async function insertBrokerOrder(input: InsertBrokerOrderInput): Promise<BrokerOrderRow | null> {
    const { data, error } = await supabaseAdmin
        .from('broker_orders')
        .insert({
            execution_id: input.executionId,
            user_id: input.userId,
            broker: input.broker,
            broker_order_id: input.leg.brokerOrderId,
            symbol: input.symbol,
            side: input.side,
            type: input.leg.type,
            role: input.leg.role,
            price: input.leg.price,
            stop_price: input.leg.stopPrice,
            qty: input.leg.qty,
            status: input.leg.status,
            rejected_reason: input.leg.rejectedReason ?? null,
        })
        .select('*')
        .single();

    if (error) {
        console.error('[brokerOrderStorage] insertBrokerOrder failed:', error.message);
        return null;
    }
    return data as BrokerOrderRow;
}

export async function updateBrokerOrderStatus(
    id: string,
    status: BrokerOrderStatus,
    filledQty?: number,
    avgFillPrice?: number,
): Promise<boolean> {
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (filledQty !== undefined) update.filled_qty = filledQty;
    if (avgFillPrice !== undefined) update.avg_fill_price = avgFillPrice;

    const { error } = await supabaseAdmin
        .from('broker_orders')
        .update(update)
        .eq('id', id);

    if (error) {
        console.error('[brokerOrderStorage] updateBrokerOrderStatus failed:', error.message);
        return false;
    }
    return true;
}

export async function insertFill(params: {
    brokerOrderId: string;
    executionId: string;
    userId: string | null;
    fill: FillEvent;
}): Promise<void> {
    const { error } = await supabaseAdmin.from('fills_log').insert({
        broker_order_id: params.brokerOrderId,
        execution_id: params.executionId,
        user_id: params.userId,
        fill_qty: params.fill.fillQty,
        fill_price: params.fill.fillPrice,
        is_maker: params.fill.isMaker,
        commission: params.fill.commission,
        commission_asset: params.fill.commissionAsset,
        raw_event: params.fill.raw as object,
    });
    if (error) {
        console.error('[brokerOrderStorage] insertFill failed:', error.message);
    }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: clean.

---

## Task 7: credentialVault — pgsodium-backed encrypt/decrypt

**Files:**
- Create: `backend/server/src/services/credentialVault.ts`

- [ ] **Step 1: Create the vault service**

```typescript
// backend/server/src/services/credentialVault.ts
// Encrypted storage of exchange API credentials using Supabase Vault (pgsodium).
// Secrets are decrypted only in-process when an adapter needs them.
// They are never logged or returned to the frontend.

import { supabaseAdmin } from './supabaseAdmin';
import { BrokerCredentials } from '../engine/brokerAdapters/types';

export interface CredentialInfo {
    id: string;
    broker: string;
    nickname: string;
    is_active: boolean;
    last_verified_at: string | null;
}

// We use pgsodium.crypto_aead_det_encrypt + decrypt. Determinism lets us
// detect duplicates via indexed lookups without decrypting every row.
// The nonce is stored alongside the ciphertext.

export async function store(params: {
    userId: string;
    broker: string;
    nickname: string;
    apiKey: string;
    apiSecret: string;
}): Promise<{ id: string }> {
    // Encrypt via RPC; the function returns hex-encoded (api_key_enc, api_secret_enc, nonce).
    const { data: encoded, error: encErr } = await supabaseAdmin.rpc('credential_encrypt', {
        p_api_key: params.apiKey,
        p_api_secret: params.apiSecret,
    });

    if (encErr || !encoded) {
        throw new Error(`credentialVault.store: encrypt failed — ${encErr?.message || 'no data'}`);
    }

    const { data, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .insert({
            user_id: params.userId,
            broker: params.broker,
            nickname: params.nickname,
            api_key_encrypted: encoded.api_key_encrypted,
            api_secret_encrypted: encoded.api_secret_encrypted,
            nonce: encoded.nonce,
        })
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(`credentialVault.store: insert failed — ${error?.message || 'no row'}`);
    }
    return { id: data.id };
}

export async function retrieveById(id: string): Promise<BrokerCredentials | null> {
    const { data: row, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .select('id, user_id, broker, api_key_encrypted, api_secret_encrypted, nonce, is_active')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();

    if (error) {
        console.error('[credentialVault] retrieveById failed:', error.message);
        return null;
    }
    if (!row) return null;

    const { data: plain, error: decErr } = await supabaseAdmin.rpc('credential_decrypt', {
        p_api_key_encrypted: row.api_key_encrypted,
        p_api_secret_encrypted: row.api_secret_encrypted,
        p_nonce: row.nonce,
    });

    if (decErr || !plain) {
        console.error('[credentialVault] decrypt failed:', decErr?.message);
        return null;
    }

    return {
        id: row.id,
        userId: row.user_id,
        broker: row.broker,
        apiKey: plain.api_key,
        apiSecret: plain.api_secret,
    };
}

export async function retrieveActiveForUser(
    userId: string,
    broker: string,
): Promise<BrokerCredentials | null> {
    const { data: row, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .select('id')
        .eq('user_id', userId)
        .eq('broker', broker)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !row) return null;
    return retrieveById(row.id);
}

export async function listForUser(userId: string): Promise<CredentialInfo[]> {
    const { data, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .select('id, broker, nickname, is_active, last_verified_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as CredentialInfo[];
}

export async function remove(id: string, userId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
    if (error) throw new Error(`credentialVault.remove: ${error.message}`);
}

export async function markVerified(id: string): Promise<void> {
    await supabaseAdmin
        .from('user_exchange_keys_v2')
        .update({ last_verified_at: new Date().toISOString() })
        .eq('id', id);
}

export const credentialVault = {
    store,
    retrieveById,
    retrieveActiveForUser,
    listForUser,
    remove,
    markVerified,
};
```

- [ ] **Step 2: Create the companion SQL functions in Supabase**

User runs this in Supabase SQL editor (one-time setup):

```sql
-- pgsodium det-aead encrypt/decrypt helpers for credentialVault.

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
    -- Get or create a dedicated key for this app. Reuse by id.
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
```

- [ ] **Step 3: Verify round-trip encrypt/decrypt**

Run this from `backend/server/` (requires `.env` with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`):

```bash
npx tsx -e "
import { credentialVault } from './src/services/credentialVault';
(async () => {
  const { id } = await credentialVault.store({
    userId: '00000000-0000-0000-0000-000000000000',
    broker: 'binance',
    nickname: 'test-vault',
    apiKey: 'TEST_KEY_12345',
    apiSecret: 'TEST_SECRET_67890',
  });
  const creds = await credentialVault.retrieveById(id);
  if (!creds) { console.error('FAIL: retrieve returned null'); process.exit(1); }
  if (creds.apiKey !== 'TEST_KEY_12345' || creds.apiSecret !== 'TEST_SECRET_67890') {
    console.error('FAIL: round-trip mismatch', creds);
    process.exit(1);
  }
  console.log('PASS: round-trip OK');
  await credentialVault.remove(id, creds.userId);
})().catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `PASS: round-trip OK`. If the dummy `user_id` fails FK constraint, replace with a real user id from `auth.users` or drop the `is_active` FK check for this test.

---

## Task 8: oms — the 9-step submit pipeline

**Files:**
- Create: `backend/server/src/services/oms.ts`

- [ ] **Step 1: Create the OMS**

```typescript
// backend/server/src/services/oms.ts
// Order Management System — single entry point for all order submissions.

import { supabaseAdmin } from './supabaseAdmin';
import { credentialVault } from './credentialVault';
import { insertBrokerOrder } from './brokerOrderStorage';
import { OmsError } from './omsErrors';
import { BrokerAdapter, BracketInput, BrokerCredentials } from '../engine/brokerAdapters/types';
import { paperBrokerAdapter } from '../engine/brokerAdapters/paperBroker';
import {
    BrokerType,
    Market,
    SignalStatus,
    TradeDirection,
} from '../constants/enums';
import { RiskSettings } from '../engine/riskCalculator';
import { SignalExecutionRow } from './executionStorage';

export interface OrderIntent {
    userId: string | null;
    broker: BrokerType;
    brokerCredentialId: string | null;
    signalId: string | null;
    watchlistStrategyId: string | null;
    symbol: string;
    market: Market;
    direction: TradeDirection;
    entryType: 'MARKET' | 'LIMIT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskSettings: RiskSettings;
    timeframe: string;
}

const adapters: Record<string, BrokerAdapter> = {
    [BrokerType.PAPER]: paperBrokerAdapter,
};

// Step 1: Validate intent
function validateIntent(intent: OrderIntent): void {
    if (!intent.symbol) throw OmsError.validation('symbol required');
    if (!intent.entryPrice || intent.entryPrice <= 0) throw OmsError.validation('entryPrice must be positive');
    if (!intent.stopLoss || intent.stopLoss <= 0) throw OmsError.validation('stopLoss must be positive');
    if (!intent.takeProfit || intent.takeProfit <= 0) throw OmsError.validation('takeProfit must be positive');

    // SL/TP must be on correct sides of entry for direction
    if (intent.direction === TradeDirection.BUY) {
        if (intent.stopLoss >= intent.entryPrice) throw OmsError.validation('BUY: stopLoss must be below entry');
        if (intent.takeProfit <= intent.entryPrice) throw OmsError.validation('BUY: takeProfit must be above entry');
    } else {
        if (intent.stopLoss <= intent.entryPrice) throw OmsError.validation('SELL: stopLoss must be above entry');
        if (intent.takeProfit >= intent.entryPrice) throw OmsError.validation('SELL: takeProfit must be below entry');
    }

    if (intent.broker !== BrokerType.PAPER && !intent.brokerCredentialId) {
        throw OmsError.validation(`${intent.broker} requires brokerCredentialId`);
    }
}

// Step 2: Normalize (minimal for paper — uppercase symbol)
function normalize(intent: OrderIntent): OrderIntent {
    return { ...intent, symbol: intent.symbol.toUpperCase() };
}

// Step 3: Compute position size
function computeQty(intent: OrderIntent): number {
    const lot = intent.riskSettings.lotSize ?? 1;
    const leverage = intent.riskSettings.leverage ?? 1;
    // Phase 0: trivial sizing — lot × leverage as notional-unit multiplier.
    // Real sizing (risk-per-trade %) comes in later phases.
    return lot * leverage;
}

// Step 4: Risk check (placeholder for Phase 7 kill switch / position cap)
async function riskCheck(intent: OrderIntent, qty: number): Promise<void> {
    // Phase 0: no-op. Phase 7 adds: max position per user, daily loss cap, kill switch.
    if (qty <= 0) throw OmsError.sizing(`computed qty=${qty} is not positive`);
}

// Step 5: Resolve credentials
async function resolveCredentials(intent: OrderIntent): Promise<BrokerCredentials | null> {
    if (intent.broker === BrokerType.PAPER) return null;
    if (!intent.brokerCredentialId) throw OmsError.credential('no credential id');
    const creds = await credentialVault.retrieveById(intent.brokerCredentialId);
    if (!creds) throw OmsError.credential('credentials not found or decrypt failed');
    return creds;
}

// Step 6: Insert signal_executions row with status=Pending
async function insertPendingExecution(intent: OrderIntent, qty: number): Promise<SignalExecutionRow> {
    const { data, error } = await supabaseAdmin
        .from('signal_executions')
        .insert({
            signal_id: intent.signalId,
            watchlist_strategy_id: intent.watchlistStrategyId,
            user_id: intent.userId,
            symbol: intent.symbol,
            market: intent.market,
            direction: intent.direction,
            entry_price: intent.entryPrice,
            timeframe: intent.timeframe,
            stop_loss: intent.stopLoss,
            take_profit: intent.takeProfit,
            lot_size: intent.riskSettings.lotSize ?? null,
            leverage: intent.riskSettings.leverage ?? null,
            status: SignalStatus.PENDING,
            broker: intent.broker,
        })
        .select('*')
        .single();

    if (error || !data) {
        throw OmsError.db(`insert signal_executions failed: ${error?.message || 'no data'}`);
    }
    return data as SignalExecutionRow;
}

// Step 9: Mark execution Active or Rejected
async function finalizeExecution(execId: string, outcome: 'Active' | 'Rejected', rejectedReason?: string): Promise<void> {
    const update: Record<string, unknown> = { status: outcome, updated_at: new Date().toISOString() };
    if (outcome === 'Rejected' && rejectedReason) {
        update.close_reason = rejectedReason;
    }
    const { error } = await supabaseAdmin.from('signal_executions').update(update).eq('id', execId);
    if (error) console.error('[oms] finalizeExecution failed:', error.message);
}

export const oms = {
    async submit(rawIntent: OrderIntent): Promise<SignalExecutionRow> {
        const intent = normalize(rawIntent);
        validateIntent(intent);                                     // Step 1+2

        const qty = computeQty(intent);                             // Step 3
        await riskCheck(intent, qty);                               // Step 4
        const creds = await resolveCredentials(intent);             // Step 5
        const exec = await insertPendingExecution(intent, qty);     // Step 6

        const adapter = adapters[intent.broker] || adapters[BrokerType.PAPER];
        const bracket: BracketInput = {
            symbol: intent.symbol,
            side: intent.direction === TradeDirection.BUY ? 'BUY' : 'SELL',
            qty,
            entryType: intent.entryType,
            entryPrice: intent.entryPrice,
            stopLoss: intent.stopLoss,
            takeProfit: intent.takeProfit,
        };

        let result;
        try {
            result = await adapter.submitBracket(bracket, creds);   // Step 7
        } catch (err: any) {
            await finalizeExecution(exec.id, 'Rejected', err?.message || 'adapter threw');
            throw OmsError.broker(err?.message || 'adapter threw');
        }

        // Step 8: Insert broker_orders rows for each leg
        for (const leg of result.legs) {
            await insertBrokerOrder({
                executionId: exec.id,
                userId: intent.userId,
                broker: intent.broker,
                symbol: intent.symbol,
                side: bracket.side,
                leg,
            });
        }

        // Step 9: Activate
        const hasRejectedLeg = result.legs.some((l) => l.status === 'Rejected');
        await finalizeExecution(exec.id, hasRejectedLeg ? 'Rejected' : 'Active', result.rejectedReason);

        // Return the final row
        const { data: finalRow } = await supabaseAdmin
            .from('signal_executions')
            .select('*')
            .eq('id', exec.id)
            .single();
        return (finalRow || exec) as SignalExecutionRow;
    },
};
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: clean. If `SignalStatus.PENDING` doesn't exist, use `'Pending'` string literal — check `backend/server/src/constants/enums.ts`.

---

## Task 9: Rewrite paperBrokerAdapter to full BrokerAdapter interface

**Files:**
- Modify: `backend/server/src/engine/brokerAdapters/paperBroker.ts`

- [ ] **Step 1: Rewrite the file**

```typescript
// backend/server/src/engine/brokerAdapters/paperBroker.ts
// Paper broker — implements the full BrokerAdapter interface.
//
// Paper orders have no broker_order_id (NULL). The "fill" for the entry
// is synthetic and happens immediately. The SL/TP legs stay Open and are
// closed by the execution engine's tick monitor, which writes a fills_log
// row when it closes an execution.

import {
    BrokerAdapter,
    BracketInput,
    BrokerCredentials,
    BracketResult,
    BrokerOrderLeg,
    FillEvent,
    BrokerPosition,
} from './types';

function legFor(
    role: 'ENTRY' | 'SL' | 'TP',
    type: BrokerOrderLeg['type'],
    status: BrokerOrderLeg['status'],
    qty: number,
    price: number | null,
    stopPrice: number | null,
): BrokerOrderLeg {
    return {
        brokerOrderId: null,
        role,
        type,
        status,
        price,
        stopPrice,
        qty,
    };
}

export const paperBrokerAdapter: BrokerAdapter = {
    async submitBracket(input: BracketInput, _creds: BrokerCredentials | null): Promise<BracketResult> {
        console.log(
            `[PaperBroker] Open ${input.side} ${input.symbol} qty=${input.qty} entry=${input.entryPrice} sl=${input.stopLoss} tp=${input.takeProfit}`,
        );
        return {
            legs: [
                legFor('ENTRY', 'MARKET', 'Filled', input.qty, input.entryPrice ?? null, null),
                legFor('SL', 'STOP_MARKET', 'Open', input.qty, null, input.stopLoss),
                legFor('TP', 'TAKE_PROFIT_MARKET', 'Open', input.qty, null, input.takeProfit),
            ],
        };
    },

    async cancelOrder(_brokerOrderId: string, _symbol: string, _creds: BrokerCredentials | null): Promise<void> {
        // No-op for paper — the engine just stops monitoring after closeExecution.
    },

    async getOpenOrders(_symbol: string, _creds: BrokerCredentials | null): Promise<BrokerOrderLeg[]> {
        return [];
    },

    async getPosition(_symbol: string, _creds: BrokerCredentials | null): Promise<BrokerPosition | null> {
        return null;
    },

    subscribeFills(_creds: BrokerCredentials | null, _onFill: (fill: FillEvent) => void): () => void {
        // Paper fills come from the execution engine's tick monitor which
        // writes fills_log directly when it closes a row. No push channel here.
        return () => {};
    },

    async ping(_creds: BrokerCredentials | null): Promise<boolean> {
        return true;
    },
};
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: clean.

---

## Task 10: Update brokerAdapters/index.ts to the new interface

**Files:**
- Modify: `backend/server/src/engine/brokerAdapters/index.ts`

- [ ] **Step 1: Rewrite the registry**

```typescript
// backend/server/src/engine/brokerAdapters/index.ts
// Registry of broker adapters keyed by BrokerType.

import { BrokerType } from '../../constants/enums';
import { BrokerAdapter } from './types';
import { paperBrokerAdapter } from './paperBroker';

const adapters: Record<string, BrokerAdapter> = {
    [BrokerType.PAPER]: paperBrokerAdapter,
    // Future: [BrokerType.BINANCE]: binanceBrokerAdapter, (Phase 1)
};

export function getBrokerAdapter(broker: string): BrokerAdapter {
    return adapters[broker] || adapters[BrokerType.PAPER];
}

// Legacy compatibility: the existing executionEngine.handleNewSignal still
// calls brokerAdapters.execute(exec) and .onClose(exec). Keep these shims
// for the brief window before OMS takes over — Task 11 rewires the caller
// and removes these references. After Task 11 ships, this file has ONLY
// getBrokerAdapter exported.
export const brokerAdapters = {
    async execute(exec: { broker: string }): Promise<void> {
        // No-op for paper (the old behavior was a log statement).
        // Kept as a shim until handleNewSignal is rewired in Task 11.
        const _adapter = adapters[exec.broker] || adapters[BrokerType.PAPER];
        console.log(`[brokerAdapters.execute] (shim) broker=${exec.broker}`);
    },
    async onClose(exec: { broker: string }): Promise<void> {
        const _adapter = adapters[exec.broker] || adapters[BrokerType.PAPER];
        console.log(`[brokerAdapters.onClose] (shim) broker=${exec.broker}`);
    },
};
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: clean.

---

## Task 11: Rewire executionEngine.handleNewSignal to use OMS

**Files:**
- Modify: `backend/server/src/engine/executionEngine.ts:123-205`

- [ ] **Step 1: Read the current block**

Open `backend/server/src/engine/executionEngine.ts` and locate `handleNewSignal`. The section that computes risk and inserts execution (around lines 183–201) will be replaced.

- [ ] **Step 2: Replace the execution-insertion block**

Find this block inside the `for (const a of matchedAssignments)` loop:

```typescript
        const risk: RiskSettings = a.risk_settings || {};
        const { stopLoss, takeProfit } = computeRiskLevels(
            signal.entry_price,
            direction,
            candle,
            risk,
        );

        const exec = await insertExecution({
            signalId: signal.id,
            watchlistStrategyId: a.id,
            userId: a.watchlists?.user_id || null,
            symbol: signal.symbol,
            market: (signal.market as Market) || Market.FUTURES,
            direction,
            entryPrice: signal.entry_price,
            timeframe: signal.timeframe,
            stopLoss,
            takeProfit,
            lotSize: risk.lotSize ?? null,
            leverage: risk.leverage ?? null,
            broker: BrokerType.PAPER,
        });

        if (!exec) continue;

        // Ensure the kline stream covers this symbol BEFORE adding to
        // activeBySymbol. Otherwise there's a window where the tick handler
        // could be called with no stream connected, missing a fast SL/TP.
        await binanceStream.ensureKlineStream(signal.symbol);
        addActive(exec);
        await brokerAdapters.execute(exec);
    }
```

Replace with:

```typescript
        const risk: RiskSettings = a.risk_settings || {};
        const { stopLoss, takeProfit } = computeRiskLevels(
            signal.entry_price,
            direction,
            candle,
            risk,
        );

        let exec;
        try {
            exec = await oms.submit({
                userId: a.watchlists?.user_id || null,
                broker: BrokerType.PAPER,
                brokerCredentialId: null,
                signalId: signal.id,
                watchlistStrategyId: a.id,
                symbol: signal.symbol,
                market: (signal.market as Market) || Market.FUTURES,
                direction,
                entryType: 'MARKET',
                entryPrice: signal.entry_price,
                stopLoss,
                takeProfit,
                riskSettings: risk,
                timeframe: signal.timeframe,
            });
        } catch (err: any) {
            console.error('[ExecutionEngine] oms.submit failed:', err?.message || err);
            continue;
        }

        if (!exec) continue;

        // Ensure the kline stream covers this symbol BEFORE adding to
        // activeBySymbol so the tick handler can't be called with no stream.
        await binanceStream.ensureKlineStream(signal.symbol);
        addActive(exec);
    }
```

Note two deletions: (1) the direct `insertExecution` call (OMS does it internally), (2) the `brokerAdapters.execute(exec)` shim call — the OMS already invokes the adapter's `submitBracket`.

- [ ] **Step 3: Add the import**

Near the top of `executionEngine.ts`, add alongside other imports:

```typescript
import { oms } from '../services/oms';
```

- [ ] **Step 4: Remove now-unused imports**

Check if `insertExecution` is still used elsewhere in this file (Grep for it). If only that one call site used it, remove it from the import line. Same check for `brokerAdapters` — it's likely still used by `onClose` on close. Leave `brokerAdapters` import alone.

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual regression test**

Run: `pnpm worker` (or the worker-start script). Let it run for 5 minutes. Verify:

1. At least one new signal is generated and a `signal_executions` row is created with `status='Active'` (OMS marked it Active after successful bracket).
2. Query `SELECT * FROM broker_orders WHERE execution_id = '<new_exec_id>';` — expect 3 rows (ENTRY/SL/TP), all with `broker='paper'`, `broker_order_id IS NULL`, entry `status='Filled'`, SL/TP `status='Open'`.
3. When the price hits TP or SL, the execution closes as before (execution engine's tick monitor still does the close — that code path is unchanged).
4. UI on the Signals page behaves identically.

---

## Task 12: Post-migration cleanup — data migration of existing user_exchange_keys

**Files:**
- Create: `backend/schema/064_migrate_user_exchange_keys.sql`

- [ ] **Step 1: Write the data migration**

```sql
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
        FROM public.user_exchange_keys
        WHERE NOT EXISTS (
            SELECT 1 FROM public.user_exchange_keys_v2 v2 WHERE v2.user_id = user_exchange_keys.user_id
                  AND v2.broker = user_exchange_keys.exchange
                  AND v2.nickname = user_exchange_keys.nickname
        )
    LOOP
        SELECT * INTO enc FROM public.credential_encrypt(r.api_key, r.api_secret);
        INSERT INTO public.user_exchange_keys_v2
            (user_id, broker, nickname, api_key_encrypted, api_secret_encrypted, nonce, is_active, created_at, updated_at)
        VALUES
            (r.user_id, r.exchange, r.nickname, enc.api_key_encrypted, enc.api_secret_encrypted, enc.nonce, r.is_active, r.created_at, r.updated_at);
    END LOOP;
END $$;
```

- [ ] **Step 2: User applies via Supabase SQL editor**

- [ ] **Step 3: Verify**

```sql
SELECT
    (SELECT count(*) FROM public.user_exchange_keys) AS old_count,
    (SELECT count(*) FROM public.user_exchange_keys_v2) AS new_count;
```

Expected: counts are equal (or v2 ≥ old if duplicates detected). Run:

```sql
-- Spot-check a migrated row round-trips
SELECT (credential_decrypt(api_key_encrypted, api_secret_encrypted, nonce)).*
FROM public.user_exchange_keys_v2
LIMIT 1;
```

Expected: returns plaintext matching the original row.

---

## Task 13: Final verification — full regression

- [ ] **Step 1: Restart the worker**

Stop the existing worker process. Start fresh: `pnpm worker`.

- [ ] **Step 2: Let it run for 10 minutes**

Monitor logs for errors. Expect the usual kline connection + cold-start scan output. No new errors.

- [ ] **Step 3: Verify no orphaned rows**

```sql
-- Executions with Pending status (stuck in OMS)
SELECT count(*) FROM public.signal_executions WHERE status = 'Pending';

-- Broker orders without an execution
SELECT count(*) FROM public.broker_orders bo
LEFT JOIN public.signal_executions se ON bo.execution_id = se.id
WHERE se.id IS NULL;
```

Expected: both counts = 0.

- [ ] **Step 4: Verify Signals page**

Open the Signals page in a browser. Check:
- New signals appear as before
- Active/Closed statuses render correctly
- P&L bar updates
- Execute button still works on paper executions

- [ ] **Step 5: Verify credential vault in isolation**

The Task 7 Step 3 script must have passed. Re-run it with a fresh test user.

---

## Self-Review Checklist

1. **Spec coverage:**
   - `BrokerAdapter` interface ✓ (Task 4)
   - OMS `submit()` with 9-step pipeline ✓ (Task 8)
   - Credential vault with pgsodium ✓ (Task 7)
   - 3 new tables ✓ (Tasks 1, 2, 3)
   - Paper broker rewritten ✓ (Task 9)
   - `handleNewSignal` rewired ✓ (Task 11)
   - Data migration for existing credentials ✓ (Task 12)
   - Regression test ✓ (Task 13)
   - OmsError typed union ✓ (Task 5)
   - `brokerOrderStorage` CRUD ✓ (Task 6)

2. **Placeholder scan:** None — every step shows full code or exact SQL.

3. **Type consistency:**
   - `BrokerAdapter` from Task 4 is imported by Tasks 8, 9, 10.
   - `OrderIntent` defined in Task 8, used in Task 11.
   - `BrokerOrderLeg` shape is identical across Tasks 4, 6, 9.
   - `OmsError` used in Tasks 5, 8.
   - `BrokerCredentials` defined in Task 4, used in Tasks 7, 9.
   - Signal status values: Task 8 uses `SignalStatus.PENDING` — if that enum member doesn't exist, the task's Step 2 says use string `'Pending'`. The `signal_executions` status CHECK constraint in existing migrations allows it.

4. **Known risks (reflected in the plan):**
   - `SignalStatus.PENDING` may not exist as enum member — Task 8 Step 2 handles the fallback.
   - pgsodium may not be enabled — migration uses `CREATE EXTENSION IF NOT EXISTS` so it's safe.
   - The `insertExecution` helper stays intact; only one call site is rewired.
