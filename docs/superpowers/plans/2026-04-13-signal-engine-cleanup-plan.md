# Signal Engine Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the signal engine into a Scanner + Executor split with per-user risk execution, unified strategy storage, parameterized strategies, symbol normalization, and restart resilience.

**Architecture:** One backend worker runs a Signal Engine (scanner, produces shared event rows) and an Execution Engine (per-user, per-watchlist, handles risk + SL/TP monitoring + broker dispatch). `.kuri` files are the dev source for built-in strategies; Supabase `scripts` table is the runtime source of truth, auto-synced on restart.

**Tech Stack:** Node.js, TypeScript, Supabase (Postgres + Realtime), Binance WebSocket (ccxt + custom stream), Kuri scripting engine, Vite + React frontend.

**Reference spec:** `docs/superpowers/specs/2026-04-13-signal-engine-cleanup-design.md`

---

## Phase 1 — Foundation (no runtime impact)

### Task 1.1: Install `js-yaml`

**Files:**
- Modify: `backend/server/package.json`

- [ ] **Step 1: Install js-yaml and its types**

Run from `backend/server/`:
```bash
cd backend/server
npm install js-yaml
npm install -D @types/js-yaml
```

- [ ] **Step 2: Verify install**

Run:
```bash
cat package.json | grep -A 1 yaml
```

Expected output:
```
"dependencies": {
  ...
  "js-yaml": "^4.1.0",
```

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project"
git add backend/server/package.json backend/server/package-lock.json
git commit -m "chore(backend): install js-yaml for strategy frontmatter parsing"
```

---

### Task 1.2: Create `enums.ts`

**Files:**
- Create: `backend/server/src/constants/enums.ts`

- [ ] **Step 1: Create the enums file**

Create `backend/server/src/constants/enums.ts`:

```ts
// backend/server/src/constants/enums.ts
// Shared enums for the Signal Engine and related services.

export enum TradeDirection {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum Market {
    SPOT = 'spot',
    FUTURES = 'futures',
}

export enum SignalStatus {
    ACTIVE = 'Active',
    CLOSED = 'Closed',
}

export enum CloseReason {
    TP = 'TP',
    SL = 'SL',
    MANUAL = 'MANUAL',
    TIMEOUT = 'TIMEOUT',
}

export enum StrategyCategory {
    TREND_FOLLOWING = 'Trend Following',
    MOMENTUM = 'Momentum',
    BREAKOUT = 'Breakout',
    MEAN_REVERSION = 'Mean Reversion',
}

export enum BrokerType {
    PAPER = 'paper',
    BINANCE = 'binance',
}
```

- [ ] **Step 2: Run type check**

Run from `backend/server/`:
```bash
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep -E "enums" | head -5
```

Expected: no output (clean compile).

- [ ] **Step 3: Commit**

```bash
git add backend/server/src/constants/enums.ts
git commit -m "feat(backend): add shared enums for engine refactor"
```

---

### Task 1.3: Create `symbolService.ts`

**Files:**
- Create: `backend/server/src/services/symbolService.ts`
- Create: `backend/server/src/scripts/verify-symbol-service.ts` (verification)

- [ ] **Step 1: Create the symbol service**

Create `backend/server/src/services/symbolService.ts`:

```ts
// backend/server/src/services/symbolService.ts
// Canonical Symbol type for cross-boundary consistency.
// Internal format: { symbol: 'BTCUSDT', market: 'spot' | 'futures' }

import { Market } from '../constants/enums';

export interface Symbol {
    symbol: string;      // 'BTCUSDT' — Binance-native, no slash, no .P
    market: Market;      // 'spot' or 'futures'
}

/**
 * Parse any legacy or external symbol format into canonical Symbol.
 * Accepts: 'BTC/USDT.P', 'BTCUSDT.P', 'BTC/USDT', 'BTCUSDT', 'btcusdt'
 */
export function parseSymbol(input: string, fallbackMarket: Market = Market.FUTURES): Symbol {
    if (!input) throw new Error('parseSymbol: empty input');

    let raw = input.trim().toUpperCase();

    // Detect market from .P suffix (legacy futures marker)
    let market: Market = fallbackMarket;
    if (raw.endsWith('.P')) {
        market = Market.FUTURES;
        raw = raw.slice(0, -2);
    }

    // Strip CCXT slash: BTC/USDT -> BTCUSDT
    raw = raw.replace('/', '');

    return { symbol: raw, market };
}

/**
 * Convert canonical Symbol to CCXT slash format: BTC/USDT
 * Assumes USDT quote currency (most common on Binance).
 */
export function toCCXT(sym: Symbol): string {
    const s = sym.symbol;
    // Find where quote starts — known quotes
    const quotes = ['USDT', 'BUSD', 'USDC', 'BTC', 'ETH'];
    for (const q of quotes) {
        if (s.endsWith(q)) {
            const base = s.slice(0, -q.length);
            return `${base}/${q}`;
        }
    }
    return s; // Fall back to raw if we can't detect quote
}

/**
 * Convert canonical Symbol to Binance WebSocket lowercase stream name.
 * e.g. 'BTCUSDT' -> 'btcusdt'
 */
export function toBinanceWS(sym: Symbol): string {
    return sym.symbol.toLowerCase();
}

/**
 * Convert canonical Symbol to display string.
 * Currently the same as the canonical form — kept as a function so UI can evolve.
 */
export function toDisplay(sym: Symbol): string {
    return sym.symbol;
}

/**
 * Serialize to DB: returns { symbol, market } — callers persist as two columns.
 */
export function toDB(sym: Symbol): { symbol: string; market: string } {
    return { symbol: sym.symbol, market: sym.market };
}

/**
 * Equality check (market-aware).
 */
export function equals(a: Symbol, b: Symbol): boolean {
    return a.symbol === b.symbol && a.market === b.market;
}
```

- [ ] **Step 2: Create verification script**

Create `backend/server/src/scripts/verify-symbol-service.ts`:

```ts
// Verify symbolService converters
import { parseSymbol, toCCXT, toBinanceWS, toDisplay, equals } from '../services/symbolService';
import { Market } from '../constants/enums';

const cases = [
    { input: 'BTC/USDT.P',   expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'BTCUSDT.P',    expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'BTC/USDT',     expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'BTCUSDT',      expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'btcusdt',      expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'ETHUSDT',      expected: { symbol: 'ETHUSDT', market: Market.FUTURES } },
];

let failed = 0;
for (const { input, expected } of cases) {
    const result = parseSymbol(input);
    if (result.symbol !== expected.symbol || result.market !== expected.market) {
        console.error(`❌ parseSymbol('${input}') = ${JSON.stringify(result)}, expected ${JSON.stringify(expected)}`);
        failed++;
    } else {
        console.log(`✅ parseSymbol('${input}') = ${JSON.stringify(result)}`);
    }
}

// Converters
const btc = parseSymbol('BTC/USDT.P');
console.log(`\nConverters for ${JSON.stringify(btc)}:`);
console.log(`  toCCXT       = ${toCCXT(btc)}`);       // expected: BTC/USDT
console.log(`  toBinanceWS  = ${toBinanceWS(btc)}`);  // expected: btcusdt
console.log(`  toDisplay    = ${toDisplay(btc)}`);    // expected: BTCUSDT

// Equality
const same = equals(parseSymbol('BTCUSDT'), parseSymbol('BTC/USDT'));
console.log(`\nequals BTCUSDT vs BTC/USDT = ${same}`);  // expected: true (both futures)

if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
}
console.log('\n✅ All symbol service tests passed');
```

- [ ] **Step 3: Run verification**

Run from `backend/server/`:
```bash
npx ts-node --transpile-only src/scripts/verify-symbol-service.ts
```

Expected: all green checkmarks, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add backend/server/src/services/symbolService.ts \
        backend/server/src/scripts/verify-symbol-service.ts
git commit -m "feat(backend): add symbolService for canonical symbol handling"
```

---

## Phase 2 — Database Migrations

Supabase SQL migrations live under `backend/schema/`. All migrations here are **additive** through Phase 4 — rollback is safe.

### Task 2.1: Migration — `scripts` table additions

**Files:**
- Create: `backend/schema/2026-04-13-01-scripts-additions.sql`

- [ ] **Step 1: Create the migration file**

Create `backend/schema/2026-04-13-01-scripts-additions.sql`:

```sql
-- 2026-04-13-01: Add columns to scripts table for built-in sync, versioning, param schema.

ALTER TABLE scripts
    ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS template_version text,
    ADD COLUMN IF NOT EXISTS param_schema jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_scripts_builtin
    ON scripts (is_builtin)
    WHERE is_builtin = true;
```

- [ ] **Step 2: Apply the migration**

Run from project root:
```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project"
# Use your preferred Supabase SQL tool (dashboard, supabase CLI, or psql)
# Example with supabase CLI:
supabase db push
# Or copy/paste the SQL into the Supabase dashboard SQL editor
```

Expected: migration applies without error.

- [ ] **Step 3: Verify columns exist**

Run SQL in Supabase:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'scripts' AND column_name IN ('is_builtin', 'template_version', 'param_schema');
```

Expected: 3 rows returned.

- [ ] **Step 4: Commit**

```bash
git add backend/schema/2026-04-13-01-scripts-additions.sql
git commit -m "db: add is_builtin, template_version, param_schema to scripts"
```

---

### Task 2.2: Migration — create `watchlist_strategies` table

**Files:**
- Create: `backend/schema/2026-04-13-02-watchlist-strategies.sql`

- [ ] **Step 1: Create the migration file**

Create `backend/schema/2026-04-13-02-watchlist-strategies.sql`:

```sql
-- 2026-04-13-02: New table for per-assignment strategy configuration.

