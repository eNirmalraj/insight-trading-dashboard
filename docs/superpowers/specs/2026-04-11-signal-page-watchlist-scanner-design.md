# Signal Page Rebuild — Watchlist-Driven Scanner

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Signal page UI + backend scanner + DB schema

---

## Problem

The current Signal page scans the top 100 Binance pairs by volume. Users have no control over which symbols get scanned. The Market page has a watchlist with user-selected symbols, but signals are not connected to it. There is also no way to assign multiple strategies to a watchlist.

## Solution

Rebuild the Signal page scanner to scan **only the user's watchlist symbols** using **strategies assigned per watchlist**. Add a watchlist filter to the Signal page UI and a button to assign strategies to watchlists.

---

## 1. Database Changes

### 1.1 Add `strategy_ids` to `watchlists` table

```sql
ALTER TABLE watchlists ADD COLUMN strategy_ids text[] DEFAULT '{}';
```

- Stores an array of strategy IDs (references `scripts.id`)
- Replaces the single `strategy_type` field for signal scanning purposes
- `strategy_type` kept for backward compatibility but no longer used by the scanner

### 1.2 Add `watchlist_id` to `signals` table

```sql
ALTER TABLE signals ADD COLUMN watchlist_id uuid REFERENCES watchlists(id) ON DELETE SET NULL;
```

- Links each generated signal back to the watchlist that triggered it
- Enables the frontend watchlist filter to query signals by watchlist
- `SET NULL` on delete so signals survive watchlist deletion

---

## 2. Frontend — Signal Page (`Signals.tsx`)

### 2.1 Watchlist Filter (new)

- Add a `FilterSelect` dropdown labeled "Watchlist" in the combined filter row (alongside Strategy, Market Type, Timeframe Filter, Search)
- Position: between Market Type and Timeframe Filter
- Options: "All" + list of user's watchlists (fetched via `api.getWatchlists()`, already loaded in state)
- When a watchlist is selected, `filteredSignals` adds a filter: only show signals where `signal.watchlist_id === selectedWatchlistId` OR where `signal.pair` is in the selected watchlist's items

### 2.2 Assign Strategies Button (new)

- Position: right side of the Signal Timeframe filter row (top filter row)
- Appearance: button with text "Assign Strategies" or icon + text
- Disabled state: grayed out when no watchlist is selected in the watchlist filter
- Click action: opens `AssignStrategiesModal`

### 2.3 State additions

```typescript
const [watchlistFilter, setWatchlistFilter] = useState<string>('All');
const [showAssignModal, setShowAssignModal] = useState(false);
```

### 2.4 Filter logic update

Add to `filteredSignals` useMemo:

```typescript
.filter((s) => {
    if (watchlistFilter === 'All') return true;
    // Filter by watchlist_id if signal has it
    if (s.watchlistId) return s.watchlistId === watchlistFilter;
    // Fallback: check if signal's symbol is in the watchlist's items
    const wl = watchlists.find(w => w.id === watchlistFilter);
    if (!wl) return true;
    return wl.items.some(item => item.symbol === s.pair);
})
```

---

## 3. AssignStrategiesModal (new component)

**File:** `src/components/AssignStrategiesModal.tsx`

### Props

```typescript
interface AssignStrategiesModalProps {
    watchlist: Watchlist;
    onClose: () => void;
    onSave: (watchlistId: string, strategyIds: string[]) => void;
}
```

### UI

- Modal overlay (same pattern as `ExecuteTradeModal`)
- Title: "Assign Strategies to {watchlist.name}"
- Body: list of all user's saved strategies (type: STRATEGY) from `scripts` table
  - Each row: checkbox + strategy name + strategy type badge
  - Pre-checked if strategy ID is already in `watchlist.strategy_ids`
- Footer: Cancel + Save buttons
- Save calls `onSave(watchlistId, selectedStrategyIds)`

### Data source

- Fetches strategies via existing `getStrategies()` from `strategyService.ts`
- Filters to scripts with `type === 'STRATEGY'`

---

## 4. Signal Type Update

### `src/types.ts` — Signal interface

Add field:

```typescript
watchlistId?: string;
```

