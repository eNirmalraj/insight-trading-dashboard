# Kuri Engine Unification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the 3 IIFEs in `kuri-engine-full.js` into a single IIFE, then replace the backend's separate VM (`backendVM.ts` + 9 supporting files) with the unified frontend engine — giving the server identical execution behavior to the chart.

**Architecture:** Phase 1 collapses the 3-IIFE structure into one scope, eliminating cross-scope bugs like the HMA `_unwrapPeriod` failure. Phase 2 wraps the unified engine in a Node.js-compatible adapter that the backend `strategyEngine.ts` can call, replacing the 1,965-line backend VM entirely. The adapter maps the engine's `KuriResult` to the `BackendVMOutput` shape that `strategyEngine.ts` expects (signals, variables, stopLoss, takeProfit).

**Tech Stack:** Vanilla JavaScript (engine), TypeScript (adapter + backend), Vite (frontend build), Node.js (backend)

---

## Phase 1: Merge 3 IIFEs Into Single IIFE

### Task 1: Flatten IIFE structure

**Files:**
- Modify: `src/lib/kuri/kuri-engine-full.js`

The file currently has 3 IIFEs (lines 8-1369, 1373-2586, 2590-6060) that pass data via `globalThis._KuriP1` and `_KuriP2`. This causes scope isolation bugs — functions like `_unwrapPeriod` defined in IIFE 2 are invisible to expansion pack code in IIFE 3.

- [ ] **Step 1: Remove IIFE 1 closing + IIFE 2 opening + export/import plumbing**

In `kuri-engine-full.js`, find and delete these boundaries:

```javascript
// DELETE — end of IIFE 1 (around line 1367-1369):
    root._KuriP1 = { T, N, Lexer, Parser, _unwrapPeriod, isNa };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);

// DELETE — start of IIFE 2 (around line 1373):
(function (root) {
    'use strict';
```

This merges IIFE 1 and IIFE 2 into one scope.

- [ ] **Step 2: Remove IIFE 2 closing + IIFE 3 opening + export/import plumbing**

Find and delete:

```javascript
// DELETE — end of IIFE 2 (around line 2567-2586):
    root._KuriP2 = {
        nz, isNa, _unwrapPeriod,
        taFunctions, mathFunctions, strFunctions, colorFunctions,
        drawingFunctions, arrayFunctions, timeFunctions, utilityFunctions,
        allFunctions, colorConstants, runtimeConstants,
        DrawingLine, DrawingLabel, DrawingBox,
    };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);

// DELETE — start of IIFE 3 (around line 2589-2604):
(function (root) {
    'use strict';

    const { T, N, Lexer, Parser } = root._KuriP1;
    const {
        nz, isNa, _unwrapPeriod,
        taFunctions, allFunctions,
        colorConstants, runtimeConstants,
        DrawingLine, DrawingLabel, DrawingBox,
    } = root._KuriP2;
```

- [ ] **Step 3: Remove cleanup at end of file**

Find and delete near the end of the file:

```javascript
// DELETE:
    delete root._KuriP1;
    delete root._KuriP2;
```

- [ ] **Step 4: Verify single IIFE structure**

The file should now have exactly ONE `(function (root) {` at the top and ONE `})(typeof globalThis...` at the bottom. Run:

```bash
grep -n "^(function" src/lib/kuri/kuri-engine-full.js
# Expected: ONE line (line 8)

grep -n "^})" src/lib/kuri/kuri-engine-full.js
# Expected: ONE line (last line)

grep -n "_KuriP1\|_KuriP2" src/lib/kuri/kuri-engine-full.js
# Expected: NO matches
```

- [ ] **Step 5: Test engine works in Node.js**

```bash
cat > test_merge.cjs << 'EOF'
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:50},(_, i)=>100+i);
const ohlcv = { open: close, high: close, low: close, close, volume: Array(50).fill(1000), time: Array.from({length:50},(_, i)=>i*60) };

// Test SMA
let r = engine.run('//@version=1\nindicator("S", overlay=true)\nv = ta.sma(close, 5)\nplot(v, title="V")', ohlcv);
console.log('SMA:', r.plots[0]?.data.filter(v=>!isNaN(v)).length > 0 ? 'PASS' : 'FAIL');

// Test HMA (was broken by cross-IIFE scope)
r = engine.run('//@version=1\nindicator("H", overlay=true)\nv = ta.hma(close, 9)\nplot(v, title="V")', ohlcv);
console.log('HMA:', r.plots[0]?.data.filter(v=>!isNaN(v)).length > 0 ? 'PASS' : 'FAIL');

// Test MACD with per-bar colors
r = engine.run('//@version=1\nindicator("M", overlay=false)\nfast = ta.ema(close, 12)\nslow = ta.ema(close, 26)\nmacd = fast - slow\nsignal = ta.ema(macd, 9)\nhist = macd - signal\nplot(hist, title="H", style=plot.style_columns)\nplot(macd, title="M")\nplot(signal, title="S")', ohlcv);
console.log('MACD:', r.plots.length === 3 ? 'PASS' : 'FAIL');

// Test strategy
r = engine.run('//@version=1\nstrategy("Test")\nif close > close[1]\n    strategy.entry("L", strategy.long)\n', ohlcv);
console.log('Strategy:', r.success ? 'PASS' : 'FAIL');

console.log('All done');
EOF
node test_merge.cjs && rm test_merge.cjs
```

