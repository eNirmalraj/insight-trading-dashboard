# Signal Page Grid/List Toggle — Design

**Date:** 2026-04-15
**Status:** Approved, ready for implementation plan

## Summary

Add a view mode toggle to the Signals page that switches between the existing card grid and a new compact table row view. Row view is inspired by the watchlist page aesthetic: clean table, minimal columns, with a visual P&L bar that shows how far the signal has traveled between stop loss and take profit.

This is upgrade 1 of a larger Signal Card upgrade initiative. Later upgrades (mini chart, live P&L number, strategy win-rate, progress bar on card, etc.) are tracked separately and not in scope here.

## Goals

- Let users flip between dense-scan mode (list) and detail mode (grid) without losing their filter/sort state.
- Remember the user's preferred view across sessions.
- Reuse existing data, filters, and sort logic — no backend changes.
- Keep the card grid path untouched so nothing regresses.

## Non-goals

- Mini chart embeds
- Pin toggle in list mode (defer)
- Column header click-to-sort (the existing filter bar sort control still drives ordering)
- Inline row expansion
- Any of the other info upgrades on the queue (strategy win-rate, confidence, watchlist badge, volume/volatility)

## User experience

1. User lands on the Signals page. It loads in whatever view they used last (defaults to grid).
2. In the existing filter bar (right-aligned, next to the sort and date range controls) there is a two-button segmented toggle — grid icon and list icon. Current mode is highlighted.
3. Clicking list mode replaces the 3-column card grid with a full-width table. All currently-filtered signals render as rows in the same order.
4. Clicking grid restores the card grid.
5. The chosen mode persists in `localStorage` so it's stable across reloads.
6. Clicking the row itself does nothing. Only the Chart and Execute buttons on the row are interactive.

## Components

### `useSignalViewMode` hook
**Path:** `src/hooks/useSignalViewMode.ts`

Returns `[mode, setMode]` where `mode` is `'grid' | 'list'`. Backed by `localStorage` under the key `insight.signals.viewMode`. Defaults to `'grid'` on first load or when the stored value is missing/invalid.

### `ViewModeToggle`
**Path:** `src/components/ViewModeToggle.tsx`

Segmented two-button control. Props: `{ mode: 'grid' | 'list'; onChange: (m) => void }`. Each button shows an icon (reuse grid/list icons from `IconComponents.tsx`; add them if missing). The active button uses the site's existing highlighted style (same treatment as the active tab in the filter bar).

### `SignalRow`
**Path:** `src/components/SignalRow.tsx`

Renders one `<tr>` for a single `Signal`. Props match `SignalCardProps` so the same callbacks work:

```ts
interface SignalRowProps {
    signal: Signal;
    currentPrice?: number;
    onShowChart: (signal: Signal) => void;
    onExecute: (signal: Signal) => void;
}
```

Columns (in order):

| Column | Content | Alignment |
|---|---|---|
| Symbol | `signal.pair` in bold white | left |
| TF | `signal.timeframe` in a small pill | center |
| Strategy | `signal.strategy` in gray | left |
| Dir | `BUY` in green or `SELL` in red | center |
| Entry | `signal.entry` monospace | right |
| SL | `signal.stopLoss` monospace red | right |
| TP | `signal.takeProfit` monospace green | right |
| P&L | Stacked: number on top, P&L bar below, scale labels underneath | right |
| Status | Status pill (Active / Closed / Pending) | center |
| Actions | Chart button if chart data exists, Execute button if status ≠ Closed | right |

**P&L computation:**
- If no `currentPrice` or status is Closed and there's no recorded result, display `—` and an empty bar.
- For BUY: `pctPnl = (currentPrice - entry) / entry * 100`. Bar fill ratio toward TP: `(currentPrice - entry) / (tp - entry)` clamped to `[-1, 1]`.
- For SELL: invert (price going down is profit).
- Bar is centered at 0. Positive ratio fills right in green, negative fills left in red. Width = `|ratio| * 50%` of the bar (so full TP = half the bar width, full SL = half the bar width). Scale labels under the bar: `-SL · 0 · +TP`.

**Row click:** No-op. Only the buttons inside Actions are clickable.

### `SignalTable`
**Path:** `src/components/SignalTable.tsx`

Thin wrapper. Props:

```ts
interface SignalTableProps {
    signals: Signal[];
    currentPrices: Record<string, number>;
    onShowChart: (signal: Signal) => void;
    onExecute: (signal: Signal) => void;
}
```

Renders a `<table>` with a sticky `<thead>` and maps `signals` to `<SignalRow>`. Empty state: if `signals.length === 0`, render a single row with "No signals match your filters."

### Signals page integration
**Path:** `src/pages/Signals.tsx`

1. Import `useSignalViewMode` and call it at the top of the component.
2. Import `ViewModeToggle` and render it inside the filter bar container, right-aligned (place it at the end of the existing right-side control group).
3. Where the card grid currently renders (the `filteredSignals.map(... <SignalCard ... />)` block), wrap in a conditional:
   - `viewMode === 'grid'` → existing card grid render path, unchanged
   - `viewMode === 'list'` → `<SignalTable signals={filteredSignals} currentPrices={currentPrices} onShowChart={...} onExecute={...} />`
4. The list view does not receive `onTogglePin` or `onAddToWatchlist` for v1 — out of scope.

## Data flow

No new services, no schema changes, no new API calls. Both views consume the same `signals` state, same `currentPrices` map, same `filteredSignals` memo, same sort. The only difference is the rendering layer.

## Styling

Match the existing watchlist table style. Dark background `#14141a`, header `#111116`, row hover `#18181f`, borders `#2a2a35`. Use the same tailwind tokens already used elsewhere in the app (`bg-card-bg`, `border-gray-700`, etc. — pick the closest existing ones and stay consistent). Row height ≈ 52 px to accommodate the P&L bar. Table is `w-full`, horizontally scrolls on narrow viewports.

## Accessibility

- Toggle buttons have `aria-label="Grid view"` and `aria-label="List view"`, and `aria-pressed` reflecting active mode.
- Table has a `<caption>` (visually hidden) describing "Trading signals, list view."
- Row buttons preserve keyboard focus; row itself is not focusable (since it has no click action).

## Testing

- Unit test `useSignalViewMode`: defaults to grid, persists writes, ignores garbage in localStorage.
- Unit test `SignalRow` P&L computation: BUY in profit, BUY in loss, SELL in profit, SELL in loss, no current price, closed signal.
- Manual: toggle switches correctly, both views use same filter/sort, refresh preserves mode, buttons still fire the correct handlers.

## Out of scope / future upgrades

Tracked in the larger Signal Card upgrade queue — each gets its own spec:
- Visual polish pass
- Mini chart preview in card
- Live P&L in card
- SL→Entry→TP progress bar in card
- Strategy win-rate
- Prominent time-in-trade
- Confidence / signal strength
- Watchlist source badge
- Volume / volatility at entry
