# Signal Engine Cleanup & Hardening — Design Spec

**Date:** 2026-04-13  
**Status:** Approved  
**Scope:** Backend signal architecture refactor, with supporting frontend changes  
**Estimated effort:** 18–22 hours

---

## 1. Executive Summary

The signal engine currently works end-to-end but has accumulated 12 issues ranging from user-visible bugs (empty signal page after restart, stale watchlist configs) to architectural flaws (two overlapping engines, symbol format inconsistency, no per-user risk execution).

This spec describes a consolidated cleanup that:

1. **Deletes** the old `signalMonitor.ts`. Its SL/TP monitoring logic moves into the new Execution Engine described in point 2. Result: one writer per table, no race conditions.
2. **Splits** the signal lifecycle into a **Signal Engine** (scanner, generates shared event rows) and a new **Execution Engine** (per-user, per-watchlist execution with independent risk, SL/TP monitoring, and broker dispatch).
3. **Normalizes** the symbol format to Binance-native (`BTCUSDT`) with an explicit `market` field (`spot` | `futures`).
4. **Parameterizes** strategies — the `.kuri` file is a template, parameters are user-editable per watchlist assignment, every generated signal is stamped with the params that produced it.
5. **Unifies** built-in and custom strategy storage — `.kuri` files are dev source, the Supabase `scripts` table is runtime source of truth, auto-synced on backend restart.
6. **Hardens** reliability — cold-start scan, missed-candle replay, Supabase Realtime for instant config changes, per-assignment error surfacing.

After the cleanup, the system will:

- Use one Node.js worker running a unified Signal Engine + Execution Engine
- Read strategies from the DB only (with `.kuri` files as the source layer)
- Scan strategies event-driven on candle close, monitor executions tick-driven via Binance `@bookTicker`
- Produce one event per trigger (shared across all users) + one execution per watchlist assignment (per-user risk)
- Handle restarts, crashes, and config changes without user-visible gaps
- Be ready to add broker adapters (Binance live, Bybit, etc.) without architectural changes

---

## 2. Issues & Decisions

The cleanup addresses 12 issues identified through a structured review. For each, the brainstorming session produced a clear decision.

| # | Issue | Decision |
|---|---|---|
| 1 | Signal repetition | Keep current Kuri behavior — scripts control their own firing semantics. No engine-level dedupe of repeated trends. |
| 2 | Race between signal generator and monitor | **Delete `signalMonitor.ts`.** Its SL/TP monitoring responsibility moves into the new Execution Engine (see architectural decision below). Signal Engine writes to `signals`, Execution Engine writes to `signal_executions`. Each table has a single writer — race disappears by design. |
| 3 | Symbol format inconsistency (`BTC/USDT.P` vs `BTCUSDT` vs `BTC/USDT`) | Canonical format is **Binance-native `BTCUSDT`** + explicit `market` field (`spot` \| `futures`). Build a `symbolService.ts` with converters for CCXT, WebSocket, display. Migrate existing rows. |
| 4 | Engine waits up to 4h for first signal after startup | **Cold-start scan** on startup — run strategies once against the historical buffer. Use DB unique index `(strategy_id, params_snapshot, symbol, timeframe, candle_time)` to prevent duplicate signals across restarts. |
| 5 | Watchlist changes take 5 min to apply | **Supabase Realtime subscription** on `watchlist_strategies` + `watchlists` + `watchlist_items` tables. Changes propagate to the engine in milliseconds. |
| 6 | Strategy file edits need restart | Reframed as **parameterized strategies**. `.kuri` files define the template and parameter schema. Users edit per-assignment params in the UI. Same strategy can appear multiple times in the same watchlist with different param sets. Each generated signal/execution is stamped with `params_snapshot`. Closed signals preserve their params. Active signals finish under the old params. New signals use the new params. |
| 7 | Kuri runtime errors are silent | `last_error` + `last_error_at` columns on `watchlist_strategies`. Written when the strategy throws during execution, cleared on next successful run. Frontend shows a red warning icon next to broken assignments via Supabase Realtime. |
| 8 | In-memory state lost on restart | **Replay missed candles on startup.** Fetch klines from Binance REST for the outage window, walk through active executions, retroactively close any that hit SL or TP during downtime. |
| 9 | Custom vs built-in storage split | **Hybrid:** `.kuri` files are dev source of truth, committed to git. On every backend restart, `strategyLoader` upserts them into the Supabase `scripts` table. The runtime (engine + frontend) reads from the DB only. Custom user strategies stay in the same table, distinguished by `is_builtin = false` and `user_id != null`. |
| 10 | Frontmatter parser too simple | Use `js-yaml` library for frontmatter parsing. Extract parameter schema from `param.*()` calls in the Kuri script via regex. Frontmatter holds metadata (id, name, description, category, version). Params live in the script itself. |
| 11 | No strategy versioning | **Content-hash versioning.** Compute SHA-256 of the `.kuri` source, take first 8 chars, store as `template_version` on the `scripts` row. Stamp every generated signal with the hash. Enables performance comparisons: `GROUP BY template_version`. |
| 12 | No backfill on top-N pairs | **Platform stream** — 10 hardcoded symbols × SMA Trend default params × 1H timeframe. Generates executions with `user_id = NULL` visible to users with NO watchlists. Once a user creates a watchlist, they see their own executions only. |

