# Broker Foundation — Phase 0 Design

**Date:** 2026-04-17
**Status:** Approved, ready for implementation plan
**Part of:** Multi-broker trading platform initiative (8 phases total)

## Summary

Phase 0 establishes the foundational architecture that all future brokers (Binance, Bybit, Coinbase, OANDA, Zerodha) and all future entry points (Signals Execute, Market panel, My Scripts auto-trade) will build on. It introduces a `BrokerAdapter` interface, an Order Management System (OMS), a credential vault with encrypted storage, and three new database tables. Crucially, this phase ships **no user-visible change** — paper trading still works identically to today. The goal is to route all existing code paths through the new abstraction so that Phase 1 (first live broker) needs to touch only one new file.

## Scope

### In scope

- `BrokerAdapter` TypeScript interface (contract every broker implements)
- OMS service with a single `submit(intent)` entry point that handles validate → normalize → size → risk-check → persist → dispatch
- Credential vault service using Supabase `pgsodium` for AES-256 encryption at rest
- Three new Postgres tables: `user_exchange_keys_v2`, `broker_orders`, `fills_log`
- Rewrite of `paperBrokerAdapter` to implement the full `BrokerAdapter` interface
- Re-wire existing `handleNewSignal` in `executionEngine.ts` to call `oms.submit()` instead of writing directly to `signal_executions`
- Unit tests for OMS sizing, validation, risk checks

### Out of scope (deferred to later phases)