Expected: All PASS.

- [ ] **Step 6: Test frontend build**

```bash
npx vite build
```

Expected: Build succeeds (same output as before).

- [ ] **Step 7: Commit**

```bash
git add src/lib/kuri/kuri-engine-full.js
git commit -m "refactor(kuri): merge 3 IIFEs into single scope

Eliminates cross-scope bugs where expansion pack functions (ta.hma, ta.dema,
ta.tema, etc.) couldn't access helpers (_unwrapPeriod, isNa) defined in a
different IIFE. All code now shares one closure."
```

---

## Phase 2: Unify Frontend/Backend VMs

### Task 2: Create Node.js adapter for the unified engine

**Files:**
- Create: `backend/server/src/kuri/kuriAdapter.ts`

This adapter replaces the old `Kuri` class. It loads `kuri-engine-full.js`, runs scripts, and maps `KuriResult` → `BackendVMOutput`.

- [ ] **Step 1: Create the adapter**

```typescript
// backend/server/src/kuri/kuriAdapter.ts
import * as path from 'path';
import * as fs from 'fs';

// ── Load engine ──
// The engine is a UMD IIFE that sets globalThis.Kuri
const enginePath = path.resolve(__dirname, '../../../../src/lib/kuri/kuri-engine-full.js');
if (!(globalThis as any).Kuri) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(enginePath);
}
const KuriEngine = (globalThis as any).Kuri?.KuriEngine;
if (!KuriEngine) {
    throw new Error(`[KuriAdapter] Failed to load KuriEngine from ${enginePath}`);
}

// ── Types matching existing BackendVMOutput contract ──
export interface Context {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume?: number[];
    [key: string]: any;
}

export interface StrategySignal {
    type: 'ENTRY' | 'EXIT';
    direction?: 'LONG' | 'SHORT';
    id: string;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    timestamp: number;
}

export interface BackendVMOutput {
    context: Context;
    signals: StrategySignal[];
    variables: Record<string, any>;
    stopLoss?: number;
    takeProfit?: number;
}

// ── Rising-edge detector (ported from old BackendVM) ──
// Prevents duplicate signals when condition stays true across bars
const risingEdge = (current: boolean, prev: boolean): boolean => current && !prev;

/**
 * Unified Kuri execution — replaces the old Kuri.executeWithVM().
 * Uses the same engine as the frontend chart renderer.
 */
export function executeKuri(script: string, context: Context): BackendVMOutput {
    const engine = new KuriEngine();
    const ohlcv = {
        open: context.open,
        high: context.high,
        low: context.low,
        close: context.close,
        volume: context.volume || context.close.map(() => 0),
        time: context.close.map((_, i) => i), // placeholder timestamps
    };

    const result = engine.run(script, ohlcv);

    if (!result.success) {
        const errorMsg = result.errors.map((e: any) => e.message).join('; ');
        throw new Error(`Kuri execution failed: ${errorMsg}`);
    }

    // ── Extract strategy signals ──
    const signals: StrategySignal[] = [];
    const strategyState = new Map<string, boolean>();

    // The engine's StrategyEngine stores orders in result.strategy?.orders
    // We need to convert these to the signal format with rising-edge detection
    const orders = (result as any).strategy?.orders || [];
    for (const order of orders) {
        if (order.type === 'entry') {
            signals.push({
                type: 'ENTRY',
                direction: order.direction?.toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
                id: order.id || 'default',
                price: context.close[context.close.length - 1],
                timestamp: context.close.length - 1,
            });
        } else if (order.type === 'exit' || order.type === 'close') {
            signals.push({
                type: 'EXIT',
                id: order.id || 'default',
                price: context.close[context.close.length - 1],
                timestamp: context.close.length - 1,
            });
        }
    }

    // ── Extract alertcondition signals as strategy signals ──
    // Many strategies use alertcondition() instead of strategy.entry()
    if (signals.length === 0 && result.alerts) {
        for (const alert of result.alerts) {
            if (!alert.condition || !Array.isArray(alert.condition)) continue;
            const lastBar = context.close.length - 1;
            if (alert.condition[lastBar]) {
                const titleLower = (alert.title || '').toLowerCase();
                const isBuy = titleLower.includes('buy') || titleLower.includes('long');
                const isSell = titleLower.includes('sell') || titleLower.includes('short');
                if (isBuy || isSell) {
                    signals.push({
                        type: 'ENTRY',
                        direction: isBuy ? 'LONG' : 'SHORT',
                        id: alert.title || 'alert',
                        price: context.close[lastBar],
                        timestamp: lastBar,
                    });
                }
            }
        }
    }

    // ── Extract variables from seriesData ──
    const variables: Record<string, any> = {};
    if (result.seriesData) {
        for (const [key, value] of result.seriesData) {
            variables[key] = value;
        }
    }

    // ── Check for legacy buy_signal/sell_signal variables ──
    // The unified engine stores variables in seriesData
    const lastIdx = context.close.length - 1;
    const buySignal = variables['buy_signal'];
    const sellSignal = variables['sell_signal'];
    if (signals.length === 0) {
        if (buySignal) {
            const val = Array.isArray(buySignal) ? buySignal[lastIdx] : buySignal;
            if (val) {
                signals.push({
                    type: 'ENTRY',
                    direction: 'LONG',
                    id: 'buy_signal',
                    price: context.close[lastIdx],
                    timestamp: lastIdx,
                });
            }
        }
        if (sellSignal) {
            const val = Array.isArray(sellSignal) ? sellSignal[lastIdx] : sellSignal;
            if (val) {
                signals.push({
                    type: 'ENTRY',
                    direction: 'SHORT',
                    id: 'sell_signal',
                    price: context.close[lastIdx],
                    timestamp: lastIdx,
                });
            }
        }
    }

    return {
        context,
        signals,
        variables,
        stopLoss: undefined, // Engine doesn't have SL/TP yet — can be added to strategy.*
        takeProfit: undefined,
    };
}

/**
 * Drop-in replacement for the old Kuri class.
 * Preserves the same static API so strategyEngine.ts needs minimal changes.
 */
export class Kuri {
    static executeWithVM(script: string, context: Context): BackendVMOutput {
        return executeKuri(script, context);
    }

    static execute(script: string, context: Context): any {
        return executeKuri(script, context);
    }
}
```