### Additional architectural decision (emerged during clarification)

**Signal / Execution split.** The `signals` table becomes an immutable event log (one row per trigger, shared across users). A new `signal_executions` table holds per-user, per-watchlist execution state with independent SL/TP, status, broker, and P&L. This enables:

- Per-user risk settings without duplicating trigger events
- Clean separation: Signal Engine = scanner, Execution Engine = per-user executor
- Foundation for future broker adapters (paper, Binance, Bybit, etc.)
- Natural per-user statistics via `WHERE user_id = X` on executions

---

## 3. Architecture Overview

### High-level flow

```
Binance WebSocket
        │
        ├──► CANDLE_CLOSED ────► Signal Engine (scanner)
        │                              │
        │                              ├── runs strategies via strategyRunner
        │                              ├── INSERT into signals (unique-index dedupe)
        │                              └── emits 'SIGNAL_CREATED' event
        │                                     │
        │                                     ▼
        │                      Execution Engine (executor)
        │                              │
        │                              ├── finds matching watchlist_strategies
        │                              ├── computes SL/TP from risk_settings
        │                              ├── INSERT into signal_executions
        │                              └── dispatches to broker adapter (paper/live)
        │
        └──► @bookTicker ─────► Execution Engine (monitor)
                                       │
                                       ├── for each active execution on this symbol:
                                       │     check SL/TP against bid/ask
                                       ├── UPDATE status='Closed' on hit (WHERE status='Active')
                                       └── notify broker adapter on close
```

### Process model

- **One backend worker** (`backend/server/src/worker.ts`) runs the unified engine 24/7
- **Supabase Realtime** feeds config changes (watchlist add/remove, param edits)
- **Supabase Postgres** is the single source of truth for strategies, watchlists, signals, and executions
- **Frontend** reads from Supabase only — never runs strategies

### Hybrid SL/TP monitoring

- **Strategy execution:** event-driven on closed candles (1m, 5m, 15m, 1H, 4H as needed)
- **Execution SL/TP monitoring:** tick-driven via Binance `@bookTicker` (best bid/ask)
  - BUY execution closes at bid when `bid <= stop_loss` or `bid >= take_profit`
  - SELL execution closes at ask when `ask >= stop_loss` or `ask <= take_profit`
- Dynamic subscription: symbols with active executions are subscribed; unsubscribed when all executions close

---

## 4. Data Model

### 4.1 `scripts` table (modified)

Holds both built-in and custom strategies.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `builtin-*` prefix for built-ins |
| `user_id` | uuid, nullable | NULL for built-ins |
| `name` | text | |
| `description` | text | |
| `source_code` | text | Kuri script body |
| `script_type` | text | `'STRATEGY'` or `'INDICATOR'` |
| `is_active` | boolean | |
| `configuration` | jsonb | Existing column, unchanged |
| **`is_builtin`** | boolean default false | **NEW** — true for `.kuri`-sourced strategies |
| **`template_version`** | text | **NEW** — first 8 chars of SHA-256(source_code) |
| **`param_schema`** | jsonb | **NEW** — extracted from `param.*()` calls |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 4.2 `watchlist_strategies` table (NEW)

Replaces `watchlists.strategy_ids`. Per-assignment configuration.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `watchlist_id` | uuid FK → watchlists | |
| `strategy_id` | uuid FK → scripts | |
| `params` | jsonb | User's param override values, e.g. `{ fastLen: 10, slowLen: 30 }` |
| `timeframe` | text | e.g. `'1H'` |
| `risk_settings` | jsonb | SL/TP rules, lot size, leverage, per assignment |
| `last_error` | text, nullable | Most recent Kuri runtime error |
| `last_error_at` | timestamptz, nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

A strategy can appear multiple times in the same watchlist with different params — each row is an independent assignment.

### 4.3 `signals` table (stripped down)