CREATE TABLE IF NOT EXISTS watchlist_strategies (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id       uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    strategy_id        uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    params             jsonb NOT NULL DEFAULT '{}'::jsonb,
    timeframe          text NOT NULL DEFAULT '1H',
    risk_settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error         text,
    last_error_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_strategies_wl
    ON watchlist_strategies (watchlist_id);

CREATE INDEX IF NOT EXISTS idx_watchlist_strategies_strategy
    ON watchlist_strategies (strategy_id);

-- Realtime publication for Supabase Realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE watchlist_strategies;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase dashboard or CLI.

- [ ] **Step 3: Backfill existing assignments from `watchlists.strategy_ids`**

Run in Supabase SQL editor:

```sql
INSERT INTO watchlist_strategies (watchlist_id, strategy_id, params, timeframe)
SELECT 
    w.id AS watchlist_id,
    strategy_id_text::uuid AS strategy_id,
    '{}'::jsonb AS params,
    COALESCE(w.execution_timeframes[1], '1H') AS timeframe
FROM watchlists w,
     unnest(w.strategy_ids) AS strategy_id_text
WHERE w.strategy_ids IS NOT NULL
  AND array_length(w.strategy_ids, 1) > 0
  AND EXISTS (SELECT 1 FROM scripts s WHERE s.id = strategy_id_text::uuid);
```

- [ ] **Step 4: Verify backfill**

```sql
SELECT COUNT(*) AS assignments FROM watchlist_strategies;
-- Should equal the sum of array lengths in watchlists.strategy_ids
SELECT SUM(COALESCE(array_length(strategy_ids, 1), 0)) AS expected FROM watchlists;
```

Both counts should match (or watchlist_strategies may be lower if some strategy_ids point to non-existent scripts).

- [ ] **Step 5: Commit**

```bash
git add backend/schema/2026-04-13-02-watchlist-strategies.sql
git commit -m "db: add watchlist_strategies table with params and risk_settings"
```

---

### Task 2.3: Migration — symbol + market fields on `watchlist_items`

**Files:**
- Create: `backend/schema/2026-04-13-03-watchlist-items-market.sql`

- [ ] **Step 1: Create the migration**

Create `backend/schema/2026-04-13-03-watchlist-items-market.sql`:

```sql
-- 2026-04-13-03: Normalize symbols, add market field.

ALTER TABLE watchlist_items
    ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'futures';

-- Normalize existing symbols: strip .P suffix (legacy futures marker).
UPDATE watchlist_items
   SET symbol = REPLACE(symbol, '.P', '')
 WHERE symbol LIKE '%.P';

-- Normalize existing symbols: strip CCXT slash (BTC/USDT -> BTCUSDT).
UPDATE watchlist_items
   SET symbol = REPLACE(symbol, '/', '')
 WHERE symbol LIKE '%/%';

CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol_market
    ON watchlist_items (symbol, market);
```

- [ ] **Step 2: Apply migration and verify**

Apply via Supabase. Verify no rows contain `.P` or `/`:

```sql
SELECT symbol FROM watchlist_items WHERE symbol LIKE '%.P' OR symbol LIKE '%/%' LIMIT 5;
```

Expected: 0 rows.

- [ ] **Step 3: Commit**

```bash
git add backend/schema/2026-04-13-03-watchlist-items-market.sql
git commit -m "db: normalize watchlist_items symbols and add market field"
```

---

### Task 2.4: Migration — `signals` table additions + `signal_executions` table

**Files:**
- Create: `backend/schema/2026-04-13-04-signals-split.sql`

- [ ] **Step 1: Create the migration**

Create `backend/schema/2026-04-13-04-signals-split.sql`:

```sql
-- 2026-04-13-04: Split signals into events (signals) and per-user executions (signal_executions).
-- This migration is ADDITIVE: the original signals columns stay in place through Phase 4.
-- Phase 5 will drop the legacy columns after confirmation.

-- Step 1: Add new columns to signals for the stripped-down event form.
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'futures',
    ADD COLUMN IF NOT EXISTS candle_time timestamptz,
    ADD COLUMN IF NOT EXISTS params_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS template_version text;

-- Normalize existing symbol values.
UPDATE signals SET symbol = REPLACE(REPLACE(symbol, '.P', ''), '/', '')
WHERE symbol LIKE '%.P' OR symbol LIKE '%/%';

-- Step 2: Create signal_executions table (per-user, per-watchlist execution).
CREATE TABLE IF NOT EXISTS signal_executions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id               uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    watchlist_strategy_id   uuid REFERENCES watchlist_strategies(id) ON DELETE SET NULL,
    user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Copied from signal at creation
    symbol                  text NOT NULL,
    market                  text NOT NULL DEFAULT 'futures',
    direction               text NOT NULL,
    entry_price             numeric NOT NULL,
    timeframe               text NOT NULL,

    -- Computed from watchlist_strategies.risk_settings
    stop_loss               numeric,
    take_profit             numeric,
    lot_size                numeric,
    leverage                int,

    -- Lifecycle
    status                  text NOT NULL DEFAULT 'Active',
    closed_at               timestamptz,
    close_reason            text,
    close_price             numeric,
    profit_loss             numeric,

    -- Broker
    broker                  text NOT NULL DEFAULT 'paper',
    broker_order_id         text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_executions_user_status
    ON signal_executions (user_id, status) WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_signal_executions_symbol_active
    ON signal_executions (symbol, status) WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_signal_executions_signal
    ON signal_executions (signal_id);

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE signal_executions;

-- Step 3: Backfill signal_executions from existing signals rows.
-- Each old signal becomes one execution; we do NOT dedupe signals at this stage.
-- Phase 5 cleanup will collapse duplicate signal events after verification.
INSERT INTO signal_executions
    (id, signal_id, user_id, symbol, market, direction, entry_price, timeframe,
     stop_loss, take_profit, status, closed_at, close_reason, profit_loss,
     created_at, updated_at, broker)
SELECT
    gen_random_uuid(),
    s.id,
    s.user_id,
    s.symbol,
    COALESCE(s.market, 'futures'),
    s.direction,
    s.entry_price,
    s.timeframe,
    s.stop_loss,
    s.take_profit,
    s.status,
    s.closed_at,
    s.close_reason,
    s.profit_loss,
    s.created_at,
    COALESCE(s.activated_at, s.created_at),
    'paper'
FROM signals s
WHERE NOT EXISTS (
    SELECT 1 FROM signal_executions se WHERE se.signal_id = s.id
);
```

- [ ] **Step 2: Apply migration**

Apply via Supabase.

- [ ] **Step 3: Verify backfill**

```sql
SELECT COUNT(*) AS signals_count FROM signals;
SELECT COUNT(*) AS executions_count FROM signal_executions;
-- Should be equal (every old signal produced one execution).
```

- [ ] **Step 4: Commit**

```bash
git add backend/schema/2026-04-13-04-signals-split.sql
git commit -m "db: add signal_executions table and backfill from signals"
```

---

### Task 2.5: Migration — unique dedupe index on signals

**Files:**
- Create: `backend/schema/2026-04-13-05-signals-dedupe-index.sql`

- [ ] **Step 1: Create the migration**

Create `backend/schema/2026-04-13-05-signals-dedupe-index.sql`:

```sql
-- 2026-04-13-05: Add unique dedupe index on signals.
-- Prevents duplicate event rows for (strategy, params, symbol, timeframe, candle).
-- CRITICAL: this must run AFTER any data cleanup so it doesn't fail on existing duplicates.

-- First: ensure candle_time is populated for all rows (backfill from created_at if null).
UPDATE signals
   SET candle_time = created_at
 WHERE candle_time IS NULL;

-- De-duplicate any existing duplicates by keeping the earliest row per tuple.
-- Only runs if duplicates exist.
DELETE FROM signals a
 USING signals b
 WHERE a.id > b.id
   AND a.strategy_id = b.strategy_id
   AND a.symbol = b.symbol
   AND a.timeframe = b.timeframe
   AND a.candle_time = b.candle_time
   AND COALESCE(a.params_snapshot, '{}'::jsonb) = COALESCE(b.params_snapshot, '{}'::jsonb);

-- Now add the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedupe
    ON signals (strategy_id, params_snapshot, symbol, timeframe, candle_time);

-- Make candle_time NOT NULL now that it's populated.
ALTER TABLE signals ALTER COLUMN candle_time SET NOT NULL;
```

- [ ] **Step 2: Apply migration**

Apply via Supabase.

- [ ] **Step 3: Verify**

```sql
-- Test the unique constraint works.
SELECT indexname FROM pg_indexes WHERE tablename = 'signals' AND indexname = 'idx_signals_dedupe';
```

Expected: 1 row.

- [ ] **Step 4: Commit**

```bash
git add backend/schema/2026-04-13-05-signals-dedupe-index.sql
git commit -m "db: add unique dedupe index on signals"
```

---

## Phase 3 — Backend Refactor

This phase has 13 tasks. After Phase 3, the backend's runtime behavior changes. Proceed cautiously.

### Task 3.1: Update `strategyLoader.ts` — yaml parsing + param extraction + DB upsert

**Files:**
- Modify: `backend/server/src/engine/strategyLoader.ts`
- Create: `backend/server/src/scripts/verify-strategy-loader.ts`

- [ ] **Step 1: Replace `strategyLoader.ts` with the new version**

Replace `backend/server/src/engine/strategyLoader.ts`:

```ts
// backend/server/src/engine/strategyLoader.ts
// Reads .kuri files from backend/server/src/strategies/, parses yaml frontmatter,
// extracts param schema from param.*() calls, computes template_version hash,
// and upserts into the Supabase scripts table.
//
// Runs ONCE at backend startup via worker.ts.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import yaml from 'js-yaml';
import { supabaseAdmin } from '../services/supabaseAdmin';

export interface ParamDef {
    id: string;
    type: 'int' | 'float' | 'bool' | 'string' | 'source';
    default: any;
    title?: string;
    min?: number;
    max?: number;
    step?: number;
}

export interface BuiltInStrategyMeta {
    id: string;
    name: string;
    description: string;
    category: string;
    kuriSource: string;
    templateVersion: string;
    paramSchema: ParamDef[];
}

const STRATEGIES_DIR = path.resolve(__dirname, '../strategies');

/**
 * Parse the YAML frontmatter block from a .kuri file.
 * Returns an empty object if no frontmatter present.
 */
function parseFrontmatter(source: string): Record<string, any> {
    const match = source.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    try {
        const parsed = yaml.load(match[1]);
        return typeof parsed === 'object' && parsed ? (parsed as Record<string, any>) : {};
    } catch (err: any) {
        console.warn(`[StrategyLoader] Failed to parse frontmatter: ${err.message}`);
        return {};
    }
}

/**
 * Extract parameter definitions from the Kuri script by regex-scanning
 * for `<name> = param.<type>(<default>, title=..., min=..., max=...)` calls.
 * Conservative: skips lines that don't match cleanly.
 */
function extractParamSchema(source: string): ParamDef[] {
    const params: ParamDef[] = [];
    const lines = source.split('\n');

    // Match lines like: `fastLen = param.int(20, title="Fast", min=1)`
    const paramRegex = /^\s*(\w+)\s*=\s*param\.(int|float|bool|string|source)\s*\(([^)]*)\)/;

    for (const line of lines) {
        const m = line.match(paramRegex);
        if (!m) continue;

        const [, id, type, argsRaw] = m;
        const args = argsRaw.trim();

        // First positional arg is the default value
        const defaultMatch = args.match(/^([^,]+)/);
        const defaultValue = defaultMatch ? parseLiteral(defaultMatch[1].trim()) : null;

        const titleMatch = args.match(/title\s*=\s*"([^"]*)"/);
        const minMatch   = args.match(/min\s*=\s*([\d.-]+)/);
        const maxMatch   = args.match(/max\s*=\s*([\d.-]+)/);
        const stepMatch  = args.match(/step\s*=\s*([\d.-]+)/);

        params.push({
            id,
            type: type as ParamDef['type'],
            default: defaultValue,
            title: titleMatch ? titleMatch[1] : id,
            min: minMatch ? Number(minMatch[1]) : undefined,
            max: maxMatch ? Number(maxMatch[1]) : undefined,
            step: stepMatch ? Number(stepMatch[1]) : undefined,
        });
    }

    return params;
}

function parseLiteral(s: string): any {
    s = s.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'close' || s === 'open' || s === 'high' || s === 'low') return s;
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}

function computeTemplateVersion(source: string): string {
    return crypto.createHash('sha256').update(source).digest('hex').slice(0, 8);
}

/**
 * Load all .kuri strategy files and return their parsed meta.
 */
export function loadStrategyMetas(): BuiltInStrategyMeta[] {
    try {
        const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith('.kuri'));
        const metas: BuiltInStrategyMeta[] = [];

        for (const file of files) {
            const source = fs.readFileSync(path.join(STRATEGIES_DIR, file), 'utf-8');
            const fm = parseFrontmatter(source);
            if (fm.type !== 'strategy') continue;

            if (!fm.id || !fm.name) {
                console.warn(`[StrategyLoader] Skipping ${file}: missing id or name in frontmatter`);
                continue;
            }

            metas.push({
                id: String(fm.id),
                name: String(fm.name),
                description: String(fm.description || ''),
                category: String(fm.category || 'Trend Following'),
                kuriSource: source,
                templateVersion: computeTemplateVersion(source),
                paramSchema: extractParamSchema(source),
            });
        }

        console.log(`[StrategyLoader] Loaded ${metas.length} built-in strategies`);
        return metas;
    } catch (err) {
        console.error('[StrategyLoader] Failed to load .kuri files:', err);
        return [];
    }
}

/**
 * Upsert all built-in strategies into the Supabase scripts table.
 * Should be called once at backend startup before the Signal Engine starts.
 */
export async function syncToDatabase(): Promise<void> {
    const metas = loadStrategyMetas();

    for (const meta of metas) {
        const { error } = await supabaseAdmin.from('scripts').upsert(
            {
                id: meta.id,
                user_id: null,
                name: meta.name,
                description: meta.description,
                source_code: meta.kuriSource,
                script_type: 'STRATEGY',
                is_active: true,
                is_builtin: true,
                template_version: meta.templateVersion,
                param_schema: meta.paramSchema,
                configuration: { category: meta.category },
            },
            { onConflict: 'id' }
        );

        if (error) {
            console.error(`[StrategyLoader] Failed to upsert ${meta.id}:`, error.message);
            continue;
        }
    }

    console.log(`[StrategyLoader] Synced ${metas.length} built-in strategies to scripts table`);
}

// Back-compat export: readers that only need the in-memory meta list can use this.
export const STRATEGY_REGISTRY: BuiltInStrategyMeta[] = [];
(async () => {
    STRATEGY_REGISTRY.push(...loadStrategyMetas());
})();
```

- [ ] **Step 2: Update `sma-trend.kuri` to include a param example for verification**

Edit `backend/server/src/strategies/sma-trend.kuri`:

```
---
version: kuri 1.0
type: strategy
id: builtin-sma-trend
name: SMA Trend
short: SMA Trend
description: Trend-following strategy using SMA 20 and SMA 50 alignment. Buy when price > SMA 20 > SMA 50, Sell when price < SMA 20 < SMA 50. SL at entry candle high/low, TP at 1:2 risk-reward.
category: Trend Following
pane: overlay
---

// Parameters
fastLen = param.int(20, title="Fast SMA Length", min=1, max=200)
slowLen = param.int(50, title="Slow SMA Length", min=1, max=500)

// SMA Indicators
sma_fast = kuri.sma(close, fastLen)
sma_slow = kuri.sma(close, slowLen)

// Plot SMAs on chart
mark(sma_fast, title="SMA Fast", color=#2196F3, linewidth=2)
mark(sma_slow, title="SMA Slow", color=#FF9800, linewidth=2)

// Entry Conditions (only fire on the latest bar to avoid historical duplicates)
if barstate.islast and close > sma_fast and sma_fast > sma_slow
    strategy.entry("Buy", strategy.long)

if barstate.islast and close < sma_fast and sma_fast < sma_slow
    strategy.entry("Sell", strategy.short)
```

- [ ] **Step 3: Create verification script**

Create `backend/server/src/scripts/verify-strategy-loader.ts`:

```ts
import { loadStrategyMetas, syncToDatabase } from '../engine/strategyLoader';

(async () => {
    console.log('═══ Strategy Loader Verification ═══\n');

    const metas = loadStrategyMetas();
    console.log(`Loaded ${metas.length} strategies:`);
    for (const m of metas) {
        console.log(`  • ${m.id} (v:${m.templateVersion})`);
        console.log(`      name: ${m.name}`);
        console.log(`      category: ${m.category}`);
        console.log(`      params: ${m.paramSchema.map(p => `${p.id}:${p.type}=${p.default}`).join(', ')}`);
    }

    if (metas.length === 0) {
        console.error('❌ No strategies loaded');
        process.exit(1);
    }

    const sma = metas.find(m => m.id === 'builtin-sma-trend');
    if (!sma) {
        console.error('❌ SMA Trend not found');
        process.exit(1);
    }
    if (sma.paramSchema.length !== 2) {
        console.error(`❌ Expected 2 params in SMA Trend, got ${sma.paramSchema.length}`);
        process.exit(1);
    }

    console.log('\n✅ Loader checks passed. Syncing to database...\n');
    await syncToDatabase();
    console.log('\n✅ Done');
})();
```

- [ ] **Step 4: Run the verification**

Run from `backend/server/`:
```bash
npx ts-node --transpile-only src/scripts/verify-strategy-loader.ts
```

Expected output:
```
═══ Strategy Loader Verification ═══

Loaded 1 strategies:
  • builtin-sma-trend (v:xxxxxxxx)
      name: SMA Trend
      category: Trend Following
      params: fastLen:int=20, slowLen:int=50

✅ Loader checks passed. Syncing to database...
[StrategyLoader] Loaded 1 built-in strategies
[StrategyLoader] Synced 1 built-in strategies to scripts table

✅ Done
```

- [ ] **Step 5: Verify the DB row**

Run in Supabase SQL editor:
```sql
SELECT id, name, is_builtin, template_version, param_schema
  FROM scripts
 WHERE id = 'builtin-sma-trend';
```

Expected: one row with `is_builtin = true`, non-null `template_version`, and `param_schema` as a JSON array with two entries.

- [ ] **Step 6: Commit**

```bash
git add backend/server/src/engine/strategyLoader.ts \
        backend/server/src/strategies/sma-trend.kuri \
        backend/server/src/scripts/verify-strategy-loader.ts
git commit -m "feat(backend): upgrade strategyLoader with yaml + param schema + DB upsert"
```

---

### Task 3.2: Create `strategyRunner.ts`

**Files:**
- Create: `backend/server/src/engine/strategyRunner.ts`

- [ ] **Step 1: Create the runner**

Create `backend/server/src/engine/strategyRunner.ts`:

```ts
// backend/server/src/engine/strategyRunner.ts
// Single entry point for executing a strategy script against a candle buffer.
// Wraps executeKuri(), applies param overrides, and captures errors non-fatally.

import { executeKuri, Context } from '../kuri/kuriAdapter';

export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface StrategyRunInput {
    kuriSource: string;
    params: Record<string, any>;
    candles: Candle[];
}

export interface TriggeredSignal {
    direction: 'LONG' | 'SHORT';
    id: string;
    timestamp: number;
}

export interface StrategyRunResult {
    signals: TriggeredSignal[];
    error?: string;
}

/**
 * Run a Kuri strategy script.
 * - kuriSource is the full .kuri file content (with frontmatter)
 * - params override the script's param defaults
 * - candles is the historical buffer
 * - Returns only signals that fired on the LAST candle (real-time semantics)
 */
export function runStrategy(input: StrategyRunInput): StrategyRunResult {
    const { kuriSource, params, candles } = input;

    if (!candles || candles.length === 0) {
        return { signals: [], error: 'No candles provided' };
    }

    try {
        const context: Context = {
            open:   candles.map((c) => c.open),
            high:   candles.map((c) => c.high),
            low:    candles.map((c) => c.low),
            close:  candles.map((c) => c.close),
            volume: candles.map((c) => c.volume),
            // Inject params as input overrides (executeKuri/KuriEngine will pick these up)
            ...params,
        };

        const result = executeKuri(kuriSource, context);
        const latestIndex = candles.length - 1;

        const triggered: TriggeredSignal[] = [];

        for (const sig of result.signals) {
            if (sig.type !== 'ENTRY') continue;
            if (sig.timestamp !== latestIndex) continue;
            triggered.push({
                direction: sig.direction === 'SHORT' ? 'SHORT' : 'LONG',
                id: sig.id || 'default',
                timestamp: latestIndex,
            });
        }

        return { signals: triggered };
    } catch (err: any) {
        return { signals: [], error: err?.message || String(err) };
    }
}
```

- [ ] **Step 2: Run type check**

Run from `backend/server/`:
```bash
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep strategyRunner | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add backend/server/src/engine/strategyRunner.ts
git commit -m "feat(backend): add strategyRunner with param overrides and error capture"
```

---

### Task 3.3: Create `riskCalculator.ts`

**Files:**
- Create: `backend/server/src/engine/riskCalculator.ts`

- [ ] **Step 1: Create the risk calculator**

Create `backend/server/src/engine/riskCalculator.ts`:

```ts
// backend/server/src/engine/riskCalculator.ts
// Computes stop_loss and take_profit for a signal execution based on the
// watchlist_strategies.risk_settings JSON and the triggering candle.
//
// Supported risk modes:
//   - { mode: 'candle', rrRatio: 2 }       — SL = candle low/high, TP = rrRatio × risk
//   - { mode: 'percent', slPercent: 0.02, tpPercent: 0.04 }
//   - { mode: 'fixed', slDistance: 100, tpDistance: 200 } — absolute price distance

import { TradeDirection } from '../constants/enums';
import { Candle } from './strategyRunner';

export interface RiskSettings {
    mode?: 'candle' | 'percent' | 'fixed';
    rrRatio?: number;        // for candle mode
    slPercent?: number;      // for percent mode (e.g. 0.02 = 2%)
    tpPercent?: number;
    slDistance?: number;     // for fixed mode (price units)
    tpDistance?: number;
    lotSize?: number;
    leverage?: number;
}

export interface RiskLevels {
    stopLoss: number;
    takeProfit: number;
}

const CANDLE_BUFFER = 0.001; // 0.1% below/above wick

export function computeRiskLevels(
    entryPrice: number,
    direction: TradeDirection,
    candle: Candle,
    risk: RiskSettings = {},
): RiskLevels {
    const mode = risk.mode || 'candle';

    if (mode === 'candle') {
        const rr = risk.rrRatio ?? 2;
        const stopLoss =
            direction === TradeDirection.BUY
                ? candle.low * (1 - CANDLE_BUFFER)
                : candle.high * (1 + CANDLE_BUFFER);
        const riskDist = Math.abs(entryPrice - stopLoss);
        const reward = riskDist * rr;
        const takeProfit =
            direction === TradeDirection.BUY ? entryPrice + reward : entryPrice - reward;
        return { stopLoss, takeProfit };
    }

    if (mode === 'percent') {
        const slPct = risk.slPercent ?? 0.01;
        const tpPct = risk.tpPercent ?? 0.02;
        const stopLoss =
            direction === TradeDirection.BUY
                ? entryPrice * (1 - slPct)
                : entryPrice * (1 + slPct);
        const takeProfit =
            direction === TradeDirection.BUY
                ? entryPrice * (1 + tpPct)
                : entryPrice * (1 - tpPct);
        return { stopLoss, takeProfit };
    }

    if (mode === 'fixed') {
        const slD = risk.slDistance ?? 0;
        const tpD = risk.tpDistance ?? 0;
        const stopLoss =
            direction === TradeDirection.BUY ? entryPrice - slD : entryPrice + slD;
        const takeProfit =
            direction === TradeDirection.BUY ? entryPrice + tpD : entryPrice - tpD;
        return { stopLoss, takeProfit };
    }

    // Unknown mode — fall back to candle mode
    return computeRiskLevels(entryPrice, direction, candle, { mode: 'candle', rrRatio: 2 });
}
```

- [ ] **Step 2: Type check and commit**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep riskCalculator | head -5
cd "../../"
git add backend/server/src/engine/riskCalculator.ts
git commit -m "feat(backend): add riskCalculator for candle/percent/fixed SL-TP modes"
```

---

### Task 3.4: Create `executionStorage.ts`

**Files:**
- Create: `backend/server/src/services/executionStorage.ts`

- [ ] **Step 1: Create the storage service**

Create `backend/server/src/services/executionStorage.ts`:

```ts
// backend/server/src/services/executionStorage.ts
// Writes to the signal_executions table.

import { supabaseAdmin } from './supabaseAdmin';
import { TradeDirection, SignalStatus, CloseReason, Market, BrokerType } from '../constants/enums';

export interface InsertExecutionInput {
    signalId: string;
    watchlistStrategyId: string | null;
    userId: string | null;
    symbol: string;
    market: Market;
    direction: TradeDirection;
    entryPrice: number;
    timeframe: string;
    stopLoss: number;
    takeProfit: number;
    lotSize?: number | null;
    leverage?: number | null;
    broker?: BrokerType;
}

export interface SignalExecutionRow {
    id: string;
    signal_id: string;
    watchlist_strategy_id: string | null;
    user_id: string | null;
    symbol: string;
    market: string;
    direction: string;
    entry_price: number;
    timeframe: string;
    stop_loss: number | null;
    take_profit: number | null;
    lot_size: number | null;
    leverage: number | null;
    status: string;
    closed_at: string | null;
    close_reason: string | null;
    close_price: number | null;
    profit_loss: number | null;
    broker: string;
    broker_order_id: string | null;
    created_at: string;
    updated_at: string;
}

export async function insertExecution(input: InsertExecutionInput): Promise<SignalExecutionRow | null> {
    const { data, error } = await supabaseAdmin
        .from('signal_executions')
        .insert({
            signal_id: input.signalId,
            watchlist_strategy_id: input.watchlistStrategyId,
            user_id: input.userId,
            symbol: input.symbol,
            market: input.market,
            direction: input.direction,
            entry_price: input.entryPrice,
            timeframe: input.timeframe,
            stop_loss: input.stopLoss,
            take_profit: input.takeProfit,
            lot_size: input.lotSize ?? null,
            leverage: input.leverage ?? null,
            status: SignalStatus.ACTIVE,
            broker: input.broker || BrokerType.PAPER,
        })
        .select('*')
        .single();

    if (error) {
        console.error('[executionStorage] insertExecution failed:', error.message);
        return null;
    }
    return data as SignalExecutionRow;
}

export async function loadActiveExecutions(): Promise<SignalExecutionRow[]> {
    const { data, error } = await supabaseAdmin
        .from('signal_executions')
        .select('*')
        .eq('status', SignalStatus.ACTIVE);

    if (error) {
        console.error('[executionStorage] loadActiveExecutions failed:', error.message);
        return [];
    }
    return (data || []) as SignalExecutionRow[];
}

/**
 * Atomic close: WHERE status='Active' ensures we don't double-close.
 */
export async function closeExecution(
    id: string,
    reason: CloseReason,
    closePrice: number,
    profitLoss: number | null,
): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from('signal_executions')
        .update({
            status: SignalStatus.CLOSED,
            close_reason: reason,
            close_price: closePrice,
            profit_loss: profitLoss,
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', SignalStatus.ACTIVE)
        .select('id')
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No rows matched — already closed by another path.
            return false;
        }
        console.error('[executionStorage] closeExecution failed:', error.message);
        return false;
    }
    return !!data;
}
```

- [ ] **Step 2: Type check and commit**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep executionStorage | head -5
cd "../../"
git add backend/server/src/services/executionStorage.ts
git commit -m "feat(backend): add executionStorage for signal_executions CRUD"
```

