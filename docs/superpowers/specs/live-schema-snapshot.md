# Live Schema Snapshot (2026-04-14)

Captured via `backend/server/src/scripts/introspect-schema-deep.ts` after migrations 049–055 applied.

Use this as the source of truth when writing code against Supabase. Column names, types, and nullability are verified against the live DB.

---

## `scripts`

| Column | Type | Nullability | Default / Notes |
|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid(); **uuid, NOT text** — built-ins use uuidv5 mapping |
| user_id | uuid | **nullable** | requires `is_builtin = true` if null (CHECK constraint from migration 055) |
| name | text | NOT NULL | |
| source_code | text | NOT NULL | |
| compiled_ir | ? | nullable | legacy column, unused |
| version | int | ? | legacy column |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |
| script_type | text | | 'STRATEGY' or 'INDICATOR' |
| configuration | jsonb | | legacy bucket; holds category for built-ins |
| description | text | | |
| is_public | boolean | | |
| is_active | boolean | | |
| is_builtin | boolean | NOT NULL default false | added in 049 |
| template_version | text | nullable | added in 049, 8-char SHA-256 prefix |
| param_schema | jsonb | NOT NULL default `[]` | added in 049 |

**Verified built-in row:** `3455cf72-02d2-5c44-adf4-80342b2f03ab` = `builtin-sma-trend`, template_version `92af675f`, 2 params.

---

## `watchlists`

Columns relevant to this refactor:

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | owner |
| name | text | |
| execution_timeframes | text[] or similar | nullable in practice |
| strategy_ids | uuid[] | **legacy — to be dropped in Phase 5 migration 054** |
| Plus many other columns irrelevant to this refactor (lot_size, leverage, etc.) | | |

---

## `watchlist_items`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| watchlist_id | uuid | FK |
| symbol | text | Binance-native after 051 (no `.P`, no `/`) |
| market | text | NEW from 051, default 'futures' |
| Plus per-item risk settings | | |

---

## `watchlist_strategies` (new from 050)

| Column | Type | Nullability | Default |
|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() |
| watchlist_id | uuid | NOT NULL | FK → watchlists(id) ON DELETE CASCADE |
| strategy_id | uuid | NOT NULL | FK → scripts(id) ON DELETE CASCADE |
| params | jsonb | NOT NULL | `{}` |
| timeframe | text | NOT NULL | '1H' |
| risk_settings | jsonb | NOT NULL | `{}` |
| last_error | text | nullable | |
| last_error_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

---

## `signals` (legacy columns still present until Phase 5)

**New columns added by 052 & 053:**

| Column | Type | Nullability | Default |
|---|---|---|---|
| market | text | NOT NULL | 'futures' |
| candle_time | timestamptz | NOT NULL | |
| params_snapshot | jsonb | NOT NULL | `{}` |
| template_version | text | nullable | |

**Legacy columns still present (dropped by migration 054 in Phase 5):**

| Column | Type | Notes |
|---|---|---|
| stop_loss | numeric | nullable |
| take_profit | numeric | nullable |
| status | text | NOT NULL default 'pending' |
| activated_at | timestamp (no tz) | nullable |
| closed_at | timestamp (no tz) | nullable |
| close_reason | text | nullable |
| profit_loss | double precision | nullable |
| strategy_category | text | nullable |
| is_pinned | boolean | nullable |
| watchlist_id | uuid | nullable |

**Critical legacy columns that impact Phase 3 code:**

- `status` is **NOT NULL default 'pending'** — our `signalStorage.insertSignal()` must either set it explicitly or rely on default
- `strategy` column exists (text, NOT NULL) — this is the **strategy NAME**, not strategy_id. Legacy columns insist it's set even though we have `strategy_id` now
- `entry_type` has default 'market'
- `strategy_id` is nullable (!) — the FK was not enforced

**Unique index from 053:** `(strategy_id, params_snapshot, symbol, timeframe, candle_time)`

---

## `signal_executions` (new from 052)

| Column | Type | Nullability | Default |
|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() |
| signal_id | uuid | NOT NULL | FK → signals(id) ON DELETE CASCADE |
| watchlist_strategy_id | uuid | nullable | FK → watchlist_strategies(id) ON DELETE SET NULL |
| user_id | uuid | nullable | FK → auth.users(id) ON DELETE CASCADE |
| symbol | text | NOT NULL | |
| market | text | NOT NULL | 'futures' |
| direction | text | NOT NULL | |
| entry_price | numeric | NOT NULL | |
| timeframe | text | NOT NULL | |
| stop_loss | numeric | nullable | |
| take_profit | numeric | nullable | |
| lot_size | numeric | nullable | |
| leverage | integer | nullable | |
| status | text | NOT NULL | 'Active' |
| closed_at | timestamptz | nullable | |
| close_reason | text | nullable | |
| close_price | numeric | nullable | |
| profit_loss | numeric | nullable | |
| broker | text | NOT NULL | 'paper' |
| broker_order_id | text | nullable | |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

---

## Gaps from the plan that need attention

1. **`signals.strategy` (text, NOT NULL)** — the plan's `insertSignal()` does not set this column. It MUST set `strategy = strategy_name` during insert until Phase 5 drops the column. Or migration 054 needs to drop this too (currently does not — only drops execution-state columns).

2. **`signals.status` (NOT NULL default 'pending')** — the plan's event-only `signals` table shouldn't have status. Until Phase 5 drops it, `insertSignal()` relies on the default. The unique dedupe index means re-runs are safe, so this is fine.

3. **Built-in strategy_id is uuid**, not string — all downstream references (signals.strategy_id, watchlist_strategies.strategy_id) must use the `builtinStrategyUuid('builtin-sma-trend')` value, not the string.

4. **Phase 5 migration 054 needs to also drop** `signals.strategy`, `signals.strategy_category`, `signals.is_pinned`, `signals.watchlist_id`, `signals.entry_type`, `signals.risk_reward_ratio` — the full legacy column sweep, not just the execution-state ones.