Immutable event log. One row per unique trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `strategy_id` | uuid FK → scripts | |
| `symbol` | text | Binance-native, e.g. `'BTCUSDT'` |
| **`market`** | text | **NEW** — `'spot'` or `'futures'` |
| `direction` | text | `'BUY'` or `'SELL'` |
| `entry_price` | numeric | Price at the triggering candle close |
| `timeframe` | text | |
| **`candle_time`** | timestamptz | **NEW** — timestamp of triggering candle |
| **`params_snapshot`** | jsonb | **NEW** — params used by the scanner |
| **`template_version`** | text | **NEW** — 8-char hash of the Kuri source |
| `created_at` | timestamptz | |

**Removed from `signals`:** `stop_loss`, `take_profit`, `status`, `closed_at`, `close_reason`, `profit_loss`, `user_id`. These move to `signal_executions`.

**Unique constraint (dedupe key):**
```sql
UNIQUE (strategy_id, params_snapshot, symbol, timeframe, candle_time)
```

Postgres atomically rejects duplicate inserts. Safe against cold-start scans, restart replays, and race conditions.

### 4.4 `signal_executions` table (NEW)

Per-user, per-watchlist execution of a signal. This is what paper trading, live trading, and the Signals UI read from.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `signal_id` | uuid FK → signals | |
| `watchlist_strategy_id` | uuid FK → watchlist_strategies, nullable | NULL for platform-stream executions |
| `user_id` | uuid FK → users, nullable | NULL for platform executions visible to users with no watchlists |
| `symbol` | text | Copied from signal |
| `market` | text | |
| `direction` | text | |
| `entry_price` | numeric | |
| `timeframe` | text | |
| `stop_loss` | numeric | Computed from risk_settings at creation |
| `take_profit` | numeric | |
| `lot_size` | numeric, nullable | From watchlist risk_settings |
| `leverage` | int, nullable | |
| `status` | text | `'Active'` or `'Closed'` |
| `closed_at` | timestamptz, nullable | |
| `close_reason` | text, nullable | `'TP'`, `'SL'`, `'MANUAL'`, `'TIMEOUT'` |
| `close_price` | numeric, nullable | Exact bid/ask at the tick that closed it |
| `profit_loss` | numeric, nullable | |
| `broker` | text | `'paper'` default; future `'binance'`, `'bybit'` |
| `broker_order_id` | text, nullable | Future use for real broker integration |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Indexes:**
```sql
CREATE INDEX idx_signal_executions_user_status 
  ON signal_executions (user_id, status) WHERE status = 'Active';

CREATE INDEX idx_signal_executions_symbol_active 
  ON signal_executions (symbol, status) WHERE status = 'Active';

CREATE INDEX idx_signal_executions_signal 
  ON signal_executions (signal_id);
```

### 4.5 `watchlist_items` table (modified)

| Column | Type | Notes |
|---|---|---|
| `symbol` | text | Migrated to Binance-native, no `.P` suffix |
| **`market`** | text | **NEW** — `'spot'` or `'futures'` |

### 4.6 `watchlists` table (legacy column removed)

`strategy_ids: text[]` is removed after migration to `watchlist_strategies` table.

---

## 5. Code Components

### 5.1 Backend

```
backend/server/src/
├── engine/
│   ├── signalEngine.ts          Scanner — runs strategies, writes signals events
│   ├── executionEngine.ts       NEW — handles signal → execution, monitors SL/TP
│   ├── strategyRunner.ts        NEW — executes Kuri script with param overrides
│   ├── riskCalculator.ts        NEW — computes SL/TP from risk_settings + candle
│   └── brokerAdapters/          NEW — pluggable execution destinations
│       ├── paperBroker.ts       Default — DB row IS the paper trade
│       ├── binanceBroker.ts     Placeholder for future live integration
│       └── index.ts             Router based on execution.broker
│
├── strategies/                   Source `.kuri` files (dev-editable)
│   └── sma-trend.kuri
│
├── services/
│   ├── strategyLoader.ts        Reads .kuri files, parses yaml, extracts param schema, upserts into DB
│   ├── watchlistService.ts      Loads assignments, Supabase Realtime subscription
│   ├── symbolService.ts         NEW — canonical Symbol type + converters
│   ├── signalStorage.ts         Writes signals (events)
│   ├── executionStorage.ts      NEW — writes signal_executions
│   ├── binanceStream.ts         Klines + @bookTicker subscription management
│   └── platformSignals.ts       NEW — generates platform executions for users with no watchlists
│
├── constants/
│   └── enums.ts                 NEW — TradeDirection, Market, etc.
│
├── utils/
│   └── eventBus.ts              Internal event bus (+ SIGNAL_CREATED event)
│
└── worker.ts                     Startup sequence
```