---

### Task 3.5: Create `brokerAdapters/`

**Files:**
- Create: `backend/server/src/engine/brokerAdapters/index.ts`
- Create: `backend/server/src/engine/brokerAdapters/paperBroker.ts`

- [ ] **Step 1: Create the paper broker**

Create `backend/server/src/engine/brokerAdapters/paperBroker.ts`:

```ts
// backend/server/src/engine/brokerAdapters/paperBroker.ts
// Default broker. Paper trades exist as signal_executions rows — no external calls.

import { SignalExecutionRow } from '../../services/executionStorage';

export const paperBrokerAdapter = {
    async execute(execution: SignalExecutionRow): Promise<void> {
        // Paper broker: no external call. The row is the trade.
        console.log(
            `[PaperBroker] Open ${execution.direction} ${execution.symbol} ` +
            `entry=${execution.entry_price} sl=${execution.stop_loss} tp=${execution.take_profit}`,
        );
    },

    async onClose(execution: SignalExecutionRow): Promise<void> {
        console.log(
            `[PaperBroker] Close ${execution.symbol} ` +
            `reason=${execution.close_reason} price=${execution.close_price} pnl=${execution.profit_loss}`,
        );
    },
};
```

- [ ] **Step 2: Create the adapter router**

Create `backend/server/src/engine/brokerAdapters/index.ts`:

```ts
// backend/server/src/engine/brokerAdapters/index.ts
// Routes execution events to the correct broker adapter.

import { SignalExecutionRow } from '../../services/executionStorage';
import { BrokerType } from '../../constants/enums';
import { paperBrokerAdapter } from './paperBroker';

export interface BrokerAdapter {
    execute(execution: SignalExecutionRow): Promise<void>;
    onClose(execution: SignalExecutionRow): Promise<void>;
}

const adapters: Record<string, BrokerAdapter> = {
    [BrokerType.PAPER]: paperBrokerAdapter,
    // Future: [BrokerType.BINANCE]: binanceBrokerAdapter,
};

export const brokerAdapters = {
    async execute(exec: SignalExecutionRow): Promise<void> {
        const adapter = adapters[exec.broker] || adapters[BrokerType.PAPER];
        await adapter.execute(exec);
    },

    async onClose(exec: SignalExecutionRow): Promise<void> {
        const adapter = adapters[exec.broker] || adapters[BrokerType.PAPER];
        await adapter.onClose(exec);
    },
};
```

- [ ] **Step 3: Type check and commit**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep brokerAdapters | head -5
cd "../../"
git add backend/server/src/engine/brokerAdapters/
git commit -m "feat(backend): add broker adapter foundation with paperBroker"
```

---

### Task 3.6: Update `signalStorage.ts` for new schema

**Files:**
- Modify: `backend/server/src/services/signalStorage.ts`

- [ ] **Step 1: Rewrite signalStorage**

Replace `backend/server/src/services/signalStorage.ts`:

```ts
// backend/server/src/services/signalStorage.ts
// Writes event rows to the signals table. Uses INSERT ... ON CONFLICT DO NOTHING
// to rely on the unique dedupe index for atomic deduplication.

import { supabaseAdmin } from './supabaseAdmin';
import { eventBus, EngineEvents } from '../utils/eventBus';
import { TradeDirection, Market } from '../constants/enums';

export interface InsertSignalInput {
    strategyId: string;
    symbol: string;
    market: Market;
    direction: TradeDirection;
    entryPrice: number;
    timeframe: string;
    candleTime: string;           // ISO timestamp
    paramsSnapshot: Record<string, any>;
    templateVersion: string;
}

export interface SignalRow {
    id: string;
    strategy_id: string;
    symbol: string;
    market: string;
    direction: string;
    entry_price: number;
    timeframe: string;
    candle_time: string;
    params_snapshot: Record<string, any>;
    template_version: string;
    created_at: string;
}

/**
 * Insert a new signal event row.
 * Returns the inserted row, or null if deduped (unique constraint rejected).
 */
export async function insertSignal(input: InsertSignalInput): Promise<SignalRow | null> {
    const { data, error } = await supabaseAdmin
        .from('signals')
        .insert({
            strategy_id: input.strategyId,
            symbol: input.symbol,
            market: input.market,
            direction: input.direction,
            entry_price: input.entryPrice,
            timeframe: input.timeframe,
            candle_time: input.candleTime,
            params_snapshot: input.paramsSnapshot,
            template_version: input.templateVersion,
        })
        .select('*')
        .single();

    if (error) {
        // 23505 is Postgres unique violation — that's the dedupe case.
        if (error.code === '23505') {
            return null;
        }
        console.error('[signalStorage] insertSignal failed:', error.message);
        return null;
    }

    // Emit event for Execution Engine to pick up.
    const row = data as SignalRow;
    eventBus.emit(EngineEvents.SIGNAL_CREATED, { signal: row, triggered_by: 'candle' });
    return row;
}
```

- [ ] **Step 2: Type check and commit**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep signalStorage | head -5
cd "../../"
git add backend/server/src/services/signalStorage.ts
git commit -m "refactor(backend): simplify signalStorage for event-only schema"
```

Note: a type error about `SIGNAL_CREATED` is expected until Task 3.10 updates the event bus.

---

### Task 3.7: Update `binanceStream.ts` with @bookTicker subscriptions

**Files:**
- Modify: `backend/server/src/services/binanceStream.ts`

- [ ] **Step 1: Open the file**

Read `backend/server/src/services/binanceStream.ts` to see its current shape.

- [ ] **Step 2: Add bookTicker methods**

Add these methods to the stream service (exact placement depends on current class structure — follow existing patterns):

