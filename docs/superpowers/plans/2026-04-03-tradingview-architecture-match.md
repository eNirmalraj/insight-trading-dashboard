# TradingView Architecture Match — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the indicator system match TradingView's architecture — one style-driven renderer, no hardcoded type checks, overlay from .kuri only, Web Worker for performance.

**Architecture:** Remove all hardcoded indicator type rendering (MACD, Stochastic, etc.) and route everything through the dynamic Kuri renderer. Replace OVERLAY_TYPES array with `kuriOverlay` from the .kuri script's `indicator()` declaration. Move Kuri engine execution to a Web Worker so indicator computation doesn't block the UI.

**Tech Stack:** TypeScript, React, Canvas 2D, Web Workers, Kuri Engine

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/market-chart/CandlestickChart.tsx` | Modify | Remove 6 hardcoded renderers, remove OVERLAY_TYPES, simplify isOverlayIndicator |
| `src/lib/kuri/kuri-worker.ts` | Create | Web Worker wrapper — runs Kuri engine off main thread |
| `src/lib/kuri/kuri-bridge.ts` | Modify | Use Web Worker for `run()`, keep `compile()` sync |
| `src/indicators/stochastic.kuri` | Modify | Add hlines for 80/20/50 levels (currently hardcoded in renderer) |
| `src/indicators/cci.kuri` | Modify | Add hlines for +100/0/-100 levels |
| `src/indicators/adx.kuri` | Modify | Add hline for 25 level |
| `src/indicators/mfi.kuri` | Modify | Add hlines for 80/20 levels |

---

### Task 1: Add missing hlines to .kuri scripts

The hardcoded renderers draw reference lines (e.g., CCI at ±100, Stochastic at 80/20). Before removing those renderers, the .kuri scripts must define these hlines so the dynamic renderer draws them.

**Files:**
- Modify: `src/indicators/stochastic.kuri`
- Modify: `src/indicators/cci.kuri`
- Modify: `src/indicators/adx.kuri`
- Modify: `src/indicators/mfi.kuri`

- [ ] **Step 1: Read current .kuri files and check what hlines exist**

Check each file for existing `hline()` calls.

- [ ] **Step 2: Add hlines to stochastic.kuri**

Add after the plot() calls:
```kuri
hline(80, title="Overbought", color=#787B86)
hline(50, title="Middle", color=#787B86)
hline(20, title="Oversold", color=#787B86)
```

- [ ] **Step 3: Add hlines to cci.kuri**

```kuri
hline(100, title="Upper", color=#787B86)
hline(0, title="Zero", color=#787B86)
hline(-100, title="Lower", color=#787B86)
```

- [ ] **Step 4: Add hlines to adx.kuri**

```kuri
hline(25, title="Threshold", color=#787B86)
```

- [ ] **Step 5: Add hlines to mfi.kuri**

```kuri
hline(80, title="Overbought", color=#787B86)
hline(20, title="Oversold", color=#787B86)
```

- [ ] **Step 6: Verify all .kuri scripts have correct hlines**

Run: `grep -l "hline" src/indicators/*.kuri` to confirm all oscillator scripts have hlines.

- [ ] **Step 7: Commit**

```bash
git add src/indicators/stochastic.kuri src/indicators/cci.kuri src/indicators/adx.kuri src/indicators/mfi.kuri
git commit -m "feat: add hlines to oscillator .kuri scripts for dynamic rendering"
```

---

### Task 2: Remove hardcoded panel renderers

Replace the 6 hardcoded type-specific renderers (MACD, Stochastic, CCI, ADX, MFI, OBV) with the dynamic Kuri renderer that reads `kuriPlots[i].style`.

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx:2747-2942` (canvas panel renderer)

- [ ] **Step 1: Read the current hardcoded renderers (lines 2747-2942)**

Understand what each hardcoded renderer does that the dynamic renderer doesn't.

- [ ] **Step 2: Delete the 6 hardcoded type checks**

Remove the entire block from line 2747 (`if ((indicator.type as string) === 'MACD')`) through the end of the OBV handler (line ~2942, the `}` before `} else {`).

The `} else {` at line 2943 becomes the only path — the dynamic Kuri renderer handles ALL panel indicators.

Change the preceding condition (around line 2745) from:
```typescript
} else if ((indicator.type as string) === 'MACD') {
```
to just fall through to the dynamic renderer.

- [ ] **Step 3: Also remove hardcoded type checks in the SVG fallback section**

Search for hardcoded MACD/Stochastic/etc rendering in the SVG section (~lines 8291-8400). Remove those and let the dynamic path handle them.

- [ ] **Step 4: Build and verify no TypeScript errors**

Run: `pnpm build`

- [ ] **Step 5: Test in browser — add MACD, RSI, Stochastic, Volume**

All should render correctly through the dynamic renderer:
- MACD: histogram (columns) + 2 lines
- RSI: line + 3 hlines (30/50/70)
- Stochastic: 2 lines + 3 hlines (20/50/80)
- Volume: columns

- [ ] **Step 6: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "refactor: remove hardcoded indicator renderers, use dynamic Kuri renderer for all"
```

---

### Task 3: Replace OVERLAY_TYPES with kuriOverlay

Remove the hardcoded OVERLAY_TYPES array and use ONLY `indicator(overlay=true/false)` from the .kuri script.

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

- [ ] **Step 1: Delete the OVERLAY_TYPES useMemo (lines 957-997)**

Remove the entire `const OVERLAY_TYPES = useMemo(...)` block.

- [ ] **Step 2: Simplify isOverlayIndicator to use kuriOverlay only**

Replace:
```typescript
const isOverlayIndicator = useCallback(
    (i: Indicator) => {
        if (OVERLAY_TYPES.includes(i.type)) return true;
        if (i.type.startsWith('KURI_') && i.kuriPlots && i.kuriPlots.length > 0) {
            return i.kuriOverlay === true;
        }
        return false;
    },
    [OVERLAY_TYPES]
);
```

With:
```typescript
const isOverlayIndicator = useCallback(
    (i: Indicator) => i.kuriOverlay === true,
    []
);
```

- [ ] **Step 3: Ensure all indicators set kuriOverlay during add/hydration**

In `handleAddIndicator` and the DB hydration paths, verify that `kuriOverlay` is always set from the Kuri engine result: `indicator.kuriOverlay = result.indicator?.overlay ?? false`

Note the default changed from `true` to `false` — if the .kuri script doesn't specify `overlay`, it should default to a separate pane (safer default).

- [ ] **Step 4: Build and test**

Run: `pnpm build`
Test: Add SMA (should be overlay), RSI (should be panel), MACD (should be panel), BB (should be overlay).

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "refactor: replace OVERLAY_TYPES with kuriOverlay from .kuri scripts"
```

---

### Task 4: Move Kuri engine to Web Worker

The Kuri engine blocks the main thread for 5-15 seconds per indicator. Move it to a Web Worker so the UI stays responsive.

**Files:**
- Create: `src/lib/kuri/kuri-worker.ts`
- Modify: `src/lib/kuri/kuri-bridge.ts`

- [ ] **Step 1: Create the Web Worker file**

Create `src/lib/kuri/kuri-worker.ts`:
```typescript
// Web Worker for Kuri engine execution
import * as KuriModule from './kuri-engine-full.js';

const _mod: any = KuriModule;
const Kuri: any = _mod.default?.KuriEngine ? _mod.default :
    _mod.KuriEngine ? _mod : _mod.default || _mod;

self.onmessage = (e: MessageEvent) => {
    const { id, script, ohlcv, inputOverrides } = e.data;
    try {
        const engine = new Kuri.KuriEngine();
        const result = engine.run(script, ohlcv, inputOverrides);
        self.postMessage({ id, result, error: null });
    } catch (error: any) {
        self.postMessage({ id, result: null, error: error.message });
    }
};
```

- [ ] **Step 2: Update kuri-bridge.ts to use the worker**

Change `run()` to return a Promise and use the worker:
```typescript
private worker: Worker | null = null;
private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

private getWorker(): Worker {
    if (!this.worker) {
        this.worker = new Worker(
            new URL('./kuri-worker.ts', import.meta.url),
            { type: 'module' }
        );
        this.worker.onmessage = (e) => {
            const { id, result, error } = e.data;
            const pending = this.pendingRequests.get(id);
            if (pending) {
                this.pendingRequests.delete(id);
                if (error) pending.reject(new Error(error));
                else pending.resolve(result);
            }
        };
    }
    return this.worker;
}

async run(script: string, candles: Candle[], inputOverrides?: Record<string, any>): Promise<KuriResult> {
    const MAX_KURI_CANDLES = 2000;
    const trimmed = candles.length > MAX_KURI_CANDLES
        ? candles.slice(candles.length - MAX_KURI_CANDLES) : candles;
    const ohlcv = {
        open: trimmed.map(c => c.open),
        high: trimmed.map(c => c.high),
        low: trimmed.map(c => c.low),
        close: trimmed.map(c => c.close),
        volume: trimmed.map(c => c.volume ?? 0),
        time: trimmed.map(c => c.time),
    };
    
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const padLen = candles.length - trimmed.length;
    
    return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, {
            resolve: (result: KuriResult) => {
                // Pad plot data
                if (padLen > 0) {
                    const pad = new Array(padLen).fill(NaN);
                    for (const plot of result.plots) {
                        if (Array.isArray(plot.data)) plot.data = [...pad, ...plot.data];
                    }
                }
                result.barCount = candles.length;
                resolve(result);
            },
            reject,
        });
        this.getWorker().postMessage({ id, script, ohlcv, inputOverrides });
    });
}
```

- [ ] **Step 3: Update all callers to await the async run()**

In CandlestickChart.tsx, every `bridge.run(...)` call becomes `await bridge.run(...)`. The functions that call it are already async or in useEffect callbacks.

- [ ] **Step 4: Build and test**

Run: `pnpm build`
Test: Add an indicator — UI should stay responsive during computation. The indicator appears after computation completes instead of freezing the browser.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kuri/kuri-worker.ts src/lib/kuri/kuri-bridge.ts src/components/market-chart/CandlestickChart.tsx
git commit -m "perf: move Kuri engine to Web Worker for non-blocking indicator computation"
```

---

### Task 5: Clean up mapping tables

Remove TYPE_TO_REGISTRY_ID and REGISTRY_TO_TYPE. Use the indicator registry directly by ID.

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`
- Modify: `src/components/market-chart/IndicatorPickerModal.tsx`

- [ ] **Step 1: Refactor IndicatorPickerModal to pass registry ID directly**

Instead of mapping registry ID → IndicatorType string, pass the full registry entry:
```typescript
// Change onAdd prop from (type: IndicatorType) => void
// to (indicator: IndicatorMeta) => void
onAdd: (indicator: IndicatorMeta) => void;
```

The button click becomes:
```typescript
onClick={() => {
    onAdd(ind); // pass the full IndicatorMeta
    onClose();
}}
```

- [ ] **Step 2: Refactor handleAddIndicator to accept IndicatorMeta**

Instead of looking up the registry entry from a type string, receive it directly:
```typescript
const handleAddIndicator = async (meta: IndicatorMeta) => {
    const newIndicator: Indicator = {
        id: `ind${Date.now()}`,
        type: meta.shortname as IndicatorType,
        settings: {},
        data: {},
        isVisible: true,
    };
    // Run Kuri engine directly with meta.kuriSource
    if (meta.kuriSource && data.length > 0) {
        const bridge = getKuriBridge();
        const result = await bridge.run(meta.kuriSource, data);
        // ... extract inputDefs, plots, hlines from result
    }
};
```

- [ ] **Step 3: Remove TYPE_TO_REGISTRY_ID from CandlestickChart.tsx**

Delete the entire `TYPE_TO_REGISTRY_ID` object (lines 70-98) and the `findRegistryEntry()` function.

- [ ] **Step 4: Remove REGISTRY_TO_TYPE from IndicatorPickerModal.tsx**

Delete the `REGISTRY_TO_TYPE` object (lines 31-49).

- [ ] **Step 5: Update DB hydration to use registry lookup by ID**

The DB stores `indicator_type` as the shortname (e.g., 'MA', 'RSI'). During hydration, look up the registry by matching `shortname` or `id` directly from `DEFAULT_INDICATORS`.

- [ ] **Step 6: Build and test**

Run: `pnpm build`
Test: Add indicators from picker, reload page (DB hydration), change settings.

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx src/components/market-chart/IndicatorPickerModal.tsx
git commit -m "refactor: remove mapping tables, use indicator registry directly"
```

---

## Execution Order

Tasks are ordered by dependency:

1. **Task 1** (hlines in .kuri) — no dependencies, enables Task 2
2. **Task 2** (remove hardcoded renderers) — depends on Task 1
3. **Task 3** (replace OVERLAY_TYPES) — independent of Task 2
4. **Task 4** (Web Worker) — independent, biggest performance win
5. **Task 5** (clean mapping tables) — depends on Tasks 2+3 being stable

Tasks 2, 3, and 4 can be done in parallel if using subagent-driven development.