- [ ] **Step 2: Verify adapter compiles**

```bash
cd backend/server && npx tsc --noEmit src/kuri/kuriAdapter.ts
```

- [ ] **Step 3: Commit**

```bash
git add backend/server/src/kuri/kuriAdapter.ts
git commit -m "feat(kuri): add unified engine adapter for backend

Replaces the old BackendVM with the frontend kuri-engine-full.js.
Provides identical Kuri.executeWithVM() API so strategyEngine.ts
needs minimal changes. Maps KuriResult → BackendVMOutput format."
```

---

### Task 3: Update strategyEngine.ts to use the unified adapter

**Files:**
- Modify: `backend/server/src/engine/strategyEngine.ts:12`

- [ ] **Step 1: Change the import**

Replace line 12:

```typescript
// OLD:
import { Kuri } from '../kuri/kuri';

// NEW:
import { Kuri } from '../kuri/kuriAdapter';
```

No other changes needed — `kuriAdapter.ts` exports the same `Kuri` class with the same `executeWithVM()` method.

- [ ] **Step 2: Test backend build**

```bash
cd backend/server && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add backend/server/src/engine/strategyEngine.ts
git commit -m "feat(kuri): switch strategyEngine to unified engine adapter"
```

---

### Task 4: Update remaining backend consumers

**Files:**
- Modify: `backend/server/src/scripts/audit-kuri-vm.ts`
- Modify: `backend/server/src/scripts/verify-kuri-fix.ts`
- Modify: `backend/server/src/scripts/verify-kuri-flow.ts`

- [ ] **Step 1: Update imports in all 3 script files**

In each file, change:

```typescript
// OLD:
import { Kuri } from '../kuri/kuri';
// or
import { Kuri, Context } from '../kuri/kuri';

// NEW:
import { Kuri, Context } from '../kuri/kuriAdapter';
```

- [ ] **Step 2: Build and verify**

```bash
cd backend/server && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add backend/server/src/scripts/audit-kuri-vm.ts backend/server/src/scripts/verify-kuri-fix.ts backend/server/src/scripts/verify-kuri-flow.ts
git commit -m "chore(kuri): migrate utility scripts to unified engine adapter"
```

---

### Task 5: Delete the old backend VM files

**Files:**
- Delete: `backend/server/src/kuri/backendVM.ts` (684 lines)
- Delete: `backend/server/src/kuri/interpreter.ts` (393 lines)
- Delete: `backend/server/src/kuri/lexer.ts` (213 lines)
- Delete: `backend/server/src/kuri/parser.ts` (217 lines)
- Delete: `backend/server/src/kuri/types.ts` (93 lines)
- Delete: `backend/server/src/kuri/ir.ts` (64 lines)
- Delete: `backend/server/src/kuri/kuri.ts` (135 lines)
- Delete: `backend/server/src/kuri/runtimeLimits.ts` (36 lines)
- Delete: `backend/server/src/kuri/test_kuri.ts` (58 lines)
- Delete: `backend/server/src/kuri/test_kuri_v2.ts` (72 lines)