```ts
// Add to the stream service class

private bookTickerSubs: Set<string> = new Set();

async subscribeBookTicker(symbol: string): Promise<void> {
    const streamName = `${symbol.toLowerCase()}@bookTicker`;
    if (this.bookTickerSubs.has(streamName)) return;

    this.bookTickerSubs.add(streamName);
    await this.sendSubscribeMessage([streamName]);
    console.log(`[BinanceStream] Subscribed to bookTicker ${symbol}`);
}

async unsubscribeBookTicker(symbol: string): Promise<void> {
    const streamName = `${symbol.toLowerCase()}@bookTicker`;
    if (!this.bookTickerSubs.has(streamName)) return;

    this.bookTickerSubs.delete(streamName);
    await this.sendUnsubscribeMessage([streamName]);
    console.log(`[BinanceStream] Unsubscribed from bookTicker ${symbol}`);
}

// In the message handler, detect bookTicker messages:
// {"stream":"btcusdt@bookTicker","data":{"s":"BTCUSDT","b":"70000.1","a":"70001.0", ...}}
// and emit:
// eventBus.emit(EngineEvents.PRICE_TICK, { symbol: data.s, bid: Number(data.b), ask: Number(data.a), ts: Date.now() });
```

- [ ] **Step 3: Type check**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep binanceStream | head -5
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd "../../"
git add backend/server/src/services/binanceStream.ts
git commit -m "feat(backend): add bookTicker subscribe/unsubscribe for tick monitoring"
```

---

### Task 3.8: Update `eventBus.ts` with `SIGNAL_CREATED` and `PRICE_TICK`

**Files:**
- Modify: `backend/server/src/utils/eventBus.ts`

- [ ] **Step 1: Open and extend**

Add the new event types to the existing event bus. Typical shape:

```ts
// Append to existing EngineEvents enum
export enum EngineEvents {
    CANDLE_CLOSED = 'candle-closed',
    SIGNAL_CREATED = 'signal-created',
    PRICE_TICK = 'price-tick',
    // ... existing events
}
```

- [ ] **Step 2: Type check**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep -E "eventBus|signalStorage" | head -5
```

Expected: no errors — the earlier signalStorage type error should also resolve.

- [ ] **Step 3: Commit**

```bash
cd "../../"
git add backend/server/src/utils/eventBus.ts
git commit -m "feat(backend): add SIGNAL_CREATED and PRICE_TICK engine events"
```

---

### Task 3.9: Refactor `signalEngine.ts` into scanner-only

**Files:**
- Modify: `backend/server/src/engine/signalEngine.ts`

- [ ] **Step 1: Replace with scanner-only version**

Replace `backend/server/src/engine/signalEngine.ts` with this structure (preserve Binance connection code from the existing file — shown as comments where relevant):

```ts
// backend/server/src/engine/signalEngine.ts
// Scanner: detects strategy triggers on closed candles.
// Does NOT manage execution state — that's Execution Engine's job.

import ccxt from 'ccxt';
import { Candle } from './strategyRunner';
import { runStrategy } from './strategyRunner';
import { insertSignal } from '../services/signalStorage';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { binanceStream } from '../services/binanceStream';
import { eventBus, EngineEvents } from '../utils/eventBus';
import { STRATEGY_REGISTRY } from './strategyLoader';
import { TradeDirection, Market } from '../constants/enums';

const candleBuffer: Map<string, Candle[]> = new Map();
const BUFFER_SIZE = 200;

let exchange = new ccxt.binance({
    enableRateLimit: true,
    timeout: 5000,
    options: { defaultType: 'future' },
});

interface Assignment {
    id: string;
    watchlist_id: string;
    user_id: string | null;
    strategy_id: string;
    params: Record<string, any>;
    timeframe: string;
    symbols: string[];
    strategy: {
        id: string;
        name: string;
        source_code: string;
        template_version: string;
    };
}

let assignments: Assignment[] = [];

/**
 * Load all watchlist_strategies assignments joined with watchlist symbols + script sources.
 */
async function loadAssignments(): Promise<Assignment[]> {
    const { data, error } = await supabaseAdmin
        .from('watchlist_strategies')
        .select(`
            id, watchlist_id, strategy_id, params, timeframe,
            watchlist:watchlists ( id, user_id ),
            strategy:scripts!strategy_id ( id, name, source_code, template_version )
        `);

    if (error || !data) {
        console.error('[SignalEngine] Failed to load assignments:', error?.message);
        return [];
    }

    // Load all symbols for the affected watchlists
    const watchlistIds = Array.from(new Set(data.map((r: any) => r.watchlist_id)));
    const { data: items } = await supabaseAdmin
        .from('watchlist_items')
        .select('watchlist_id, symbol, market')
        .in('watchlist_id', watchlistIds);

    const symbolsByWl = new Map<string, string[]>();
    (items || []).forEach((i: any) => {
        const list = symbolsByWl.get(i.watchlist_id) || [];
        list.push(i.symbol);
        symbolsByWl.set(i.watchlist_id, list);
    });

    const result: Assignment[] = [];
    for (const row of data as any[]) {
        if (!row.strategy?.source_code) continue;
        result.push({
            id: row.id,
            watchlist_id: row.watchlist_id,
            user_id: row.watchlist?.user_id || null,
            strategy_id: row.strategy_id,
            params: row.params || {},
            timeframe: row.timeframe,
            symbols: symbolsByWl.get(row.watchlist_id) || [],
            strategy: {
                id: row.strategy.id,
                name: row.strategy.name,
                source_code: row.strategy.source_code,
                template_version: row.strategy.template_version || '',
            },
        });
    }

    return result;
}

async function setLastError(assignmentId: string, message: string): Promise<void> {
    await supabaseAdmin
        .from('watchlist_strategies')
        .update({ last_error: message, last_error_at: new Date().toISOString() })
        .eq('id', assignmentId);
}

async function clearLastError(assignmentId: string): Promise<void> {
    await supabaseAdmin
        .from('watchlist_strategies')
        .update({ last_error: null, last_error_at: null })
        .eq('id', assignmentId)
        .not('last_error', 'is', null);
}

/**
 * Fetch historical candles for a symbol/timeframe.
 */
export async function fetchHistoricalCandles(
    symbol: string,
    timeframe: string,
    limit = BUFFER_SIZE,
): Promise<Candle[]> {
    try {
        // Use canonical symbol → convert to CCXT format
        // (symbolService should be used here in production; simple version inline)
        const ccxtSymbol = symbol.length >= 6 ? `${symbol.slice(0, -4)}/${symbol.slice(-4)}` : symbol;
        const ohlcv = await exchange.fetchOHLCV(ccxtSymbol, timeframe.toLowerCase(), undefined, limit);
        return ohlcv.map((c: any) => ({
            time: Math.floor(c[0] / 1000),
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5],
        }));
    } catch (err) {
        console.error(`[SignalEngine] fetchHistoricalCandles failed for ${symbol}:`, err);
        return [];
    }
}

/**
 * Process a candle close: for each assignment matching this (symbol, timeframe),
 * run the strategy and insert a signal event if triggered.
 */
async function onCandleClose(symbol: string, timeframe: string, candle: Candle): Promise<void> {
    const bufferKey = `${symbol}_${timeframe}`;
    let buffer = candleBuffer.get(bufferKey) || [];
    buffer.push(candle);
    if (buffer.length > BUFFER_SIZE) buffer = buffer.slice(-BUFFER_SIZE);
    candleBuffer.set(bufferKey, buffer);

    if (buffer.length < 50) return;

    const matching = assignments.filter(
        (a) => a.symbols.includes(symbol) && a.timeframe.toLowerCase() === timeframe.toLowerCase(),
    );

    for (const assignment of matching) {
        const result = runStrategy({
            kuriSource: assignment.strategy.source_code,
            params: assignment.params,
            candles: buffer,
        });

        if (result.error) {
            await setLastError(assignment.id, result.error);
            continue;
        }

        // Clear any prior error on a successful run.
        await clearLastError(assignment.id);

        for (const sig of result.signals) {
            await insertSignal({
                strategyId: assignment.strategy_id,
                symbol,
                market: Market.FUTURES,  // TODO: read from watchlist_items.market
                direction: sig.direction === 'SHORT' ? TradeDirection.SELL : TradeDirection.BUY,
                entryPrice: candle.close,
                timeframe,
                candleTime: new Date(candle.time * 1000).toISOString(),
                paramsSnapshot: assignment.params,
                templateVersion: assignment.strategy.template_version,
            });
            // insertSignal emits SIGNAL_CREATED on success.
        }
    }
}

/**
 * Cold-start scan: on startup, run each assignment once against the historical buffer.
 * Dedupe index in signals prevents duplicates across restarts.
 */
async function coldStartScan(): Promise<void> {
    console.log('[SignalEngine] Running cold-start scan...');
    for (const assignment of assignments) {
        for (const symbol of assignment.symbols) {
            const buffer = await fetchHistoricalCandles(symbol, assignment.timeframe);
            if (buffer.length < 50) continue;

            const result = runStrategy({
                kuriSource: assignment.strategy.source_code,
                params: assignment.params,
                candles: buffer,
            });

            if (result.error) {
                await setLastError(assignment.id, result.error);
                continue;
            }

            for (const sig of result.signals) {
                const lastCandle = buffer[buffer.length - 1];
                await insertSignal({
                    strategyId: assignment.strategy_id,
                    symbol,
                    market: Market.FUTURES,
                    direction: sig.direction === 'SHORT' ? TradeDirection.SELL : TradeDirection.BUY,
                    entryPrice: lastCandle.close,
                    timeframe: assignment.timeframe,
                    candleTime: new Date(lastCandle.time * 1000).toISOString(),
                    paramsSnapshot: assignment.params,
                    templateVersion: assignment.strategy.template_version,
                });
                // If duplicate, insertSignal returns null silently.
            }
        }
    }
    console.log('[SignalEngine] Cold-start scan complete.');
}

export async function startSignalEngine(): Promise<void> {
    console.log('[SignalEngine] Starting...');

    assignments = await loadAssignments();
    console.log(`[SignalEngine] Loaded ${assignments.length} assignments`);

    // Collect unique (symbol, timeframe) combos
    const streamTargets = new Set<string>();
    const allSymbols = new Set<string>();
    const allTimeframes = new Set<string>();
    for (const a of assignments) {
        for (const s of a.symbols) {
            allSymbols.add(s);
            allTimeframes.add(a.timeframe);
            streamTargets.add(`${s}:${a.timeframe}`);
        }
    }

    // Fill candle buffers
    for (const s of allSymbols) {
        for (const tf of allTimeframes) {
            const buf = await fetchHistoricalCandles(s, tf);
            if (buf.length > 0) candleBuffer.set(`${s}_${tf}`, buf);
        }
    }

    // Cold-start scan BEFORE subscribing to event bus (so Execution Engine sees them)
    await coldStartScan();

    // Subscribe to candle close events
    eventBus.on(EngineEvents.CANDLE_CLOSED, async ({ symbol, timeframe, candle }: any) => {
        try {
            await onCandleClose(symbol, timeframe, candle);
        } catch (err) {
            console.error('[SignalEngine] Error in onCandleClose:', err);
        }
    });

    // Subscribe to Binance kline streams
    await binanceStream.subscribe(Array.from(allSymbols), Array.from(allTimeframes));

    // Supabase Realtime: reload assignments when watchlist_strategies changes
    supabaseAdmin
        .channel('watchlist-strategies-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist_strategies' }, async () => {
            assignments = await loadAssignments();
            console.log(`[SignalEngine] Reloaded ${assignments.length} assignments (realtime)`);
        })
        .subscribe();

    console.log('[SignalEngine] Started successfully');
}

export function stopSignalEngine(): void {
    binanceStream.disconnect();
    candleBuffer.clear();
    console.log('[SignalEngine] Stopped');
}

export function getSignalEngineStatus(): object {
    return {
        running: true,
        assignments: assignments.length,
        buffers: candleBuffer.size,
    };
}
```

