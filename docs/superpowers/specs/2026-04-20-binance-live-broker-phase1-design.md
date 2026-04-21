# Binance Live Broker + Signals Execute — Phase 1 Design

**Date:** 2026-04-20
**Status:** Approved, ready for implementation plan
**Depends on:** Phase 0 Foundation (OMS, BrokerAdapter interface, credential vault, broker_orders + fills_log tables)
**Part of:** Multi-broker trading platform initiative (8 phases total)

## Summary

Phase 1 ships the first real broker. Users connect a Binance API key (testnet or mainnet), pick "Binance" as the broker when clicking Execute on a signal, and the system submits a live bracket order (MARKET entry + STOP_MARKET SL + TAKE_PROFIT_MARKET TP) on Binance Futures. Fill events stream back via user-data WebSocket and are reconciled against our internal state. Paper trading continues unchanged as the default.

## Scope

### In scope

- `binanceBroker.ts` — full `BrokerAdapter` implementation for USDT-M Futures (testnet + mainnet)
- `binanceUserDataStream.ts` — per-user listen-key WS manager with keepalive and reconnect
- `fillReconciler.ts` — translates `FillEvent` into DB updates on `broker_orders`, `fills_log`, and `signal_executions`
- `positionSizer.ts` — shared 4-mode qty calculator (`fixed_notional`, `risk_pct`, `risk_fixed`, `fixed_qty`)
- Migration 065 — add `network` column (`testnet` | `mainnet`) to `user_exchange_keys_v2`
- 4 REST API routes for credential management (list / create / verify / delete)
- `BrokerSettings.tsx` page for managing API keys with "Test connection"
- `ExecuteTradeModal.tsx` — new broker selector, live submission path, error surfacing
- Integration test: end-to-end TP hit and SL hit on Binance testnet

### Out of scope (deferred)

- My Scripts auto-trade on live Binance — **Phase 2**
- Market page order panel — **Phase 3**
- Spot trading (we do Futures only in Phase 1) — later phase
- Non-Binance brokers (Bybit, Coinbase, OANDA, Zerodha) — later phases
- Redis order queue, horizontal scaling, kill switches — **Phase 7**
- Position roll-ups / portfolio view — later phase
- Post-trade analytics, commission tracking — later phase
- Email/push notifications on fills — later phase

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ExecuteTradeModal (Signals page)                            │
│  User picks broker, sizing mode, amount → submit             │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP POST
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/execute-signal  (new route)                       │
│  Builds OrderIntent, calls oms.submit()                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  oms.submit() from Phase 0                                   │
│  Validate → normalize → positionSizer.computeQty()           │
│  → credentialVault.retrieveById() → adapter.submitBracket()  │
│  → insertBrokerOrder() × 3 → finalize execution              │
└────────────────────┬────────────────────────────────────────┘
                     │ when broker=binance
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  binanceBroker.submitBracket()                               │
│  1. POST entry MARKET                                        │
│  2. Poll until FILLED (≤5s)                                  │
│  3. POST SL + TP in parallel with reduceOnly                 │
│  4. Retry 3× on leg failure                                  │
│  5. On unrecoverable leg failure → force close + reject      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
                 Binance API
                     │
                     │ fill events
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  binanceUserDataStream — WS stream                           │
│  filters ORDER_TRADE_UPDATE → calls onFill callbacks         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  fillReconciler                                              │
│  Update broker_orders, insert fills_log,                     │
│  close signal_executions on SL/TP fill                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
                Supabase Realtime → frontend UI updates