**Deleted:** `signalMonitor.ts`, old `strategyEngine.ts`, old `builtInStrategies.ts`.

### 5.2 Frontend

```
src/
├── pages/
│   ├── Signals.tsx              Shows signal_executions (not signals)
│   └── Market.tsx               Uses symbolService for formatting
│
├── components/strategy-studio/
│   ├── OpenScriptModal.tsx      Minor update — reads from updated registry
│   └── ParamEditorModal.tsx     NEW — renders form from param_schema
│
├── services/
│   ├── signalService.ts         Reads signal_executions
│   ├── signalEventService.ts    NEW — reads signals table (read-only, for audit)
│   └── watchlistService.ts      CRUD for watchlist_strategies
│
└── strategies/
    └── index.ts                 Vite glob for OpenScriptModal's built-in preview
```

### 5.3 Event bus contract

```ts
type Events = {
    CANDLE_CLOSED:  { symbol, timeframe, candle }
    PRICE_TICK:     { symbol, bid, ask, ts }
    SIGNAL_CREATED: { signal: SignalRow, triggered_by: 'candle' | 'cold_start' | 'replay' }
}
```

`SIGNAL_CREATED` is the handoff point between scanner and executor. The scanner knows nothing about users or risk. The executor knows nothing about Kuri or strategies.

### 5.4 Startup sequence (`worker.ts`)

```
1. Connect Supabase
2. strategyLoader.syncToDatabase()       .kuri → scripts table (upsert is_builtin = true)
3. executionEngine.prepare()              load active executions into memory
4. executionEngine.replayMissedCandles()  close any SL/TP hits during downtime (Issue #8)
5. signalEngine.start()                    kline subscribe + cold-start scan (Issue #4)
6. executionEngine.start()                 @bookTicker subscribe + SIGNAL_CREATED listener
7. Start HTTP status endpoint
```

Ordering matters: executor must be listening before the cold-start scan emits events.

---

## 6. Migration Plan

### 6.1 Phases

| Phase | Scope | Rollback-safe? |
|---|---|---|
| **1 — Foundation** | Install `js-yaml`, create `symbolService`, `enums.ts` | Yes |
| **2 — DB migrations** | Add new columns/tables, backfill symbols and watchlist_strategies | Yes (additive) |
| **3 — Backend refactor** | Update loaders, create engine split, delete legacy files | Yes (revert git) |
| **4 — Frontend refactor** | ParamEditorModal, Signals page update, error badges | Yes (revert git) |
| **5 — Cleanup** | Drop `watchlists.strategy_ids`, drop `signals.stop_loss/take_profit/status` | **Irreversible** — hold for 24h after Phase 4 ships |

All DB changes through Phase 4 are additive. Phase 5 is destructive and should only run after Phase 4 is verified in production for at least one day.

### 6.2 Migration SQL highlights

**Symbol normalization:**
```sql
UPDATE watchlist_items
   SET symbol = REPLACE(symbol, '.P', ''),
       market = 'futures'
 WHERE symbol LIKE '%.P';
```

**Watchlist strategies explosion:**
```sql
INSERT INTO watchlist_strategies (watchlist_id, strategy_id, params, timeframe)
SELECT w.id, unnest(w.strategy_ids), '{}'::jsonb,
       COALESCE(w.execution_timeframes[1], '1H')
  FROM watchlists w
 WHERE w.strategy_ids IS NOT NULL
   AND array_length(w.strategy_ids, 1) > 0;
```

**Signals → signal_executions migration:**
```sql
INSERT INTO signal_executions 
       (id, signal_id, user_id, symbol, market, direction, entry_price, timeframe,
        stop_loss, take_profit, status, closed_at, close_reason, profit_loss,
        created_at, updated_at, broker)
SELECT gen_random_uuid(),
       s.id, s.user_id, s.symbol, 'futures', s.direction, s.entry_price, s.timeframe,
       s.stop_loss, s.take_profit, s.status, s.closed_at, s.close_reason, s.profit_loss,
       s.created_at, s.updated_at, 'paper'
  FROM signals s;
```

After this insert, a separate one-time cleanup script collapses duplicate `signals` rows (same strategy/symbol/candle_time) into one, preserving `signal_executions` references.

### 6.3 Rollout

**Option chosen: single-shot deploy.**

1. Shut down backend worker
2. Run all migrations
3. Deploy new code
4. Start backend worker
5. Smoke test (see 6.4)