- [ ] **Step 2: Type check**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep signalEngine | head -10
```

Fix any reference errors against the current codebase (method names, imports).

- [ ] **Step 3: Commit**

```bash
cd "../../"
git add backend/server/src/engine/signalEngine.ts
git commit -m "refactor(backend): signalEngine becomes scanner-only, emits SIGNAL_CREATED"
```

---

### Task 3.10: Create `executionEngine.ts`

**Files:**
- Create: `backend/server/src/engine/executionEngine.ts`

- [ ] **Step 1: Create the execution engine**

Create `backend/server/src/engine/executionEngine.ts`:

```ts
// backend/server/src/engine/executionEngine.ts
// Listens for SIGNAL_CREATED events, creates per-user signal_executions with
// per-watchlist risk settings, and monitors active executions via @bookTicker.

import { supabaseAdmin } from '../services/supabaseAdmin';
import { eventBus, EngineEvents } from '../utils/eventBus';
import {
    insertExecution,
    loadActiveExecutions,
    closeExecution,
    SignalExecutionRow,
} from '../services/executionStorage';
import { binanceStream } from '../services/binanceStream';
import { computeRiskLevels, RiskSettings } from './riskCalculator';
import { brokerAdapters } from './brokerAdapters';
import { TradeDirection, Market, CloseReason, BrokerType } from '../constants/enums';
import { Candle } from './strategyRunner';
import { SignalRow } from '../services/signalStorage';

// In-memory cache of active executions keyed by symbol
const activeBySymbol: Map<string, SignalExecutionRow[]> = new Map();

function addActive(exec: SignalExecutionRow): void {
    const list = activeBySymbol.get(exec.symbol) || [];
    list.push(exec);
    activeBySymbol.set(exec.symbol, list);
}

function removeActive(execId: string, symbol: string): void {
    const list = activeBySymbol.get(symbol);
    if (!list) return;
    const filtered = list.filter((e) => e.id !== execId);
    if (filtered.length === 0) {
        activeBySymbol.delete(symbol);
        binanceStream.unsubscribeBookTicker(symbol).catch(() => {});
    } else {
        activeBySymbol.set(symbol, filtered);
    }
}

async function handleNewSignal(payload: { signal: SignalRow }): Promise<void> {
    const signal = payload.signal;

    // Find watchlist_strategy assignments that match this signal's parameters
    const { data: assignments, error } = await supabaseAdmin
        .from('watchlist_strategies')
        .select(`
            id, watchlist_id, params, timeframe, risk_settings,
            watchlist:watchlists ( id, user_id )
        `)
        .eq('strategy_id', signal.strategy_id)
        .eq('timeframe', signal.timeframe);

    if (error || !assignments) {
        console.error('[ExecutionEngine] Failed to load assignments:', error?.message);
        return;
    }

    // Match on symbol (from watchlist_items) and params_snapshot
    const { data: items } = await supabaseAdmin
        .from('watchlist_items')
        .select('watchlist_id, symbol')
        .eq('symbol', signal.symbol);

    const watchlistsWithSymbol = new Set((items || []).map((i: any) => i.watchlist_id));

    for (const a of assignments as any[]) {
        if (!watchlistsWithSymbol.has(a.watchlist_id)) continue;
        if (JSON.stringify(a.params || {}) !== JSON.stringify(signal.params_snapshot || {})) continue;

        const risk: RiskSettings = a.risk_settings || {};

        // Need the triggering candle high/low to compute candle-based SL/TP
        // For now, reconstruct a minimal candle from signal.entry_price — downstream
        // replay/scan flows should pass the actual candle through a richer event.
        const candle: Candle = {
            time: new Date(signal.candle_time).getTime() / 1000,
            open: signal.entry_price,
            high: signal.entry_price,
            low: signal.entry_price,
            close: signal.entry_price,
            volume: 0,
        };

        const { stopLoss, takeProfit } = computeRiskLevels(
            signal.entry_price,
            signal.direction as TradeDirection,
            candle,
            risk,
        );

        const execution = await insertExecution({
            signalId: signal.id,
            watchlistStrategyId: a.id,
            userId: a.watchlist?.user_id || null,
            symbol: signal.symbol,
            market: (signal.market as Market) || Market.FUTURES,
            direction: signal.direction as TradeDirection,
            entryPrice: signal.entry_price,
            timeframe: signal.timeframe,
            stopLoss,
            takeProfit,
            lotSize: risk.lotSize ?? null,
            leverage: risk.leverage ?? null,
            broker: BrokerType.PAPER,
        });

        if (!execution) continue;

        addActive(execution);
        await binanceStream.subscribeBookTicker(signal.symbol);
        await brokerAdapters.execute(execution);
    }
}

function computePnL(exec: SignalExecutionRow, closePrice: number): number {
    const entry = exec.entry_price;
    const lotSize = exec.lot_size || 1;
    const lev = exec.leverage || 1;
    if (exec.direction === 'BUY') {
        return (closePrice - entry) * lotSize * lev;
    }
    return (entry - closePrice) * lotSize * lev;
}