- [ ] **Step 1: Verify no other imports reference the old files**

```bash
cd backend/server && grep -r "from.*'../kuri/kuri'" src/ --include="*.ts" | grep -v kuriAdapter | grep -v node_modules
grep -r "from.*'../kuri/backendVM'" src/ --include="*.ts" | grep -v node_modules
grep -r "from.*'../kuri/interpreter'" src/ --include="*.ts" | grep -v node_modules
grep -r "from.*'../kuri/lexer'" src/ --include="*.ts" | grep -v node_modules
grep -r "from.*'../kuri/parser'" src/ --include="*.ts" | grep -v node_modules
grep -r "from.*'../kuri/types'" src/ --include="*.ts" | grep -v node_modules
grep -r "from.*'../kuri/ir'" src/ --include="*.ts" | grep -v node_modules
```

Expected: NO matches (all consumers now import from `kuriAdapter`).

- [ ] **Step 2: Delete all old files**

```bash
cd backend/server
rm src/kuri/backendVM.ts src/kuri/interpreter.ts src/kuri/lexer.ts src/kuri/parser.ts src/kuri/types.ts src/kuri/ir.ts src/kuri/kuri.ts src/kuri/runtimeLimits.ts src/kuri/test_kuri.ts src/kuri/test_kuri_v2.ts
```

- [ ] **Step 3: Build to confirm nothing breaks**

```bash
cd backend/server && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A backend/server/src/kuri/
git commit -m "chore(kuri): remove old backend VM (1,965 lines)

Replaced by kuriAdapter.ts which wraps the unified kuri-engine-full.js.
Server now uses the same engine as the chart renderer.
Deleted: backendVM.ts, interpreter.ts, lexer.ts, parser.ts, types.ts,
ir.ts, kuri.ts, runtimeLimits.ts, test_kuri.ts, test_kuri_v2.ts"
```

---

### Task 6: Final verification

- [ ] **Step 1: Frontend build**

```bash
npx vite build
```

- [ ] **Step 2: Backend build**

```bash
cd backend/server && npm run build
```

- [ ] **Step 3: Node.js engine test**

```bash
cat > test_unified.cjs << 'EOF'
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:100},(_, i)=>100+Math.sin(i/10)*20);
const ohlcv = { open: close, high: close.map(v=>v+2), low: close.map(v=>v-2), close, volume: Array(100).fill(1000), time: Array.from({length:100},(_, i)=>i*60) };

const tests = [
    ['SMA', '//@version=1\nindicator("S",overlay=true)\nplot(ta.sma(close,14),title="V")'],
    ['EMA', '//@version=1\nindicator("E",overlay=true)\nplot(ta.ema(close,14),title="V")'],
    ['HMA', '//@version=1\nindicator("H",overlay=true)\nplot(ta.hma(close,9),title="V")'],
    ['DEMA', '//@version=1\nindicator("D",overlay=true)\nplot(ta.dema(close,14),title="V")'],
    ['TEMA', '//@version=1\nindicator("T",overlay=true)\nplot(ta.tema(close,14),title="V")'],
    ['RSI', '//@version=1\nindicator("R",overlay=false)\nplot(ta.rsi(close,14),title="V")'],
    ['MACD', '//@version=1\nindicator("M",overlay=false)\nf=ta.ema(close,12)\ns=ta.ema(close,26)\nplot(f-s,title="V")'],
    ['BB', '//@version=1\nindicator("B",overlay=true)\n[m,u,l]=ta.bb(close,20,2)\nplot(m,title="M")\nplot(u,title="U")\nplot(l,title="L")'],
];

let pass = 0, fail = 0;
for (const [name, script] of tests) {
    try {
        const r = engine.run(script, ohlcv);
        const ok = r.success && r.plots[0]?.data.filter(v=>!isNaN(v)).length > 0;
        console.log(ok ? 'PASS' : 'FAIL', name);
        ok ? pass++ : fail++;
    } catch(e) { console.log('FAIL', name, e.message); fail++; }
}
console.log(`\n${pass}/${pass+fail} passed`);
EOF
node test_unified.cjs && rm test_unified.cjs
```

Expected: All PASS.

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "chore: kuri engine unification complete

Single IIFE, single VM, identical behavior on frontend and backend.
- Merged 3 IIFEs → 1 (eliminated cross-scope bugs)
- Replaced 1,965-line backend VM with unified engine adapter
- Server now has access to 50+ indicators (was 10)
- Strategies can use for/while loops, user functions (was basic expressions only)"
```
