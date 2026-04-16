# Signal View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a grid/list view toggle to the Signals page so users can flip between the existing card view and a compact table row view with a visual P&L bar.

**Architecture:** Pure frontend change. A `useSignalViewMode` hook persists the preference in `localStorage`. A `ViewModeToggle` button sits in the existing Signals filter bar. A new `SignalTable` + `SignalRow` pair renders the same `filteredSignals` array as a `<table>` when the mode is `'list'`. The existing card grid branch is untouched.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, existing `Signal` type, existing `IconComponents` (`ViewGridIcon`, `ViewListIcon` already exist).

Spec: [docs/superpowers/specs/2026-04-15-signal-view-toggle-design.md](../specs/2026-04-15-signal-view-toggle-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/hooks/useSignalViewMode.ts` | Create | Hook — persist `'grid' \| 'list'` preference to `localStorage` |
| `src/components/ViewModeToggle.tsx` | Create | Two-button segmented control (grid icon / list icon) |
| `src/components/SignalRow.tsx` | Create | One `<tr>` — all columns including stacked P&L cell with bar |
| `src/components/SignalTable.tsx` | Create | Wrapper — `<table>` with `<thead>` + maps `signals[]` to `<SignalRow>` |
| `src/pages/Signals.tsx` | Modify | Call hook, render toggle in filter bar, branch grid vs table in render |

No test framework appears wired up in the frontend for components (spec mentions unit tests but there's no `*.test.tsx` infrastructure in `src/` currently). Tests for this plan are **manual verification steps only** — if the user adds a test harness later these components are pure enough to unit-test easily. This is called out so the engineer doesn't waste time searching for a Jest/Vitest runner.

---

## Task 1: Create `useSignalViewMode` hook

**Files:**
- Create: `src/hooks/useSignalViewMode.ts`

- [ ] **Step 1: Create the hook file**

```ts
// src/hooks/useSignalViewMode.ts
import { useCallback, useEffect, useState } from 'react';

export type SignalViewMode = 'grid' | 'list';

const STORAGE_KEY = 'insight.signals.viewMode';
const DEFAULT_MODE: SignalViewMode = 'grid';

function readStoredMode(): SignalViewMode {
    if (typeof window === 'undefined') return DEFAULT_MODE;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === 'grid' || raw === 'list') return raw;
    } catch {
        // localStorage disabled (private mode, quota, etc.) — fall through
    }
    return DEFAULT_MODE;
}

export function useSignalViewMode(): [SignalViewMode, (m: SignalViewMode) => void] {
    const [mode, setModeState] = useState<SignalViewMode>(() => readStoredMode());

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            // ignore write failures
        }
    }, [mode]);

    const setMode = useCallback((next: SignalViewMode) => {
        setModeState(next);
    }, []);

    return [mode, setMode];
}
```

- [ ] **Step 2: Manually verify**

Open the Signals page in the dev server (after Task 5 is complete — this hook isn't wired up yet). Toggle the mode, reload the page, verify the mode sticks. For this task alone, just `pnpm tsc --noEmit` (or whatever typecheck command the project uses) to confirm no type errors.

Run: `pnpm tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSignalViewMode.ts
git commit -m "feat(signals): add useSignalViewMode hook with localStorage persistence"
```

---

## Task 2: Create `ViewModeToggle` component

**Files:**
- Create: `src/components/ViewModeToggle.tsx`

Confirmed: `ViewGridIcon` and `ViewListIcon` are already exported from `src/components/IconComponents.tsx`.

- [ ] **Step 1: Create the component**

```tsx
// src/components/ViewModeToggle.tsx
import React from 'react';
import { ViewGridIcon, ViewListIcon } from './IconComponents';
import type { SignalViewMode } from '../hooks/useSignalViewMode';

interface ViewModeToggleProps {
    mode: SignalViewMode;
    onChange: (mode: SignalViewMode) => void;
}

const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ mode, onChange }) => {
    const baseBtn =
        'flex items-center justify-center h-9 w-9 transition-colors focus:outline-none';
    const active = 'bg-blue-500 text-white';
    const inactive = 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200';

    return (
        <div
            role="group"
            aria-label="Signal view mode"
            className="inline-flex rounded-lg border border-gray-700 overflow-hidden"
        >
            <button
                type="button"
                onClick={() => onChange('grid')}
                aria-label="Grid view"
                aria-pressed={mode === 'grid'}
                title="Grid view"
                className={`${baseBtn} ${mode === 'grid' ? active : inactive} border-r border-gray-700`}
            >
                <ViewGridIcon className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => onChange('list')}
                aria-label="List view"
                aria-pressed={mode === 'list'}
                title="List view"
                className={`${baseBtn} ${mode === 'list' ? active : inactive}`}
            >
                <ViewListIcon className="w-4 h-4" />
            </button>
        </div>
    );
};