```

## Components

### 1. `binanceBroker`
**Path:** `backend/server/src/engine/brokerAdapters/binanceBroker.ts`

Implements the Phase 0 `BrokerAdapter` interface. Uses `ccxt` for signed REST calls. Reads `network` from credentials to choose base URL.

**Constants:**
```ts
const BASE_URLS = {
    mainnet: { rest: 'https://fapi.binance.com', ws: 'wss://fstream.binance.com/ws' },
    testnet: { rest: 'https://testnet.binancefuture.com', ws: 'wss://stream.binancefuture.com/ws' },
};
```

**`submitBracket(input, creds)` — sequential flow:**

1. Normalize qty via exchange precision (`exchange.amountToPrecision`)
2. Submit entry MARKET order (`POST /fapi/v1/order` with `type=MARKET`, `side=input.side`, `quantity=qty`)
3. If entry submission fails (HTTP non-2xx, margin error, etc.) → return `BracketResult` with all 3 legs `Rejected`
4. Poll `GET /fapi/v1/order` every 200ms up to 5s until `status=FILLED`. If timeout: cancel the entry, return Rejected
5. Submit SL + TP in parallel:
   - SL: `type=STOP_MARKET`, `stopPrice=input.stopLoss`, `side=opposite(input.side)`, `reduceOnly=true`, `closePosition=true`
   - TP: `type=TAKE_PROFIT_MARKET`, `stopPrice=input.takeProfit`, `side=opposite(input.side)`, `reduceOnly=true`, `closePosition=true`
6. If either fails: retry 3× with exponential backoff (200 / 400 / 800 ms)
7. If either leg still fails after retries: force-close the position via `closePosition=true` MARKET order, return `BracketResult` with filled entry + rejected SL/TP + `rejectedReason="SL placement failed"`
8. Return `BracketResult` with 3 legs populated (entry Filled, SL Open, TP Open)

**Force-close helper** (only called in step 7): submit a `MARKET` order with `side=opposite(input.side)`, `closePosition=true`.

**`cancelOrder(brokerOrderId, symbol, creds)`** → `DELETE /fapi/v1/order?orderId=...&symbol=...`

**`getOpenOrders(symbol, creds)`** → `GET /fapi/v1/openOrders?symbol=...` → map Binance response to `BrokerOrderLeg[]`

**`getPosition(symbol, creds)`** → `GET /fapi/v2/positionRisk?symbol=...` → returns `BrokerPosition | null`

**`subscribeFills(creds, onFill)`** → delegates to `binanceUserDataStream.subscribe(creds, onFill)`. Returns the unsubscribe fn.

**`ping(creds)`** → `GET /fapi/v2/account`. Returns `true` if status 200 with valid JSON.

### 2. `binanceUserDataStream`
**Path:** `backend/server/src/services/binanceUserDataStream.ts`

Manages user-data WebSocket connections. Stateful singleton.

**Per-credential state:**
```ts
interface UserStream {
    credId: string;
    network: 'mainnet' | 'testnet';
    apiKey: string;   // retained in memory only
    listenKey: string;
    ws: WebSocket;
    callbacks: Set<(fill: FillEvent) => void>;
    keepaliveTimer: NodeJS.Timeout;
    reconnectAttempts: number;
}
```

**Lifecycle:**
1. `subscribe(creds, onFill)`:
   - If already have a stream for this credential, add `onFill` to callbacks
   - Else: `POST /fapi/v1/listenKey` (Binance-signed) → opens WS to `<ws_base>/<listenKey>` → stores state → sets 30-min keepalive interval
2. Keepalive: every 30 min, `PUT /fapi/v1/listenKey`. On failure, force reconnect.
3. On incoming WS message:
   - Parse `e` field
   - If `e === 'ORDER_TRADE_UPDATE'` and `o.X === 'FILLED' || 'PARTIALLY_FILLED'`:
     - Build `FillEvent` from `o.i` (order id), `o.s` (symbol), `o.l` (fill qty), `o.L` (fill price), `o.m` (is maker), `o.n` (commission), `o.N` (commission asset)
     - Fire all registered callbacks
4. On WS close/error: reconnect with exponential backoff. Re-fire callbacks with `subscribe()` reconnection path.

### 3. `fillReconciler`
**Path:** `backend/server/src/services/fillReconciler.ts`

Single module. Listens to all adapter `subscribeFills` outputs. Functions:

**`handleFill(fill: FillEvent)`:**
1. Look up `broker_orders` by `broker_order_id === fill.brokerOrderId`
2. If not found: log warning, return (fill predates any order we know about)
3. Insert `fills_log` row with the raw event
4. Update `broker_orders` row:
   - `filled_qty += fill.fillQty`
   - `avg_fill_price` = weighted average
   - `status = 'Filled'` if `filled_qty >= qty`
5. If this order's `role` is `SL` or `TP` AND `status === 'Filled'`:
   - Find the `signal_executions` row via `execution_id`
   - Call `closeExecution(id, reason='SL'|'TP', closePrice=fill.fillPrice, pnl)`
   - Cancel the opposing leg (if SL filled, cancel TP; if TP filled, cancel SL)

**REST polling fallback** (`syncOpenOrders`):
- Every 60s for each active user-data stream: `GET /fapi/v1/allOrders?symbol=X&startTime=lastSyncMs`
- For any order where our `broker_orders.status !== Binance status`, call `handleFill` with a synthesized event

### 4. `positionSizer`
**Path:** `backend/server/src/services/positionSizer.ts`

```ts
export type SizingMode = 'fixed_notional' | 'risk_pct' | 'risk_fixed' | 'fixed_qty';