- Binance broker adapter (Phase 1)
- Any new UI — including Settings page for API keys (Phase 1)
- Auto-trade flag on assignments (Phase 2)
- Market page order panel (Phase 3)
- Bybit, OANDA, Zerodha adapters (Phases 4–6)
- Redis order queue, sharding, circuit breaker (Phase 7)
- `positions` table (Phase 1 — paper doesn't need it)

## Architecture

```
┌──────────────────────────────────────────────┐
│  EXISTING ENTRY POINTS (unchanged for now)    │
│  executionEngine.handleNewSignal()            │
└───────────────────┬───────────────────────────┘
                    │ calls
                    ▼
┌──────────────────────────────────────────────┐
│  OMS — Order Management System (NEW)          │
│  oms.submit(intent) → 9-step pipeline         │
└───────────────────┬───────────────────────────┘
                    │ dispatches via
                    ▼
┌──────────────────────────────────────────────┐
│  BrokerAdapter interface (NEW)                │
│  submitBracket / cancelOrder / getPosition    │
│  subscribeFills / ping                        │
└───────────────────┬───────────────────────────┘
                    │ implemented by
                    ▼
┌──────────────────────────────────────────────┐
│  paperBrokerAdapter (REWRITTEN)               │
│  Writes to broker_orders + fills_log          │
│  Synchronous "fills" via engine's SL/TP       │
└───────────────────┬───────────────────────────┘
                    │ persists to
                    ▼
┌──────────────────────────────────────────────┐
│  Postgres: signal_executions (existing)       │
│            broker_orders (NEW)                │
│            fills_log (NEW)                    │
│            user_exchange_keys_v2 (NEW)        │
└──────────────────────────────────────────────┘
```

## Components

### 1. `BrokerAdapter` interface
**Path:** `backend/server/src/engine/brokerAdapters/types.ts`

```ts
export interface BrokerCredentials {
    id: string;
    userId: string;
    broker: string;
    apiKey: string;     // decrypted in memory only
    apiSecret: string;  // decrypted in memory only
}

export interface BracketInput {
    symbol: string;
    side: 'BUY' | 'SELL';
    qty: number;
    entryType: 'MARKET' | 'LIMIT';
    entryPrice?: number;      // required if entryType=LIMIT
    stopLoss: number;
    takeProfit: number;
    reduceOnly?: boolean;
}

export interface BrokerOrderLeg {
    brokerOrderId: string | null;  // null for paper
    role: 'ENTRY' | 'SL' | 'TP';
    status: 'Pending' | 'Open' | 'Filled' | 'Cancelled' | 'Rejected';
    price: number | null;
    stopPrice: number | null;
    qty: number;
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
    qty: number;           // signed (positive=long, negative=short)
    avgEntryPrice: number;
    unrealizedPnl: number;
}

export interface BrokerAdapter {
    submitBracket(input: BracketInput, creds: BrokerCredentials): Promise<BracketResult>;
    cancelOrder(brokerOrderId: string, symbol: string, creds: BrokerCredentials): Promise<void>;
    getOpenOrders(symbol: string, creds: BrokerCredentials): Promise<BrokerOrderLeg[]>;
    getPosition(symbol: string, creds: BrokerCredentials): Promise<BrokerPosition | null>;
    subscribeFills(creds: BrokerCredentials, onFill: (fill: FillEvent) => void): () => void;
    ping(creds: BrokerCredentials): Promise<boolean>;
}
```

### 2. OMS — Order Management System
**Path:** `backend/server/src/services/oms.ts`

Single public function: `oms.submit(intent)`. Internally runs 9 steps:

```ts
export interface OrderIntent {
    userId: string | null;              // null = platform signal (future)
    broker: BrokerType;                 // PAPER | BINANCE | ...
    brokerCredentialId: string | null;  // null for paper
    signalId: string | null;            // null for manual Market-page orders
    watchlistStrategyId: string | null;
    symbol: string;
    market: Market;
    direction: TradeDirection;
    entryType: 'MARKET' | 'LIMIT';
    entryPrice: number;                 // for LIMIT; market ref for sizing
    stopLoss: number;
    takeProfit: number;
    riskSettings: RiskSettings;         // lot_size, leverage
    timeframe: string;
}

export const oms = {
    async submit(intent: OrderIntent): Promise<SignalExecutionRow> {
        // Step 1: Validate intent (non-empty fields, side sign consistent with SL/TP)
        // Step 2: Normalize (uppercase symbol, tick/lot snap)
        // Step 3: Compute position size (qty) from riskSettings
        // Step 4: Risk check (max position per user, kill switch, daily loss)
        // Step 5: Resolve credentials (null for paper, vault decrypt for real)
        // Step 6: Insert signal_executions row with status='Pending'
        // Step 7: Call adapter.submitBracket()
        // Step 8: Insert broker_orders rows for each leg returned
        // Step 9: Update signal_executions.status = 'Active' on success, 'Rejected' on failure
        // Return the SignalExecutionRow
    }
};
```

Steps 1–4 throw typed `OmsError` on failure (Validation, Sizing, Risk, Rejected). The caller decides how to surface these (API, log, notify).

### 3. Credential Vault
**Path:** `backend/server/src/services/credentialVault.ts`

Uses Supabase `pgsodium` functions (`pgsodium.crypto_aead_det_encrypt` / `pgsodium.crypto_aead_det_decrypt`) invoked via RPC. Master key managed by Supabase; we never see it.

```ts
export const credentialVault = {
    // Store a new API key/secret pair for a user.
    async store(params: {
        userId: string; broker: string; nickname: string;
        apiKey: string; apiSecret: string;
    }): Promise<{ id: string }>;

    // Retrieve (decrypt) a user's credentials for a broker. Uses first active row.
    async retrieve(userId: string, broker: string): Promise<BrokerCredentials | null>;

    // Retrieve by specific credential id.
    async retrieveById(id: string): Promise<BrokerCredentials | null>;

    // List credentials for a user (metadata only, NEVER returns secrets).
    async listForUser(userId: string): Promise<{
        id: string; broker: string; nickname: string;
        is_active: boolean; last_verified_at: string | null;
    }[]>;

    // Remove a credential row.
    async remove(id: string, userId: string): Promise<void>;

    // Call adapter.ping(creds) to verify the credentials work.
    async verify(id: string, userId: string): Promise<boolean>;
};
```

### 4. Paper broker (rewritten)
**Path:** `backend/server/src/engine/brokerAdapters/paperBroker.ts`

```ts
export const paperBrokerAdapter: BrokerAdapter = {
    async submitBracket(input, _creds) {
        // Paper has no external API. All three legs are "synthetic":
        // - Entry leg: status='Filled' immediately at input.entryPrice
        // - SL leg: status='Open' (our execution engine monitors this)
        // - TP leg: status='Open' (our execution engine monitors this)
        // Write broker_orders rows with broker_order_id=null.
        // Write one fills_log row for the entry fill.
        return { legs: [/* 3 legs */] };
    },

    async cancelOrder(brokerOrderId, _symbol, _creds) {
        // Mark the paper broker_orders row as Cancelled.
    },

    async getOpenOrders(_symbol, _creds) { return []; },
    async getPosition(_symbol, _creds) { return null; },
    async subscribeFills(_creds, _onFill) { return () => {}; },
    async ping(_creds) { return true; },
};
```

Paper "fills" for SL/TP come from the existing execution engine's tick monitor, which writes a `fills_log` row whenever it closes an execution. No behavior change for paper users.

### 5. Database migrations

Three new tables, one in each migration file:

**Migration 061 — `user_exchange_keys_v2`:**
- Supersedes `user_exchange_keys` (which stored plaintext secrets)
- Data migration script backfills existing rows by encrypting them into v2
- The old table stays for backward-compat until Phase 1 removes it
- RLS: user can only see their own; inserts only for own `user_id`

**Migration 062 — `broker_orders`:**
- 1:N with `signal_executions` (an execution has 1–3 broker order legs)
- RLS: read-only via join on `signal_executions.user_id`; backend writes only

**Migration 063 — `fills_log`:**
- N:1 with `broker_orders`
- Immutable (no UPDATE policy)
- RLS: read-only for owning user; backend writes only

### 6. Rewire `executionEngine.handleNewSignal`

Before:
```ts
const exec = await insertExecution({ ... });
if (exec) addActive(exec);
await brokerAdapters.execute(exec);
```

After:
```ts
const exec = await oms.submit({
    userId: a.watchlists?.user_id || null,
    broker: BrokerType.PAPER,
    brokerCredentialId: null,
    signalId: signal.id,
    watchlistStrategyId: a.id,
    symbol: signal.symbol,
    market: Market.FUTURES,
    direction,
    entryType: 'MARKET',
    entryPrice: signal.entry_price,
    stopLoss,
    takeProfit,
    riskSettings: risk,
    timeframe: signal.timeframe,
});
if (exec) await binanceStream.ensureKlineStream(signal.symbol), addActive(exec);
```

`insertExecution` stays as a storage helper called internally by OMS step 6. Not deleted.

## Data flow

```
handleNewSignal(payload)
    │
    ├─ computeRiskLevels() → SL, TP
    │
    └─ oms.submit(intent)
            │
            ├─ validate intent
            ├─ normalize symbol/qty
            ├─ compute size
            ├─ risk check (max position, kill switch)
            ├─ credentialVault.retrieveById() if non-paper
            ├─ INSERT signal_executions (status=Pending)
            ├─ adapter.submitBracket()
            ├─ INSERT broker_orders rows
            └─ UPDATE signal_executions.status = Active / Rejected
    │
    └─ ensureKlineStream() + addActive()
```

## Error handling

- **`OmsError`** — typed discriminated union: `{ kind: 'validation' | 'sizing' | 'risk' | 'credential' | 'broker' | 'db', message: string, retryable: boolean }`
- **`OrderIntent` validation fails** → OMS throws `OmsError.validation`, execution never inserted
- **Risk check fails** (position cap, kill switch) → `OmsError.risk`
- **Credential decrypt fails** → `OmsError.credential`, user gets actionable message
- **Broker adapter throws** → `OmsError.broker`; the `signal_executions` row already created in Step 6 is marked `status='Rejected'` with `rejected_reason`
- **DB insert fails** mid-flight → OMS returns `OmsError.db`; log + alert, caller retries later

No silent failures anywhere.

## Testing

- Unit tests for OMS with mocked adapter: validation pass/fail for each edge case, sizing math for different risk settings, risk-check rejection paths
- Integration test: end-to-end `oms.submit` with paper broker → verify `signal_executions`, `broker_orders`, `fills_log` rows are created correctly
- Manual verification: create a paper signal as before; confirm it behaves identically to pre-refactor (P&L updates, TP/SL close, UI unchanged)
- Credential vault round-trip test: encrypt → store → retrieve → decrypt → bytes match

## Security

- Master encryption key managed by Supabase Vault (`pgsodium`), never seen by the application
- Decrypted secrets exist only in-memory during an adapter call; never logged, never returned to the frontend
- RLS strictly enforces user can only see their own rows in all 3 new tables
- `credentialVault.listForUser()` returns metadata only, no secrets

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Rewriting `handleNewSignal` breaks existing paper-trading flow | Keep `insertExecution()` as a helper; OMS step 6 calls it. Run full regression test before merge. |
| Supabase `pgsodium` not enabled by default | Verify enabled in target Supabase project; migration includes `CREATE EXTENSION IF NOT EXISTS pgsodium` (safe no-op if already enabled) |
| Migration of existing `user_exchange_keys` plaintext rows | Write a one-shot data-migration script that reads old rows, encrypts, inserts into v2. Old table stays until Phase 1 confirms nothing reads it. |
| OMS becomes a god-object over time | Deliberate scope: `submit()` is the only public method. Helpers are internal. Any new cross-cutting concern goes in its own service (risk, sizing). |

## Deliverables checklist

- [ ] `BrokerAdapter` interface + all supporting types in `brokerAdapters/types.ts`
- [ ] `oms.ts` with `submit()` implementation and `OmsError`
- [ ] `credentialVault.ts` with pgsodium-backed encrypt/decrypt
- [ ] Migration 061: `user_exchange_keys_v2`
- [ ] Migration 062: `broker_orders`
- [ ] Migration 063: `fills_log`
- [ ] `paperBrokerAdapter` rewritten to full interface
- [ ] `executionEngine.handleNewSignal` rewired to call `oms.submit()`
- [ ] Unit tests for OMS
- [ ] Manual regression test: paper trading behaves identically
- [ ] No user-visible change confirmed

## Out of scope (confirmed)

- No UI changes
- No real broker (Binance)
- No Redis
- No positions table
- No API-key management UI
- No auto-trade flag

## Next phase

Phase 1 — First Live Broker (Binance crypto, Settings UI for API keys, Signals Execute goes live).
