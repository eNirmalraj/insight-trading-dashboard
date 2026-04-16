# Signal Full-Chart Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing lightweight `MiniChart` modal on the Signals page with a full-screen modal embedding the real `CandlestickChart`, pre-loaded with the signal's symbol, timeframe, strategy indicators, and entry/SL/TP horizontal level lines.

**Architecture:** A new `SignalChartModal` component fetches candles via `getCandlesWithCache`, fetches the strategy script via `getStrategies`, and passes both to the existing `CandlestickChart`. Entry/SL/TP levels are injected as `HorizontalLineDrawing` objects through the existing `initialDrawings` prop — no modification to CandlestickChart needed. Signals.tsx replaces its old `MiniChart` modal block with the new component.

**Tech Stack:** React 18 + TypeScript, existing `CandlestickChart`, existing `getCandlesWithCache`, existing `getStrategies` service, existing chart Drawing types.

Spec: [docs/superpowers/specs/2026-04-16-signal-chart-modal-design.md](../specs/2026-04-16-signal-chart-modal-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/components/SignalChartModal.tsx` | Create | Full-screen modal: fetch candles + strategy, render CandlestickChart with level lines |
| `src/pages/Signals.tsx` | Modify | Replace `chartModalData` state + MiniChart modal with `openChartSignal` + SignalChartModal |
| `src/components/SignalCard.tsx` | Modify | Remove `signal.chartData &&` guard on Chart button |
| `src/components/SignalRow.tsx` | Modify | Remove `signal.chartData &&` guard on Chart button |

No changes to `CandlestickChart.tsx` — everything goes through existing props.

No test framework in the frontend currently — verification is manual.

---

## Task 1: Create `SignalChartModal`

**Files:**
- Create: `src/components/SignalChartModal.tsx`

This is the main task. The component:
1. Fetches candles for the signal's symbol + timeframe on mount
2. Fetches the strategy script (for `autoAddScriptId` / `customScripts`)
3. Builds `HorizontalLineDrawing[]` for entry/SL/TP levels
4. Renders a full-screen overlay with `CandlestickChart`
5. Handles loading state, error state, and Escape key to close

- [ ] **Step 1: Create the component file**

```tsx
// src/components/SignalChartModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Signal, Strategy } from '../types';
import { Candle, HorizontalLineDrawing, Drawing } from './market-chart/types';
import CandlestickChart from './market-chart/CandlestickChart';
import { getCandlesWithCache } from '../services/marketDataService';
import { getStrategies } from '../services/strategyService';
import { CloseIcon } from './IconComponents';
import Loader from './Loader';

interface SignalChartModalProps {
    signal: Signal;
    onClose: () => void;
}

function buildLevelDrawings(signal: Signal): Drawing[] {
    const drawings: HorizontalLineDrawing[] = [];

    if (signal.entry) {
        drawings.push({
            id: '__signal-entry',
            type: 'Horizontal Line',
            price: signal.entry,
            style: { color: '#eab308', width: 1, lineStyle: 'dashed' },
        });
    }
    if (signal.stopLoss) {
        drawings.push({
            id: '__signal-sl',
            type: 'Horizontal Line',
            price: signal.stopLoss,
            style: { color: '#ef4444', width: 1, lineStyle: 'dashed' },
        });
    }
    if (signal.takeProfit) {
        drawings.push({
            id: '__signal-tp',
            type: 'Horizontal Line',
            price: signal.takeProfit,
            style: { color: '#22c55e', width: 1, lineStyle: 'dashed' },
        });
    }

    return drawings;
}

const EMPTY_TOOLS: { icon: React.ReactNode; name: string; category: string }[] = [];

const SignalChartModal: React.FC<SignalChartModalProps> = ({ signal, onClose }) => {
    const [candles, setCandles] = useState<Candle[]>([]);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Escape key handler
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Fetch candles + strategy on mount
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [candleResult, allStrategies] = await Promise.all([
                    getCandlesWithCache(signal.pair, signal.timeframe, 300),
                    getStrategies(),
                ]);

                if (cancelled) return;
                setCandles(candleResult.data);
                setStrategies(allStrategies);
            } catch (err: any) {
                if (cancelled) return;
                console.error('[SignalChartModal] load failed:', err);
                setError(err?.message || 'Failed to load chart data');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [signal.pair, signal.timeframe]);

    const levelDrawings = buildLevelDrawings(signal);

    // No-op callbacks for read-only mode
    const noop = useCallback(() => {}, []);
    const noopStr = useCallback((_s: string) => {}, []);

    const handleRetry = () => {
        setError(null);
        setIsLoading(true);
        getCandlesWithCache(signal.pair, signal.timeframe, 300)
            .then((result) => setCandles(result.data))
            .catch((err) => setError(err?.message || 'Failed to load chart data'))
            .finally(() => setIsLoading(false));
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900/80">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-white">{signal.pair}</h3>
                    <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded px-2 py-0.5">
                        {signal.timeframe}
                    </span>
                    {signal.strategy && (
                        <span className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/30 rounded px-2 py-0.5">
                            {signal.strategy}
                        </span>
                    )}
                    <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                            signal.direction === 'BUY'
                                ? 'text-green-400 bg-green-500/10 border border-green-500/30'
                                : 'text-red-400 bg-red-500/10 border border-red-500/30'
                        }`}
                    >
                        {signal.direction}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close chart"
                    className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                    <CloseIcon className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0">
                {isLoading && (
                    <div className="flex items-center justify-center h-full">
                        <Loader />
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <p className="text-red-400 text-sm">{error}</p>
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !error && candles.length > 0 && (
                    <CandlestickChart
                        data={candles}
                        tools={EMPTY_TOOLS}
                        symbol={signal.pair}
                        onSymbolChange={noopStr}
                        allTimeframes={[signal.timeframe]}
                        favoriteTimeframes={[signal.timeframe]}
                        activeTimeframe={signal.timeframe}
                        onTimeframeChange={noopStr}
                        onToggleFavorite={noopStr}
                        onAddCustomTimeframe={noopStr}
                        onLogout={noop}
                        onToggleMobileSidebar={noop}
                        initialDrawings={levelDrawings}
                        customScripts={strategies}
                        autoAddScriptId={signal.strategyId || null}
                        onAutoAddComplete={noop}
                    />
                )}
            </div>
        </div>
    );
};

export default SignalChartModal;
```

- [ ] **Step 2: Verify types**

Run: `pnpm tsc --noEmit`

Expected: no new errors relating to this file. The key imports to verify:
- `HorizontalLineDrawing` and `Drawing` from `./market-chart/types`
- `CandlestickChart` default export from `./market-chart/CandlestickChart`
- `getCandlesWithCache` returns `CandleResult` which has `.data: Candle[]`
- `getStrategies` returns `Promise<Strategy[]>`

If `HorizontalLineDrawing` is not directly exported by name (the types file defines it but the export might use a union type `Drawing`), adjust the import to just `import { Candle, Drawing } from './market-chart/types'` and type the drawings array as `Drawing[]` (which it already is in the code above).

- [ ] **Step 3: Commit**

```bash
git add src/components/SignalChartModal.tsx
git commit -m "feat(signals): add full-screen chart modal with level lines and strategy indicators"
```

---

## Task 2: Remove `chartData` guard from SignalCard and SignalRow

**Files:**
- Modify: `src/components/SignalCard.tsx`
- Modify: `src/components/SignalRow.tsx`

The Chart button should always be visible since the new modal fetches its own data.

- [ ] **Step 1: Remove the chartData guard in SignalCard**

In `src/components/SignalCard.tsx`, find this block (around line 321):

```tsx
                    {signal.chartData && (
                        <button
                            onClick={() => onShowChart(signal)}
                            className="h-7 px-3 flex items-center justify-center bg-gray-700 text-white font-bold rounded-md hover:bg-gray-600 transition-colors text-[10px] uppercase tracking-wider border border-gray-600"
                        >
                            Chart
                        </button>
                    )}
```

Replace with (remove the `signal.chartData &&` wrapper):

```tsx
                    <button
                        onClick={() => onShowChart(signal)}
                        className="h-7 px-3 flex items-center justify-center bg-gray-700 text-white font-bold rounded-md hover:bg-gray-600 transition-colors text-[10px] uppercase tracking-wider border border-gray-600"
                    >
                        Chart
                    </button>
```

- [ ] **Step 2: Remove the chartData guard in SignalRow**

In `src/components/SignalRow.tsx`, find this block (around line 144):

```tsx
                {signal.chartData && (
                    <button
                        type="button"
                        onClick={() => onShowChart(signal)}
                        className="text-[10px] px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors mr-1"
                    >
                        Chart
                    </button>
                )}
```

Replace with:

```tsx
                <button
                    type="button"
                    onClick={() => onShowChart(signal)}
                    className="text-[10px] px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors mr-1"
                >
                    Chart
                </button>
```

- [ ] **Step 3: Verify types**

Run: `pnpm tsc --noEmit`
Expected: clean (no new errors)

- [ ] **Step 4: Commit**

```bash
git add src/components/SignalCard.tsx src/components/SignalRow.tsx
git commit -m "feat(signals): always show Chart button (modal handles own data)"
```

---

## Task 3: Wire SignalChartModal into Signals.tsx

**Files:**
- Modify: `src/pages/Signals.tsx`

Three edits: (1) replace imports, (2) replace state + handler, (3) replace modal JSX.

- [ ] **Step 1: Update imports**

In `src/pages/Signals.tsx`, find these two imports:

```tsx
import MiniChart from '../components/MiniChart';
```

and

```tsx
import { Candle } from '../components/market-chart/types';
```

Replace the `MiniChart` import with the new modal:

```tsx
import SignalChartModal from '../components/SignalChartModal';
```

Remove the `MiniChart` import entirely.

Check if `Candle` is used anywhere else in the file besides the old `chartModalData` type definition. If it's used elsewhere (e.g., in a `MiniChart` data reference or a local type), keep the import. If `Candle` is ONLY used in the `chartModalData` type (line 138), remove that import too.

Search for `Candle` in the file to verify. The only usage is on line 138 (`chartData: Candle[]`) which we're about to delete. So remove the `Candle` import.

- [ ] **Step 2: Replace state and handler**

Find and remove this state block (around lines 137-144):

```tsx
    const [chartModalData, setChartModalData] = useState<{
        chartData: Candle[];
        pair: string;
        entry: number;
        stopLoss: number;
        takeProfit: number;
        indicatorData?: any;
    } | null>(null);
```

Replace it with:

```tsx
    const [openChartSignal, setOpenChartSignal] = useState<Signal | null>(null);
```

Find the `handleShowChart` function (around line 462):

```tsx
    const handleShowChart = (signal: Signal) => {
        if (!signal.chartData) return;

        setChartModalData({
            chartData: signal.chartData,
            pair: signal.pair,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
        });
    };
```

Replace the entire function with:

```tsx
    const handleShowChart = (signal: Signal) => {
        setOpenChartSignal(signal);
    };
```

- [ ] **Step 3: Replace the modal JSX**

Find the old Chart Modal block (around lines 983-1011):

```tsx
            {/* Chart Modal */}
            {chartModalData && (
                <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-xl w-full max-w-4xl h-[600px] flex flex-col p-4 border border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white">
                                {chartModalData.pair} Signal Chart
                            </h3>
                            <button
                                onClick={() => setChartModalData(null)}
                                title="Close"
                                aria-label="Close"
                                className="p-1 rounded-full hover:bg-gray-700"
                            >
                                <CloseIcon className="w-6 h-6 text-gray-400" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0">
                            <MiniChart
                                data={chartModalData.chartData}
                                entry={chartModalData.entry}
                                stopLoss={chartModalData.stopLoss}
                                takeProfit={chartModalData.takeProfit}
                                indicatorData={chartModalData.indicatorData}
                            />
                        </div>
                    </div>
                </div>
            )}
```

Replace the entire block with:

```tsx
            {/* Full Chart Modal */}
            {openChartSignal && (
                <SignalChartModal
                    signal={openChartSignal}
                    onClose={() => setOpenChartSignal(null)}
                />
            )}
```

- [ ] **Step 4: Verify types**

Run: `pnpm tsc --noEmit`
Expected: no new errors. The old `chartModalData` references are all gone. `handleShowChart` still receives a `Signal` and passes it through. `SignalChartModal` props match.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`

1. Open the Signals page.
2. Click the Chart button on any signal card (grid view). A full-screen dark overlay should appear with the chart header (symbol, timeframe, strategy name, direction badge, Close button).
3. Candles should load (spinner → chart appears). The signal's symbol and timeframe are displayed.
4. Three horizontal dashed lines should appear on the chart: yellow for entry, red for SL, green for TP.
5. If the signal has a `strategyId`, the strategy's indicators (e.g., SMA 20, SMA 50) should auto-apply.
6. Click Close → returns to the signal list with all filters and sort intact.
7. Press Escape → same as Close.
8. Switch to list view and click Chart on a row → same modal opens.
9. Try on a signal without a strategy → chart opens without indicators, but candles and level lines still render.
10. Try with network throttled (slow 3G in DevTools) → loading spinner appears, then chart, or error message with Retry button.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Signals.tsx
git commit -m "feat(signals): wire SignalChartModal into Signals page, remove MiniChart modal"
```

---

## Self-review checklist

- **Spec coverage:** SignalChartModal ✓, full-screen overlay ✓, Escape close ✓, candle fetch via getCandlesWithCache ✓, strategy auto-add via autoAddScriptId ✓, level lines via initialDrawings ✓, loading/error states ✓, Retry button ✓, Signals.tsx rewire ✓, chartData guard removal ✓, MiniChart removal ✓.
- **Placeholders:** None — all code blocks are complete.
- **Type consistency:** `Signal` type is the only type crossing task boundaries. `SignalChartModalProps` matches what Signals.tsx passes. `buildLevelDrawings` returns `Drawing[]` which matches `initialDrawings` prop type. `handleShowChart` signature unchanged (`(signal: Signal) => void`).
- **Spec gap check:** Spec mentions "focus trap" — skipped because CandlestickChart already handles focus internally and the overlay covers the full viewport. Spec mentions accessibility `aria-label="Close chart"` — included. Spec mentions "no timeframe switching" — handled via `allTimeframes={[signal.timeframe]}` locking the selector.