### Signal mapping (in Signals.tsx realtime handler)

Map `newRow.watchlist_id` to `watchlistId` in the INSERT handler.

---

## 5. Watchlist Service Updates

### `src/services/watchlistService.ts`

Add to `DbWatchlist` interface:

```typescript
strategy_ids: string[] | null;
```

Add to `mapDbToWatchlist`:

```typescript
strategyIds: row.strategy_ids || [],
```

Add new function:

```typescript
export const updateWatchlistStrategies = async (
    watchlistId: string,
    strategyIds: string[]
): Promise<{ success: boolean }> => {
    const { error } = await supabase
        .from('watchlists')
        .update({ strategy_ids: strategyIds })
        .eq('id', watchlistId);
    if (error) throw new Error(error.message);
    return { success: true };
};
```

### `src/types.ts` — Watchlist interface

Add field:

```typescript
strategyIds: string[];
```

---

## 6. Backend Scanner Changes

### `backend/server/src/engine/cryptoEngine.ts`

**Current behavior:** Fetches top 100 Binance USDT pairs by volume, runs built-in strategies on all of them.

**New behavior:**

1. Fetch all watchlists from DB that have `strategy_ids` assigned (across all users; signals are user-scoped via `watchlist.user_id`)
2. Collect unique symbols from all watchlist items
3. For each watchlist:
   - Get its `strategy_ids` and resolve to script source code from `scripts` table
   - Get its symbols from `watchlist_items`
   - For each symbol + strategy combination:
     - Fetch candles (200 bars, using watchlist's `execution_timeframes`)
     - Run the Kuri strategy via `kuriAdapter`
     - If signal generated, save to `signals` table with `watchlist_id` set
4. Continue the existing candle buffering and WebSocket flow

### Signal saving

When saving a signal, include:

```typescript
watchlist_id: watchlist.id
```

### Fallback

If no watchlists exist or no strategies are assigned, skip scanning (no signals generated). This replaces the current "scan everything" approach.

---

## 7. API Layer

### `src/api.ts`

Add or ensure these exist:

```typescript
export const updateWatchlistStrategies = async (
    watchlistId: string,
    strategyIds: string[]
) => watchlistService.updateWatchlistStrategies(watchlistId, strategyIds);
```

No new API endpoints needed — all changes use existing Supabase client.

---

## 8. Files to Create

| File | Purpose |
|------|---------|
| `src/components/AssignStrategiesModal.tsx` | Modal to assign strategies to a watchlist |
| `backend/schema/XXX_add_strategy_ids_watchlist_id.sql` | DB migration |

## 9. Files to Modify

| File | Change |
|------|--------|
| `src/pages/Signals.tsx` | Add watchlist filter, assign button, watchlistFilter state, filter logic |
| `src/types.ts` | Add `strategyIds` to Watchlist, `watchlistId` to Signal |
| `src/services/watchlistService.ts` | Add `strategy_ids` mapping, `updateWatchlistStrategies()` |
| `src/api.ts` | Export `updateWatchlistStrategies` |
| `backend/server/src/engine/cryptoEngine.ts` | Scan watchlist symbols instead of top 100 |
| `backend/server/src/engine/strategyEngine.ts` | Accept strategy script source + watchlist_id for signal saving |

---

## 10. Out of Scope

- Auto-trade execution (show only for now)
- Notifications/alerts for new signals
- Forex/Indian market data integration (future phases)
- Backtesting engine
- Position state tracking in Kuri strategies
- Strategy performance metrics UI

---

## 11. User Flow

1. User goes to Market page, adds symbols to a watchlist (e.g., BTCUSDT, ETHUSDT, SOLUSDT)
2. User goes to Signal page, selects the watchlist from the new Watchlist filter dropdown
3. User clicks "Assign Strategies" button, selects strategies (e.g., RSI Divergence, SMA Cross)
4. Backend scanner picks up the watchlist config, starts scanning those symbols with those strategies
5. Signals appear on the Signal page, filtered to the selected watchlist
6. User can further filter by Status, Direction, Strategy, Timeframe, Symbol Search
7. User clicks Execute on a signal card to place a paper trade