export interface SizingInput {
    mode: SizingMode;
    notional?: number;
    riskPct?: number;
    riskFixed?: number;
    fixedQty?: number;
    leverage: number;
    entryPrice: number;
    stopLoss: number;
    balance: number;
}

export function computeQty(input: SizingInput): number {
    const stopDistance = Math.abs(input.entryPrice - input.stopLoss);
    if (stopDistance === 0) throw new Error('stopDistance cannot be 0');

    switch (input.mode) {
        case 'fixed_notional': return (input.notional! * input.leverage) / input.entryPrice;
        case 'risk_pct':       return (input.balance * input.riskPct! / 100) / stopDistance;
        case 'risk_fixed':     return input.riskFixed! / stopDistance;
        case 'fixed_qty':      return input.fixedQty!;
    }
}
```

Called from OMS Step 3 when `broker !== 'paper'`. Paper broker continues to use `lotSize × leverage` as before.

### 5. Database migration

**Migration 065:**
```sql
ALTER TABLE public.user_exchange_keys_v2
    ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'mainnet'
    CHECK (network IN ('testnet', 'mainnet'));
```

No other schema changes. `broker_orders`, `fills_log`, and `user_exchange_keys_v2` from Phase 0 already cover everything.

### 6. REST API routes
**Path:** `backend/server/src/routes/brokerCredentials.ts`

All routes require authenticated Supabase JWT.

- **`GET /api/broker-credentials`** → `credentialVault.listForUser(userId)`. Returns metadata (no secrets).
- **`POST /api/broker-credentials`** body: `{ broker, network, nickname, apiKey, apiSecret }` → `credentialVault.store(...)`. Returns `{ id }`.
- **`POST /api/broker-credentials/:id/verify`** → `credentialVault.retrieveById(id)` → `adapter.ping(creds)` → `credentialVault.markVerified(id)` on success. Returns `{ ok: boolean }`.
- **`DELETE /api/broker-credentials/:id`** → `credentialVault.remove(id, userId)`. Returns `{ ok: true }`.

Additionally:

- **`POST /api/execute-signal`** body: `{ signalId, brokerCredentialId, sizingMode, sizingParams, leverage }` → builds `OrderIntent` → calls `oms.submit()` → returns `{ executionId }` or error.

### 7. Frontend — `BrokerSettings.tsx`
**Path:** `src/pages/BrokerSettings.tsx`
**Route:** `/settings/brokers`

Sections:
1. **My Broker Connections** — table: nickname, broker, network (pill: Testnet / Mainnet), last verified, active toggle, Delete button
2. **Add Credential** button → modal
3. **Info panel** on the right with setup instructions ("How to create a Binance API key with trade permission")

**Add Credential modal:**
- Broker dropdown (Binance only in Phase 1)
- Network toggle (Testnet default, Mainnet requires confirmation checkbox "I understand this uses real money")
- Nickname input
- API Key textarea
- API Secret textarea (type=password, masked)
- **Test Connection** button → calls `POST /api/broker-credentials/:id/verify` after saving; shows green check or red error
- **Save** button → calls `POST /api/broker-credentials`; disabled until Test passes

### 8. Frontend — `ExecuteTradeModal.tsx` changes
**Path:** `src/components/ExecuteTradeModal.tsx`

Additions to existing modal:
- **Broker selector** at top — dropdown:
  - "Paper (default)" (always)
  - Any user-connected Binance Testnet credentials
  - Any user-connected Binance Mainnet credentials (with warning icon)
- **Sizing mode** radio (Fixed Notional / Risk % / Risk $ / Fixed Qty) — already partly present, just wire to backend
- **Warning banner** in red if broker = mainnet: "Live mode — real money at risk"
- Submit button text: "BUY 20× (Paper)" / "BUY 20× (Testnet)" / "BUY 20× (LIVE)"

On submit:
- If broker = paper → existing flow (calls current paper API)
- If broker = binance* → `POST /api/execute-signal` with broker credential ID + sizing params
- Surface `OmsError` as toast (specific messages for validation, credential failure, broker rejection, SL placement failure)

## Error handling

Binance-specific errors (mapped into `OmsError`):
- `-2019 Margin is insufficient` → `OmsError.risk('Insufficient margin')`
- `-2010 Account has insufficient balance` → `OmsError.risk('Insufficient balance')`
- `-4131 Leverage exceeds maximum` → `OmsError.validation('Leverage too high')`
- `-1121 Invalid symbol` → `OmsError.validation('Invalid symbol')`
- `-4003 Quantity less than zero` → `OmsError.sizing('Invalid qty')`
- Network timeout (>5s) → `OmsError.broker('Timeout', retryable=true)`
- SL/TP placement fails after 3 retries → force-close position → `OmsError.broker('SL placement failed, position force-closed')`

All mapped in `binanceBroker.ts` before throwing.

## Security

- API keys encrypted at rest via Phase 0 `credentialVault`
- Decrypted secrets live in memory only during the active adapter call
- Never logged (no `console.log(creds)` or `console.log(apiKey)` anywhere in the codebase)
- Never returned to the frontend — `listForUser` returns metadata only
- `POST /api/broker-credentials/verify` requires the credential belong to `auth.uid()` — RLS enforced
- Recommended user setup (shown in UI): Binance API key with `Enable Futures` permission, `Enable Reading` permission, NO `Enable Withdrawals`, IP whitelist recommended

## Testing

1. **Unit tests** (where feasible):
   - `positionSizer.computeQty()` for each mode, edge cases (zero stopDistance, negative balance)
   - Binance error code → `OmsError` mapping
2. **Integration test against Binance testnet** (manual script):
   - Create a testnet credential
   - Submit a BUY bracket via `oms.submit()` through the binance adapter
   - Manually move price via another testnet order to trigger TP → verify:
     - `fills_log` row inserted
     - `broker_orders` row for TP leg → status Filled
     - `signal_executions` row → status Closed, close_reason=TP
   - Repeat for SL hit
   - Repeat for manual close (`cancelOrder`)
3. **Regression manual test:**
   - Paper trading continues to produce `broker_orders` rows with `broker='paper'`, `broker_order_id=NULL`
   - Existing Signals page works for paper signals
   - No changes to the existing auto-close flow (tick monitor + candle-close fallback)

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| SL placement fails after entry fills — position unprotected | Force-close via market immediately; alert user; return `OmsError.broker` |
| User-data WebSocket drops silently | REST polling fallback every 60s catches missed events; WS has keepalive + reconnect |
| User's API key lacks Futures permission | Caught at credential Verify step; user sees clear error |
| User tries to trade with testnet balance of 0 | Caught at Binance `-2010` error; mapped to `OmsError.risk('Insufficient balance')` |
| Two users race to create the same listenKey | listenKey is per-API-key — no collision possible |
| User deletes credential while active orders exist | Soft-delete (set `is_active = false`) instead of hard-delete when orders are active |
| Listen-key expires mid-trade | 30-minute keepalive well inside the 60-minute TTL; reconnect logic handles forced expiry |
| Binance rate limits | ccxt handles weight-based rate limiting per endpoint; Phase 7 adds per-user rate limiting |
| Leverage/isolation mode mismatch | Default to Isolated margin + user-provided leverage on account setup; document in Settings page |

## Deliverables checklist

- [ ] Migration 065: `network` column on `user_exchange_keys_v2`
- [ ] `binanceBroker.ts` implementing `BrokerAdapter` with sequential bracket flow
- [ ] `binanceUserDataStream.ts` with listenKey lifecycle + reconnect
- [ ] `fillReconciler.ts` with WS + REST polling reconciliation
- [ ] `positionSizer.ts` with 4 sizing modes
- [ ] 4 REST routes in `routes/brokerCredentials.ts`
- [ ] 1 REST route `POST /api/execute-signal`
- [ ] `BrokerSettings.tsx` frontend page
- [ ] `ExecuteTradeModal.tsx` broker selector + live submission
- [ ] Integration test on Binance testnet (TP hit + SL hit)
- [ ] Manual regression: paper trading behaves identically
- [ ] Error mapping from Binance error codes to `OmsError` kinds

## Next phase

**Phase 2 — My Scripts Auto-Trade.** Adds `auto_trade` flag on `watchlist_strategies`; when true and `broker=binance`, `handleNewSignal` auto-submits via `oms.submit()` instead of paper. No UI change on My Scripts beyond the existing Master Auto Trade toggle (already in the UI per screenshot).