async function handlePriceTick(payload: { symbol: string; bid: number; ask: number }): Promise<void> {
    const list = activeBySymbol.get(payload.symbol);
    if (!list || list.length === 0) return;

    for (const exec of [...list]) {
        let hitPrice: number | null = null;
        let reason: CloseReason | null = null;

        if (exec.direction === 'BUY') {
            // Close at bid (what you'd sell into)
            if (exec.stop_loss !== null && payload.bid <= exec.stop_loss) {
                hitPrice = payload.bid;
                reason = CloseReason.SL;
            } else if (exec.take_profit !== null && payload.bid >= exec.take_profit) {
                hitPrice = payload.bid;
                reason = CloseReason.TP;
            }
        } else {
            // SELL: close at ask
            if (exec.stop_loss !== null && payload.ask >= exec.stop_loss) {
                hitPrice = payload.ask;
                reason = CloseReason.SL;
            } else if (exec.take_profit !== null && payload.ask <= exec.take_profit) {
                hitPrice = payload.ask;
                reason = CloseReason.TP;
            }
        }

        if (hitPrice === null || reason === null) continue;

        const pnl = computePnL(exec, hitPrice);
        const closed = await closeExecution(exec.id, reason, hitPrice, pnl);

        if (closed) {
            removeActive(exec.id, exec.symbol);
            await brokerAdapters.onClose({
                ...exec,
                status: 'Closed',
                close_reason: reason,
                close_price: hitPrice,
                profit_loss: pnl,
                closed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        }
    }
}

/**
 * Replay missed candles after restart — fetch 1m klines for the outage window
 * and retroactively close any active executions that hit SL/TP during downtime.
 */
async function replayMissedCandles(): Promise<void> {
    const actives = await loadActiveExecutions();
    if (actives.length === 0) return;

    console.log(`[ExecutionEngine] Replaying missed candles for ${actives.length} active executions`);

    // Group actives by symbol so we only fetch each symbol's 1m klines once
    const bySymbol = new Map<string, SignalExecutionRow[]>();
    for (const exec of actives) {
        const list = bySymbol.get(exec.symbol) || [];
        list.push(exec);
        bySymbol.set(exec.symbol, list);
    }

    // For each symbol, fetch 1m candles from the oldest active execution's created_at
    for (const [symbol, execs] of bySymbol) {
        const oldest = Math.min(...execs.map((e) => new Date(e.created_at).getTime()));
        const lookbackMs = Date.now() - oldest;
        const minutesBack = Math.min(Math.ceil(lookbackMs / 60_000) + 5, 1000); // cap at 1000 minutes

        const klines = await fetchKlines1m(symbol, minutesBack);
        if (klines.length === 0) {
            // If we can't fetch, fall back to in-memory cache only
            execs.forEach(addActive);
            continue;
        }

        // Walk the klines chronologically and check each active execution
        for (const exec of execs) {
            const execStartTs = new Date(exec.created_at).getTime();
            let hit: { price: number; reason: CloseReason } | null = null;

            for (const k of klines) {
                // Only check candles that closed AFTER the execution started
                if (k.closeTime < execStartTs) continue;

                if (exec.direction === 'BUY') {
                    if (exec.stop_loss !== null && k.low <= exec.stop_loss) {
                        hit = { price: exec.stop_loss, reason: CloseReason.SL };
                        break;
                    }
                    if (exec.take_profit !== null && k.high >= exec.take_profit) {
                        hit = { price: exec.take_profit, reason: CloseReason.TP };
                        break;
                    }
                } else {
                    if (exec.stop_loss !== null && k.high >= exec.stop_loss) {
                        hit = { price: exec.stop_loss, reason: CloseReason.SL };
                        break;
                    }
                    if (exec.take_profit !== null && k.low <= exec.take_profit) {
                        hit = { price: exec.take_profit, reason: CloseReason.TP };
                        break;
                    }
                }
            }

            if (hit) {
                const pnl = computePnL(exec, hit.price);
                const closed = await closeExecution(exec.id, hit.reason, hit.price, pnl);
                if (closed) {
                    console.log(
                        `[ExecutionEngine] Replay: closed ${exec.id} reason=${hit.reason} price=${hit.price}`,
                    );
                    // DON'T addActive — it's now closed
                    continue;
                }
            }

            addActive(exec);
        }
    }
}

/**
 * Fetch 1-minute klines for a symbol via ccxt. Returns a simplified kline array.
 */
async function fetchKlines1m(
    symbol: string,
    minutesBack: number,
): Promise<Array<{ closeTime: number; open: number; high: number; low: number; close: number }>> {
    try {
        // Reuse the ccxt exchange instance from signalEngine. Import it.
        const { fetchHistoricalCandles } = await import('./signalEngine');
        const candles = await fetchHistoricalCandles(symbol, '1m', minutesBack);
        return candles.map((c) => ({
            closeTime: c.time * 1000,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        }));
    } catch (err) {
        console.error(`[ExecutionEngine] Failed to fetch 1m klines for ${symbol}:`, err);
        return [];
    }
}

export async function prepareExecutionEngine(): Promise<void> {
    await replayMissedCandles();
}

export async function startExecutionEngine(): Promise<void> {
    // Subscribe to SIGNAL_CREATED events from the Signal Engine
    eventBus.on(EngineEvents.SIGNAL_CREATED, async (payload: any) => {
        try {
            await handleNewSignal(payload);
        } catch (err) {
            console.error('[ExecutionEngine] handleNewSignal error:', err);
        }
    });

    eventBus.on(EngineEvents.PRICE_TICK, async (payload: any) => {
        try {
            await handlePriceTick(payload);
        } catch (err) {
            console.error('[ExecutionEngine] handlePriceTick error:', err);
        }
    });

    // Subscribe to bookTicker for every symbol with an active execution
    for (const symbol of activeBySymbol.keys()) {
        await binanceStream.subscribeBookTicker(symbol);
    }

    console.log('[ExecutionEngine] Started successfully');
}
```

- [ ] **Step 2: Type check**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep executionEngine | head -10
```

Fix any type errors inline.

- [ ] **Step 3: Commit**

```bash
cd "../../"
git add backend/server/src/engine/executionEngine.ts
git commit -m "feat(backend): add Execution Engine for per-user execution + tick monitoring"
```

---

### Task 3.11: Create `platformSignals.ts`

**Files:**
- Create: `backend/server/src/services/platformSignals.ts`

- [ ] **Step 1: Create platform signals module**

Create `backend/server/src/services/platformSignals.ts`:

```ts
// backend/server/src/services/platformSignals.ts
// Defines the platform-wide signal stream: 10 hardcoded symbols running SMA Trend
// with default params. Executions are created with user_id=NULL and are visible
// to users who have no watchlists (filtered on the frontend).

import { Market } from '../constants/enums';

export interface PlatformAssignment {
    strategyId: string;
    symbols: string[];
    market: Market;
    timeframe: string;
    params: Record<string, any>;
}

export const PLATFORM_ASSIGNMENTS: PlatformAssignment[] = [
    {
        strategyId: 'builtin-sma-trend',
        symbols: [
            'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
            'ADAUSDT', 'DOGEUSDT', 'TRXUSDT', 'AVAXUSDT', 'LINKUSDT',
        ],
        market: Market.FUTURES,
        timeframe: '1H',
        params: {},  // use script defaults
    },
];
```

- [ ] **Step 2: Integrate into signalEngine `loadAssignments`**

In `backend/server/src/engine/signalEngine.ts`, after loading the user assignments, append synthetic platform assignments:

```ts
// Append to loadAssignments() in signalEngine.ts, just before `return result;`
import { PLATFORM_ASSIGNMENTS } from '../services/platformSignals';

// ...inside loadAssignments:
for (const pa of PLATFORM_ASSIGNMENTS) {
    const { data: script } = await supabaseAdmin
        .from('scripts')
        .select('id, name, source_code, template_version')
        .eq('id', pa.strategyId)
        .single();
    if (!script) continue;

    result.push({
        id: `platform-${pa.strategyId}`,
        watchlist_id: 'platform',
        user_id: null,
        strategy_id: pa.strategyId,
        params: pa.params,
        timeframe: pa.timeframe,
        symbols: pa.symbols,
        strategy: {
            id: script.id,
            name: script.name,
            source_code: script.source_code,
            template_version: script.template_version || '',
        },
    });
}
```

- [ ] **Step 3: Type check and commit**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep -E "platformSignals|signalEngine" | head -5
cd "../../"
git add backend/server/src/services/platformSignals.ts \
        backend/server/src/engine/signalEngine.ts
git commit -m "feat(backend): add platform signal stream for 10 default symbols"
```

---

### Task 3.12: Update `worker.ts` startup sequence

**Files:**
- Modify: `backend/server/src/worker.ts`

- [ ] **Step 1: Update worker startup**

Replace `backend/server/src/worker.ts`:

```ts
import dotenv from 'dotenv';
import { supabaseAdmin } from './services/supabaseAdmin';
import { syncToDatabase as syncStrategies } from './engine/strategyLoader';
import { startSignalEngine, stopSignalEngine, getSignalEngineStatus } from './engine/signalEngine';
import { prepareExecutionEngine, startExecutionEngine } from './engine/executionEngine';

dotenv.config();

const HEARTBEAT_INTERVAL = 300000; // 5 minutes

async function startWorker() {
    console.log('═══════════════════════════════════════════');
    console.log('       24/7 SIGNAL ENGINE WORKER           ');
    console.log('═══════════════════════════════════════════');
    console.log(`[Worker] PID: ${process.pid}`);

    // DB connectivity
    const { error } = await supabaseAdmin.from('signals').select('id').limit(1);
    if (error) {
        console.error('[Worker] CRITICAL: Supabase connection failed:', error.message);
        process.exit(1);
    }
    console.log('[Worker] ✅ Connected to Supabase');

    // 1. Sync .kuri files into scripts table
    await syncStrategies();

    // 2. Prepare Execution Engine (load active executions, replay missed candles)
    await prepareExecutionEngine();

    // 3. Start Signal Engine (scanner)
    await startSignalEngine();

    // 4. Start Execution Engine (executor + monitor)
    //    MUST be after signalEngine so cold-start scan emissions are heard.
    await startExecutionEngine();

    // Heartbeat
    setInterval(() => {
        const status = getSignalEngineStatus();
        console.log(`[Worker] ❤️ Heartbeat | ${JSON.stringify(status)}`);
    }, HEARTBEAT_INTERVAL);

    const shutdown = () => {
        console.log('[Worker] Shutting down...');
        stopSignalEngine();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

startWorker().catch((err) => {
    console.error('[Worker] Fatal:', err);
    process.exit(1);
});
```

- [ ] **Step 2: Type check and commit**

```bash
cd backend/server
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | grep worker | head -5
cd "../../"
git add backend/server/src/worker.ts
git commit -m "refactor(backend): update worker startup for scanner + executor split"
```

---

### Task 3.13: Delete legacy files

**Files:**
- Delete: `backend/server/src/engine/signalMonitor.ts` (if still present after earlier cleanup)
- Delete: `backend/server/src/engine/strategyEngine.ts` (old monolith if still present)
- Delete: old backend registry glue files

- [ ] **Step 1: Confirm legacy files don't block anything**

```bash
cd backend/server
grep -rn "from.*signalMonitor\|from.*engine/strategyEngine" src/ | grep -v "\.ts:"
```

Expected: no matches (everything already imports from the new modules).

- [ ] **Step 2: Delete legacy files if they still exist**

```bash
rm -f src/engine/signalMonitor.ts
# strategyEngine.ts may still hold calculateCandleRiskLevels — if it's used anywhere
# other than legacy paths, keep a thin shim that re-exports from riskCalculator.
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit --pretty --skipLibCheck 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd "../../"
git add -A backend/server/src/engine/
git commit -m "chore(backend): delete legacy signalMonitor and strategyEngine files"
```

---

## Phase 4 — Frontend Refactor

### Task 4.1: Update `src/strategies/index.ts` to use `js-yaml`

**Files:**
- Modify: `src/strategies/index.ts`

- [ ] **Step 1: Install js-yaml in frontend**

Run from project root:
```bash
pnpm add js-yaml @types/js-yaml
```

- [ ] **Step 2: Update the frontend loader**

Replace `src/strategies/index.ts`:

```ts
/**
 * Strategy Registry (frontend view) — reads .kuri files from the backend strategies
 * directory via Vite glob. Strategies live with the backend because that's what runs them.
 */

import yaml from 'js-yaml';

export type StrategyCategory = 'Trend Following' | 'Momentum' | 'Breakout' | 'Mean Reversion';

export interface ParamDef {
    id: string;
    type: 'int' | 'float' | 'bool' | 'string' | 'source';
    default: any;
    title?: string;
    min?: number;
    max?: number;
    step?: number;
}

export interface BuiltInStrategyMeta {
    id: string;
    name: string;
    description: string;
    category: StrategyCategory;
    kuriSource: string;
    paramSchema: ParamDef[];
}

function parseFrontmatter(source: string): Record<string, any> {
    const match = source.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    try {
        const parsed = yaml.load(match[1]);
        return typeof parsed === 'object' && parsed ? (parsed as Record<string, any>) : {};
    } catch {
        return {};
    }
}

function extractParamSchema(source: string): ParamDef[] {
    const params: ParamDef[] = [];
    const lines = source.split('\n');
    const paramRegex = /^\s*(\w+)\s*=\s*param\.(int|float|bool|string|source)\s*\(([^)]*)\)/;
    for (const line of lines) {
        const m = line.match(paramRegex);
        if (!m) continue;
        const [, id, type, argsRaw] = m;
        const first = argsRaw.split(',')[0].trim();
        const defVal = type === 'bool' ? first === 'true' : type === 'int' || type === 'float' ? Number(first) : first;
        const titleM = argsRaw.match(/title\s*=\s*"([^"]*)"/);
        const minM = argsRaw.match(/min\s*=\s*([\d.-]+)/);
        const maxM = argsRaw.match(/max\s*=\s*([\d.-]+)/);
        params.push({
            id,
            type: type as ParamDef['type'],
            default: defVal,
            title: titleM ? titleM[1] : id,
            min: minM ? Number(minM[1]) : undefined,
            max: maxM ? Number(maxM[1]) : undefined,
        });
    }
    return params;
}

const kuriModules = import.meta.glob(
    '../../backend/server/src/strategies/*.kuri',
    { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

export const STRATEGY_REGISTRY: BuiltInStrategyMeta[] = Object.entries(kuriModules)
    .map(([, source]) => {
        const fm = parseFrontmatter(source);
        if (fm.type !== 'strategy') return null;
        return {
            id: fm.id,
            name: fm.name,
            description: fm.description,
            category: fm.category as StrategyCategory,
            kuriSource: source,
            paramSchema: extractParamSchema(source),
        } as BuiltInStrategyMeta;
    })
    .filter((s): s is BuiltInStrategyMeta => s !== null);

export function getBuiltInStrategy(id: string): BuiltInStrategyMeta | undefined {
    return STRATEGY_REGISTRY.find((s) => s.id === id);
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml src/strategies/index.ts
git commit -m "feat(frontend): upgrade strategy registry to js-yaml + param schema"
```

---

### Task 4.2: Update `watchlistService.ts` for `watchlist_strategies` CRUD

**Files:**
- Modify: `src/services/watchlistService.ts`

- [ ] **Step 1: Add the CRUD functions**

Add to `src/services/watchlistService.ts`:

```ts
export interface WatchlistStrategyAssignment {
    id: string;
    watchlistId: string;
    strategyId: string;
    params: Record<string, any>;
    timeframe: string;
    riskSettings: Record<string, any>;
    lastError: string | null;
    lastErrorAt: string | null;
}

export async function getWatchlistStrategies(watchlistId: string): Promise<WatchlistStrategyAssignment[]> {
    const { data, error } = await supabase
        .from('watchlist_strategies')
        .select('*')
        .eq('watchlist_id', watchlistId);
    if (error) {
        console.warn('[watchlistService] getWatchlistStrategies failed:', error.message);
        return [];
    }
    return (data || []).map((r: any) => ({
        id: r.id,
        watchlistId: r.watchlist_id,
        strategyId: r.strategy_id,
        params: r.params || {},
        timeframe: r.timeframe,
        riskSettings: r.risk_settings || {},
        lastError: r.last_error,
        lastErrorAt: r.last_error_at,
    }));
}

export async function addWatchlistStrategy(
    watchlistId: string,
    strategyId: string,
    params: Record<string, any>,
    timeframe: string,
    riskSettings: Record<string, any> = {},
): Promise<string> {
    const { data, error } = await supabase
        .from('watchlist_strategies')
        .insert({
            watchlist_id: watchlistId,
            strategy_id: strategyId,
            params,
            timeframe,
            risk_settings: riskSettings,
        })
        .select('id')
        .single();
    if (error) throw new Error(error.message);
    return data.id;
}

export async function updateWatchlistStrategyParams(
    assignmentId: string,
    params: Record<string, any>,
): Promise<void> {
    const { error } = await supabase
        .from('watchlist_strategies')
        .update({ params, updated_at: new Date().toISOString() })
        .eq('id', assignmentId);
    if (error) throw new Error(error.message);
}

export async function removeWatchlistStrategy(assignmentId: string): Promise<void> {
    const { error } = await supabase
        .from('watchlist_strategies')
        .delete()
        .eq('id', assignmentId);
    if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/watchlistService.ts
git commit -m "feat(frontend): add watchlist_strategies CRUD functions"
```

---

### Task 4.3: Create `ParamEditorModal.tsx`

**Files:**
- Create: `src/components/strategy-studio/ParamEditorModal.tsx`

- [ ] **Step 1: Build the modal**

Create `src/components/strategy-studio/ParamEditorModal.tsx`:

```tsx
import React, { useState } from 'react';
import type { ParamDef } from '../../strategies';

interface ParamEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    strategyName: string;
    paramSchema: ParamDef[];
    initialValues: Record<string, any>;
    onSave: (values: Record<string, any>) => void;
}

export const ParamEditorModal: React.FC<ParamEditorModalProps> = ({
    isOpen,
    onClose,
    strategyName,
    paramSchema,
    initialValues,
    onSave,
}) => {
    const [values, setValues] = useState<Record<string, any>>(() => {
        const seeded: Record<string, any> = {};
        for (const p of paramSchema) {
            seeded[p.id] = initialValues[p.id] ?? p.default;
        }
        return seeded;
    });

    if (!isOpen) return null;

    const setValue = (id: string, v: any) => setValues((prev) => ({ ...prev, [id]: v }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#18181b] border border-white/10 rounded-lg w-[500px] p-6 shadow-2xl">
                <h3 className="text-lg font-medium text-white mb-1">Edit Parameters</h3>
                <p className="text-sm text-gray-400 mb-5">{strategyName}</p>

                <div className="space-y-4">
                    {paramSchema.map((p) => (
                        <div key={p.id} className="flex flex-col gap-1">
                            <label className="text-xs text-gray-300 uppercase tracking-wide">
                                {p.title || p.id}
                            </label>
                            {p.type === 'bool' ? (
                                <input
                                    type="checkbox"
                                    checked={!!values[p.id]}
                                    onChange={(e) => setValue(p.id, e.target.checked)}
                                    className="h-5 w-5"
                                />
                            ) : (
                                <input
                                    type={p.type === 'int' || p.type === 'float' ? 'number' : 'text'}
                                    value={values[p.id] ?? ''}
                                    min={p.min}
                                    max={p.max}
                                    step={p.type === 'int' ? 1 : p.step || 0.01}
                                    onChange={(e) =>
                                        setValue(
                                            p.id,
                                            p.type === 'int' || p.type === 'float'
                                                ? Number(e.target.value)
                                                : e.target.value,
                                        )
                                    }
                                    className="px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm"
                                />
                            )}
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-md bg-white/5 text-gray-300 hover:bg-white/10"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => { onSave(values); onClose(); }}
                        className="px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-500"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/strategy-studio/ParamEditorModal.tsx
git commit -m "feat(frontend): add ParamEditorModal for per-assignment strategy params"
```

---

### Task 4.4: Update `Signals.tsx` to show executions with error badges and param chips

**Files:**
- Modify: `src/pages/Signals.tsx`

- [ ] **Step 1: Update the data source**

Inside `Signals.tsx`, change the signal data fetch to read from `signal_executions` instead of `signals`. Example:

```ts
// Replace existing signal fetch with:
const { data, error } = await supabase
    .from('signal_executions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
```

- [ ] **Step 2: Show params_snapshot chip per row**

Next to each signal card, render:

```tsx
{signal.params_snapshot && Object.keys(signal.params_snapshot).length > 0 && (
    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
        {Object.entries(signal.params_snapshot).map(([k, v]) => `${k}:${v}`).join(' · ')}
    </span>
)}
```

Note: `params_snapshot` lives on the `signals` table. If signal_executions doesn't copy it, fetch via `select('*, signals!inner(params_snapshot, template_version)')` join.

- [ ] **Step 3: Show last_error warning on broken assignments**

In the Watchlist panel or strategy list in Signals page:

```tsx
{assignment.lastError && (
    <span
        title={assignment.lastError}
        className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 cursor-help"
    >
        ⚠ {assignment.lastError.slice(0, 40)}...
    </span>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Signals.tsx
git commit -m "feat(frontend): show executions with params chip and error badges on Signals page"
```

---

### Task 4.5: Wire `ParamEditorModal` into `AssignStrategiesModal`

**Files:**
- Modify: `src/components/AssignStrategiesModal.tsx`

- [ ] **Step 1: Open and integrate**

After the user selects a strategy to assign, open `ParamEditorModal` with the strategy's `paramSchema` (from `STRATEGY_REGISTRY` or fetched from the scripts table), then call `addWatchlistStrategy` with the collected params.

Key integration points:
```tsx
import { ParamEditorModal } from './strategy-studio/ParamEditorModal';
import { STRATEGY_REGISTRY } from '../strategies';
import { addWatchlistStrategy } from '../services/watchlistService';

// State
const [pendingStrategy, setPendingStrategy] = useState<BuiltInStrategyMeta | null>(null);

// On click "Add" for a strategy:
const handleAdd = (strategyId: string) => {
    const meta = STRATEGY_REGISTRY.find((s) => s.id === strategyId);
    if (meta) setPendingStrategy(meta);
};

// On save from modal:
const handleSaveParams = async (values: Record<string, any>) => {
    if (!pendingStrategy) return;
    await addWatchlistStrategy(
        watchlistId,
        pendingStrategy.id,
        values,
        '1H',  // TODO: let user pick
        {},    // default risk settings
    );
    setPendingStrategy(null);
    onSaved?.();
};

// In render:
{pendingStrategy && (
    <ParamEditorModal
        isOpen
        onClose={() => setPendingStrategy(null)}
        strategyName={pendingStrategy.name}
        paramSchema={pendingStrategy.paramSchema}
        initialValues={{}}
        onSave={handleSaveParams}
    />
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AssignStrategiesModal.tsx
git commit -m "feat(frontend): open ParamEditorModal when assigning a strategy"
```

---

## Phase 5 — Final Cleanup (run 24h+ after Phase 4 ships)

### Task 5.1: Drop legacy columns

**Files:**
- Create: `backend/schema/2026-04-13-06-drop-legacy.sql`

- [ ] **Step 1: Back up Supabase**

Take a full DB backup via Supabase dashboard **before** running this migration. This is irreversible.

- [ ] **Step 2: Create drop migration**

Create `backend/schema/2026-04-13-06-drop-legacy.sql`:

```sql
-- 2026-04-13-06: Drop legacy columns. IRREVERSIBLE.
-- Run ONLY after Phase 4 has been verified in production for 24+ hours.

-- Drop watchlists.strategy_ids (moved to watchlist_strategies)
ALTER TABLE watchlists DROP COLUMN IF EXISTS strategy_ids;

-- Drop execution state columns from signals (moved to signal_executions)
ALTER TABLE signals DROP COLUMN IF EXISTS stop_loss;
ALTER TABLE signals DROP COLUMN IF EXISTS take_profit;
ALTER TABLE signals DROP COLUMN IF EXISTS status;
ALTER TABLE signals DROP COLUMN IF EXISTS closed_at;
ALTER TABLE signals DROP COLUMN IF EXISTS close_reason;
ALTER TABLE signals DROP COLUMN IF EXISTS profit_loss;
ALTER TABLE signals DROP COLUMN IF EXISTS user_id;
```

- [ ] **Step 3: Apply and commit**

Apply via Supabase, then:
```bash
git add backend/schema/2026-04-13-06-drop-legacy.sql
git commit -m "db: drop legacy columns after Phase 4 verification"
```

---

### Task 5.2: Final smoke test

Run through the full checklist from spec Section 6.4:

- [ ] Backend starts cleanly
- [ ] `strategyLoader` logs expected strategy count
- [ ] Binance WebSocket connects
- [ ] Assign SMA Trend to a watchlist via frontend
- [ ] After next candle close, new `signals` row AND `signal_executions` row appear
- [ ] Row values correct (symbol format, market, template_version, params_snapshot)
- [ ] Restart worker mid-test → no duplicates
- [ ] Introduce typo in `sma-trend.kuri` → `last_error` appears
- [ ] Fix typo → `last_error` clears
- [ ] Kill worker during active execution, restart → replay completes
- [ ] Platform stream fires signals for users with no watchlists

If all pass, tag the commit:

```bash
git tag signal-engine-cleanup-complete
```

---

## Appendix: Quick Reference

**Spec:** `docs/superpowers/specs/2026-04-13-signal-engine-cleanup-design.md`

**Key commands:**
```bash
# Backend type check
cd backend/server && npx tsc --noEmit --pretty --skipLibCheck

# Frontend type check
cd "My Project" && npx tsc --noEmit --pretty --skipLibCheck

# Run strategy loader verification
cd backend/server && npx ts-node --transpile-only src/scripts/verify-strategy-loader.ts

# Start worker (dev)
cd backend/server && npm run worker
```

**Commit message conventions:**
- `feat(backend): ...` — new backend functionality
- `feat(frontend): ...` — new frontend functionality
- `refactor(backend): ...` — refactor backend
- `db: ...` — database migrations
- `chore: ...` — dependency updates, file cleanup