Expected downtime: 5–10 minutes.

### 6.4 Smoke test

After each phase:

1. Backend starts cleanly — log contains `[SignalEngine] Started successfully`
2. `strategyLoader` reports `Loaded N built-in strategies`
3. Binance WebSocket connects and subscribes to expected streams
4. A user can assign SMA Trend to a watchlist via the frontend
5. After the next candle close, a `signals` row AND a `signal_executions` row appear
6. Row values are correct: symbol format, market, template_version, params_snapshot
7. Restarting the worker during a test does not produce duplicate signal rows
8. Introducing a typo in `sma-trend.kuri` produces a `last_error` on the assignment
9. Fixing the typo clears `last_error` on the next successful run
10. Killing the worker during an active execution and restarting replays missed candles correctly

---

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Supabase Realtime drops silently | 60-second polling fallback |
| R2 | `@bookTicker` stream volume high | In-memory active executions cache keyed by symbol; auto-unsubscribe on zero actives |
| R3 | `param.*()` regex fragile | Conservative matching; skip unparseable lines with a warning, never crash |
| R4 | Content hash collision | Extremely unlikely at 8 chars, bump to 16 if ever observed |
| R5 | Phase 5 is irreversible | Hold 24h after Phase 4, full DB backup before running |
| R6 | Dedupe unique index rejects legitimate signals | Use `INSERT ... ON CONFLICT DO NOTHING` — silent skip, no error |
| R7 | Platform signal stream compute overhead | Cheap (10 symbols × 1 strategy × 1H). Cost is negligible. |
| R8 | Signal-to-execution fan-out (one signal to many users) under heavy load | Process signal_created events sequentially per-signal; async per-assignment. Current scale is far below the concern threshold. |

---

## 8. Assumptions

- **A1** — Single backend worker process. Multi-worker scaling is out of scope (would require Redis for shared state).
- **A2** — Binance is the only exchange. Forex and Indian market support is out of scope.
- **A3** — Supabase RLS is assumed correct; this spec does not audit it.
- **A4** — `paperExecutionEngine.ts` integration is preserved through the `paperBroker` adapter.
- **A5** — `.kuri` file edits require a backend restart. Users never edit `.kuri` files directly; they edit params through the UI.
- **A6** — Users editing custom strategies save them with `is_builtin = false`; the sync-on-startup only touches `is_builtin = true` rows.

---

## 9. Out of Scope (YAGNI)

- Strategy marketplace / sharing between users
- Backtest engine with historical replay over arbitrary date ranges
- Multi-exchange support (Bybit, OKX, Coinbase)
- Forex / Indian markets data sources
- Horizontal scaling (multiple backend workers)
- Multi-tenancy isolation audit
- Real broker integration (only paper broker implemented in this phase)
- Strategy compilation cache (every execution re-parses from source)
- WebSocket reconnection jitter / sophisticated backoff

Each of these is a future project, not a blocker.

---

## 10. Success Criteria

After this cleanup is deployed:

1. **No signal blind spot after restart** — a backend restart at 12:35 does not delay the next signal by more than a few seconds
2. **No race conditions** — running 100 simultaneous candle closes does not produce duplicate rows in either `signals` or `signal_executions`
3. **Instant config propagation** — adding a strategy to a watchlist produces a signal on the next candle close (not 5 minutes later)
4. **Error visibility** — a typo in a `.kuri` file produces a visible `last_error` badge in the UI within one candle close
5. **Per-user risk** — User A with 2% SL and User B with candle-low SL both receive distinct execution rows for the same market event
6. **Parameter editing** — changing `fastLen` on a watchlist assignment propagates without a backend restart; next signal uses the new params; old closed signals retain their original params
7. **Symbol format** — no code path in the system uses `.P` suffix or `BTC/USDT` slash format. All symbols are Binance-native `BTCUSDT` + a `market` field
8. **Broker adapter foundation** — adding a new broker requires creating a new file in `brokerAdapters/` and registering it in the router, with no other engine changes

---

## 11. Effort Estimate

| Phase | Effort |
|---|---|
| Phase 1 — Foundation | 1 hour |
| Phase 2 — DB migrations | 2 hours |
| Phase 3 — Backend refactor (scanner + executor split) | 8–10 hours |
| Phase 4 — Frontend refactor (ParamEditor, Signals page, watchlist CRUD) | 4–5 hours |
| Phase 5 — Cleanup | 30 minutes |
| Testing across phases | 2 hours |
| **Total** | **18–22 hours** |

Can be split across 3–4 days. No phase needs to run to completion before stopping — each phase leaves the system in a consistent state.
