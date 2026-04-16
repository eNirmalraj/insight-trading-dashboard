# Signal Full-Chart Modal — Design

**Date:** 2026-04-16
**Status:** Approved, ready for implementation plan

## Summary

Replace the existing lightweight `MiniChart` modal on the Signals page with a full-screen modal that embeds the real `CandlestickChart` component. The chart auto-loads the signal's symbol, timeframe, and strategy indicators, and draws entry/SL/TP horizontal level lines. No mini chart preview inside the card itself — the card stays compact, and the full chart experience is one click away.

## Goals

- Let users inspect the full trade journey directly from the Signals page without navigating away.
- Auto-apply the strategy's indicators on the chart so users see the exact context that generated the signal.
- Draw entry/SL/TP horizontal lines on the chart for immediate visual reference.
- Preserve signal list filter/sort state (modal overlays, doesn't navigate).

## Non-goals

- Embedding a mini chart inside each signal card.
- Interactive trading from inside the chart modal.
- Saving user drawings on the signal chart.
- Timeframe switching inside the modal (locked to signal's timeframe).
- Navigating to the Market page (modal-only approach).

## User experience

1. User is on the Signals page viewing the card grid or table list.
2. User clicks the "Chart" button on any signal (grid card or list row).
3. A full-screen modal opens with a dark overlay.
4. Modal header shows: symbol (bold), timeframe pill, strategy name, and a Close button.
5. The chart body renders the real `CandlestickChart` with:
   - Historical candles fetched via `getCandlesWithCache(symbol, timeframe, 300)`.
   - The strategy auto-applied via `autoAddScriptId` so its indicators appear (e.g., SMA 20 + SMA 50 for "SMA Trend").
   - Three horizontal level lines: entry (yellow dashed), SL (red dashed), TP (green dashed).
6. A loading spinner shows while candles are fetching.
7. User can interact with the chart (zoom, scroll, hover for crosshair) but cannot add drawings or change symbol/timeframe.
8. Clicking Close (or pressing Escape) closes the modal and returns to the signal list with all filter/sort state intact.
9. The Chart button no longer bails out when `signal.chartData` is missing — the modal fetches its own data.

## Components

### `SignalChartModal`
**Path:** `src/components/SignalChartModal.tsx`

New component. Full-screen overlay modal.

```ts
interface SignalChartModalProps {
    signal: Signal;
    onClose: () => void;
}
```

**Responsibilities:**
- Render a `fixed inset-0 bg-black/90 z-50` overlay with a centered content area.
- Header bar: signal.pair (bold), signal.timeframe (pill), signal.strategy (gray), Close button.
- On mount, fetch candles via `getCandlesWithCache(signal.pair, signal.timeframe, 300)`.
- While fetching, show centered `<Loader />` spinner.
- Once candles arrive, render `<CandlestickChart>` with:
  - `data={candles}`
  - `symbol={signal.pair}`
  - `activeTimeframe={signal.timeframe}`
  - `autoAddScriptId={signal.strategyId}` (so strategy indicators auto-apply)
  - `signalLevels={{ entry: signal.entry, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit }}`
  - All navigation/toolbar props set to read-only no-ops (no symbol change, no timeframe change, no logout, no sidebar toggle).
  - `allTimeframes={[signal.timeframe]}` and `favoriteTimeframes={[signal.timeframe]}` to lock the timeframe UI.
- Listen for Escape key press to close.

### `CandlestickChart` modification
**Path:** `src/components/market-chart/CandlestickChart.tsx`

Add one optional prop:

```ts
signalLevels?: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
};
```

When present, render three horizontal lines on the chart canvas:
- **Entry** — yellow (#eab308) dashed line with a small "Entry" label at right edge.
- **Stop Loss** — red (#ef4444) dashed line with "SL" label at right edge.
- **Take Profit** — green (#22c55e) dashed line with "TP" label at right edge.

Implementation approach: inject them as ephemeral (non-saveable) drawings on mount via the existing drawing render pipeline. If the drawing system is too complex for this, fall back to an SVG overlay absolutely positioned over the chart canvas. The simpler approach that works should be chosen during implementation.

### `Signals.tsx` changes
**Path:** `src/pages/Signals.tsx`

1. Replace `chartModalData` state (which holds `{ chartData, pair, entry, stopLoss, takeProfit }`) with `openChartSignal: Signal | null`.
2. Replace `handleShowChart`:
   - Old: `if (!signal.chartData) return; setChartModalData({...})`.
   - New: `setOpenChartSignal(signal)` — no bailout, no pre-fetching.
3. Remove the `MiniChart` modal JSX block (~lines 975-1011).
4. Add: `{openChartSignal && <SignalChartModal signal={openChartSignal} onClose={() => setOpenChartSignal(null)} />}`.
5. Remove `MiniChart` import (no longer used).
6. Remove `chartModalData` type definition and related state.

### `SignalCard.tsx` change
Remove the `signal.chartData &&` guard on the Chart button — the button should always be visible since the modal now handles its own data fetching.

### `SignalRow.tsx` change
Same as above — remove the `signal.chartData &&` guard on the Chart button.

## Data flow

```
User clicks Chart
  → setOpenChartSignal(signal)
  → SignalChartModal mounts
  → useEffect: getCandlesWithCache(pair, timeframe, 300)
  → candles arrive → CandlestickChart renders
  → autoAddScriptId triggers strategy indicator load
  → signalLevels draws entry/SL/TP lines
```

No backend changes. No new API endpoints. Reuses:
- `getCandlesWithCache()` from `src/services/marketDataService.ts`
- `CandlestickChart` from `src/components/market-chart/CandlestickChart.tsx`
- `autoAddScriptId` mechanism already built into CandlestickChart

## Styling

Full-screen dark overlay. Modal takes ~95% of viewport. Header matches existing app style (dark background, border-b, same font sizes). Chart fills the remaining height. Close button top-right. Consistent with the existing chart modal aesthetic but bigger.

## Edge cases

- **Signal with no strategyId:** Chart still opens, just no auto-added indicators. Candles + level lines still render.
- **Fetch failure:** Show error message in the modal body ("Failed to load chart data") with a Retry button.
- **Escape key while loading:** Modal closes, useEffect cleanup cancels pending state updates.
- **Very small viewports (mobile):** Modal takes `inset-0` full screen. CandlestickChart should handle its own responsive behavior (it already does on the Market page).

## Accessibility

- Modal traps focus while open.
- Escape key closes the modal.
- Close button has `aria-label="Close chart"`.
- Chart canvas inherits CandlestickChart's existing accessibility behavior.

## Testing

- Manual: click Chart on a signal card → modal opens with correct symbol/timeframe, candles render, strategy indicators auto-apply, level lines visible. Click Close → returns to signals. Press Escape → same. Try in both grid and list views. Try with Active and Closed signals.
- Verify the Chart button now always appears (no more chartData guard).
- Verify the old MiniChart modal code is fully removed.

## Out of scope / future upgrades

- Side panel layout (C option from brainstorming)
- Navigate to Market page (B option from brainstorming)
- Trade execution from inside the chart
- Embedded mini chart preview in the card
- Drawing persistence on signal charts