export default ViewModeToggle;
```

- [ ] **Step 2: Verify types**

Run: `pnpm tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/components/ViewModeToggle.tsx
git commit -m "feat(signals): add ViewModeToggle segmented control"
```

---

## Task 3: Create `SignalRow` component

**Files:**
- Create: `src/components/SignalRow.tsx`

This is the most detailed task because the P&L bar has direction-aware logic. Read carefully.

- [ ] **Step 1: Create the component**

```tsx
// src/components/SignalRow.tsx
import React from 'react';
import { Signal, SignalStatus, TradeDirection } from '../types';

interface SignalRowProps {
    signal: Signal;
    currentPrice?: number;
    onShowChart: (signal: Signal) => void;
    onExecute: (signal: Signal) => void;
}

const formatPrice = (price: number | undefined | null): string => {
    if (price === undefined || price === null || Number.isNaN(price)) return '—';
    if (price === 0) return '0.00';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface PnlInfo {
    pct: number | null; // percent, signed. null = no data
    ratio: number; // -1..1, sign indicates direction (+ toward TP, - toward SL)
}

function computePnl(signal: Signal, currentPrice: number | undefined): PnlInfo {
    const isBuy = signal.direction === TradeDirection.BUY;
    const entry = signal.entry;

    // Closed signals: use stored profitLoss if available
    if (signal.status === SignalStatus.CLOSED) {
        const stored = (signal as any).profitLoss ?? (signal as any).profit_loss;
        if (typeof stored === 'number' && !Number.isNaN(stored)) {
            const pct = stored;
            // For closed: ratio based on final pct relative to entry→TP / entry→SL targets
            const tpPct = isBuy
                ? ((signal.takeProfit - entry) / entry) * 100
                : ((entry - signal.takeProfit) / entry) * 100;
            const slPct = isBuy
                ? ((entry - signal.stopLoss) / entry) * 100
                : ((signal.stopLoss - entry) / entry) * 100;
            const denom = pct >= 0 ? tpPct : slPct;
            const ratio = denom > 0 ? Math.max(-1, Math.min(1, pct / denom)) : 0;
            return { pct, ratio };
        }
        return { pct: null, ratio: 0 };
    }

    // Active/Pending: need live price
    if (currentPrice === undefined || currentPrice === null || Number.isNaN(currentPrice)) {
        return { pct: null, ratio: 0 };
    }

    const pct = isBuy
        ? ((currentPrice - entry) / entry) * 100
        : ((entry - currentPrice) / entry) * 100;

    // Ratio: fraction of distance to TP (positive) or SL (negative)
    let ratio = 0;
    if (pct >= 0) {
        const tpDistance = Math.abs(signal.takeProfit - entry);
        const priceDistance = Math.abs(currentPrice - entry);
        ratio = tpDistance > 0 ? Math.min(1, priceDistance / tpDistance) : 0;
    } else {
        const slDistance = Math.abs(signal.stopLoss - entry);
        const priceDistance = Math.abs(currentPrice - entry);
        ratio = slDistance > 0 ? -Math.min(1, priceDistance / slDistance) : 0;
    }

    return { pct, ratio };
}

const SignalRow: React.FC<SignalRowProps> = ({ signal, currentPrice, onShowChart, onExecute }) => {
    const isBuy = signal.direction === TradeDirection.BUY;
    const { pct, ratio } = computePnl(signal, currentPrice);

    const pnlNumberClass =
        pct === null
            ? 'text-gray-500'
            : pct >= 0
              ? 'text-green-400'
              : 'text-red-400';
    const pnlLabel = pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

    // Bar fill width = |ratio| * 50% of the bar (so full TP = half width, full SL = half width)
    const fillWidthPct = Math.abs(ratio) * 50;
    const fillIsProfit = ratio >= 0;

    const statusClasses: Record<string, string> = {
        [SignalStatus.ACTIVE]: 'bg-gray-700/50 text-gray-200 border-gray-600',
        [SignalStatus.CLOSED]: 'bg-gray-800 text-gray-500 border-gray-700',
        [SignalStatus.PENDING]: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    };

    return (
        <tr className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
            {/* Symbol */}
            <td className="px-3 py-3 font-bold text-white text-sm whitespace-nowrap">
                {signal.pair}
            </td>

            {/* Timeframe */}
            <td className="px-3 py-3 text-center">
                <span className="inline-block text-[10px] text-gray-400 bg-gray-800 border border-gray-700 rounded px-2 py-0.5">
                    {signal.timeframe}
                </span>
            </td>

            {/* Strategy */}
            <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">
                {signal.strategy || '—'}
            </td>

            {/* Direction */}
            <td className="px-3 py-3 text-center">
                <span className={`text-xs font-bold ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                    {signal.direction}
                </span>
            </td>

            {/* Entry */}
            <td className="px-3 py-3 text-right font-mono text-xs text-white whitespace-nowrap">
                {formatPrice(signal.entry)}
            </td>

            {/* SL */}
            <td className="px-3 py-3 text-right font-mono text-xs text-red-400 whitespace-nowrap">
                {formatPrice(signal.stopLoss)}
            </td>

            {/* TP */}
            <td className="px-3 py-3 text-right font-mono text-xs text-green-400 whitespace-nowrap">
                {formatPrice(signal.takeProfit)}
            </td>

            {/* P&L cell with visual bar */}
            <td className="px-3 py-3 min-w-[180px]">
                <div className="flex flex-col gap-1">
                    <div className={`text-right font-mono text-sm font-bold ${pnlNumberClass}`}>
                        {pnlLabel}
                    </div>
                    <div className="relative h-1.5 bg-gray-800 rounded-full">
                        {/* center tick */}
                        <div className="absolute left-1/2 top-[-2px] w-px h-[10px] bg-gray-500" />
                        {/* fill */}
                        {pct !== null && (
                            <div
                                className={`absolute top-0 h-full rounded-full ${fillIsProfit ? 'bg-gradient-to-r from-green-600 to-green-400' : 'bg-gradient-to-l from-red-600 to-red-400'}`}
                                style={
                                    fillIsProfit
                                        ? { left: '50%', width: `${fillWidthPct}%` }
                                        : { right: '50%', width: `${fillWidthPct}%` }
                                }
                            />
                        )}
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                        <span className="text-red-500">-SL</span>
                        <span>0</span>
                        <span className="text-green-500">+TP</span>
                    </div>
                </div>
            </td>

            {/* Status */}
            <td className="px-3 py-3 text-center">
                <span
                    className={`inline-block text-[9px] font-bold uppercase tracking-wide rounded border px-2 py-0.5 ${statusClasses[signal.status] ?? 'bg-gray-800 border-gray-700 text-gray-400'}`}
                >
                    {signal.status}
                </span>
            </td>

            {/* Actions */}
            <td className="px-3 py-3 text-right whitespace-nowrap">
                {signal.chartData && (
                    <button
                        type="button"
                        onClick={() => onShowChart(signal)}
                        className="text-[10px] px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors mr-1"
                    >
                        Chart
                    </button>
                )}
                {signal.status !== SignalStatus.CLOSED && (
                    <button
                        type="button"
                        onClick={() => onExecute(signal)}
                        className={`text-[10px] px-3 py-1.5 rounded-md font-bold transition-colors ${
                            isBuy
                                ? 'bg-green-600/20 text-green-400 border border-green-500/40 hover:bg-green-600/30'
                                : 'bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600/30'
                        }`}
                    >
                        Execute
                    </button>
                )}
            </td>
        </tr>
    );
};

export default SignalRow;
```

- [ ] **Step 2: Verify types**

Run: `pnpm tsc --noEmit`
Expected: clean. If the compiler complains about `profitLoss` / `profit_loss` access, the `as any` cast in `computePnl` should silence it — that mirrors the exact pattern used in `Signals.tsx:586`.

- [ ] **Step 3: Commit**

```bash
git add src/components/SignalRow.tsx
git commit -m "feat(signals): add SignalRow with direction-aware P&L bar"
```

---

## Task 4: Create `SignalTable` wrapper

**Files:**
- Create: `src/components/SignalTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/SignalTable.tsx
import React from 'react';
import { Signal } from '../types';
import SignalRow from './SignalRow';

interface SignalTableProps {
    signals: Signal[];
    currentPrices: Record<string, number>;
    onShowChart: (signal: Signal) => void;
    onExecute: (signal: Signal) => void;
}

const SignalTable: React.FC<SignalTableProps> = ({
    signals,
    currentPrices,
    onShowChart,
    onExecute,
}) => {
    if (signals.length === 0) {
        return (
            <div className="bg-card-bg rounded-xl border border-gray-700 p-8 text-center">
                <p className="text-gray-400 text-sm">No signals match your filters.</p>
            </div>
        );
    }

    return (
        <div className="bg-card-bg rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <caption className="sr-only">Trading signals, list view</caption>
                    <thead className="bg-gray-900/60 border-b border-gray-700">
                        <tr>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                                Symbol
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-center">
                                TF
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                                Strategy
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-center">
                                Dir
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                Entry
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                SL
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                TP
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                P&amp;L
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-center">
                                Status
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {signals.map((signal) => (
                            <SignalRow
                                key={signal.id}
                                signal={signal}
                                currentPrice={currentPrices[signal.pair]}
                                onShowChart={onShowChart}
                                onExecute={onExecute}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SignalTable;
```

- [ ] **Step 2: Verify types**

Run: `pnpm tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/components/SignalTable.tsx
git commit -m "feat(signals): add SignalTable wrapper for list view"
```

---

## Task 5: Wire it into `Signals.tsx`

**Files:**
- Modify: `src/pages/Signals.tsx`

Three edits: (1) imports, (2) hook call + toggle in filter bar, (3) branch in the render function.

- [ ] **Step 1: Add imports**

At the top of `src/pages/Signals.tsx`, near the existing `import SignalCard from '../components/SignalCard';` line (around line 5):

```tsx
import SignalCard from '../components/SignalCard';
import SignalTable from '../components/SignalTable';
import ViewModeToggle from '../components/ViewModeToggle';
import { useSignalViewMode } from '../hooks/useSignalViewMode';
```

- [ ] **Step 2: Call the hook**

Inside the `Signals` component, alongside the other `useState` calls (near `const [sortMode, setSortMode] = useState<SortMode>('newest');` around line 124), add:

```tsx
const [viewMode, setViewMode] = useSignalViewMode();
```

- [ ] **Step 3: Branch the render function**

Locate the grid render block (around line 548–563) that currently reads:

```tsx
return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredSignals.map((signal) => (
            <SignalCard
                key={signal.id}
                signal={signal}
                onShowChart={handleShowChart}
                onExecute={setExecutingSignal}
                onAddToWatchlist={setAddToWatchlistPair}
                isAddedToWatchlist={addedToWatchlistPairs.has(signal.pair)}
                currentPrice={currentPrices[signal.pair]}
                onTogglePin={handleTogglePin}
            />
        ))}
    </div>
);
```

Replace with:

```tsx
if (viewMode === 'list') {
    return (
        <SignalTable
            signals={filteredSignals}
            currentPrices={currentPrices}
            onShowChart={handleShowChart}
            onExecute={setExecutingSignal}
        />
    );
}

return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredSignals.map((signal) => (
            <SignalCard
                key={signal.id}
                signal={signal}
                onShowChart={handleShowChart}
                onExecute={setExecutingSignal}
                onAddToWatchlist={setAddToWatchlistPair}
                isAddedToWatchlist={addedToWatchlistPairs.has(signal.pair)}
                currentPrice={currentPrices[signal.pair]}
                onTogglePin={handleTogglePin}
            />
        ))}
    </div>
);
```

- [ ] **Step 4: Add the toggle to the filter bar**

Find the "Sort + Date Range row" block (the `<div className="mt-4 flex flex-wrap items-end gap-4">` starting around line 880). The toggle goes at the end of that row, right-aligned. Add a new flex child after the last existing control:

```tsx
{/* View mode toggle — right aligned */}
<div className="flex-shrink-0 ml-auto">
    <label className="block text-xs text-gray-400 mb-1">View</label>
    <ViewModeToggle mode={viewMode} onChange={setViewMode} />
</div>
```

The `ml-auto` on the outer div pushes it to the right edge within the flex row. Don't remove any existing controls — just append this one.

- [ ] **Step 5: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean

- [ ] **Step 6: Manual verification in browser**

Run: `pnpm dev`

1. Open the Signals page.
2. The toggle should appear at the right edge of the sort/date-range row with grid selected.
3. Click the list icon — the card grid should disappear and a table should render with the same signals in the same order.
4. Confirm the columns match: Symbol, TF, Strategy, Dir, Entry, SL, TP, P&L, Status, Actions.
5. For an Active signal with a live price, confirm the P&L number updates and the visual bar shifts. Bar fills from center → right (green) when in profit, center → left (red) when in loss.
6. Click the list mode Chart button → chart modal opens.
7. Click Execute on a BUY signal → execute modal opens.
8. Switch back to grid — card view reappears intact.
9. Reload the page → the last chosen mode persists.
10. Try filtering / sorting in list mode — rows should respect the same filters/sort as grid mode.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Signals.tsx
git commit -m "feat(signals): wire grid/list view toggle into Signals page"
```

---

## Self-review checklist (already run)

- **Spec coverage:** Hook ✓, toggle ✓, SignalRow with all 10 columns ✓, P&L bar direction-aware ✓, SignalTable empty state ✓, Signals.tsx integration ✓, filter bar placement ✓, row click no-op ✓, pin/add-to-watchlist intentionally skipped ✓.
- **Placeholders:** None — every code block is complete and runnable.
- **Type consistency:** `SignalViewMode` defined once in Task 1, imported by Task 2 and Task 5. `SignalRowProps` / `SignalTableProps` consistent. Callback signatures match existing `Signals.tsx` handlers (`handleShowChart`, `setExecutingSignal`).
- **Known edge:** P&L `ratio` calc assumes `stopLoss` and `takeProfit` are on opposite sides of `entry` (which the backend risk calculator enforces). If both are zero or missing, the bar renders empty — handled.
