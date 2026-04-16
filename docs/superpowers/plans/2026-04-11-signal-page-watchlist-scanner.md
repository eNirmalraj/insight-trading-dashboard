# Signal Page Watchlist-Driven Scanner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Signal page to scan only the user's Market page watchlist symbols using strategies assigned per watchlist, and add a watchlist filter + assign-strategies button to the UI.

**Architecture:** Add `strategy_ids` array to watchlists and `watchlist_id` FK to signals in DB. Frontend gets a watchlist filter dropdown and an AssignStrategiesModal. Backend cryptoEngine switches from scanning top 100 Binance pairs to scanning only watchlist symbols with their assigned strategies.

**Tech Stack:** React 19, TypeScript, Supabase (PostgreSQL), Tailwind CSS, ccxt, Kuri engine

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/schema/047_watchlist_strategy_ids.sql` | Create | DB migration: add `strategy_ids` to watchlists, `watchlist_id` to signals |
| `src/types.ts` | Modify | Add `strategyIds` to Watchlist, `watchlistId` to Signal |
| `src/services/watchlistService.ts` | Modify | Map `strategy_ids`, add `updateWatchlistStrategies()` |
| `src/api.ts` | Modify | Export `updateWatchlistStrategies` |
| `src/components/AssignStrategiesModal.tsx` | Create | Modal to assign strategies to a watchlist |
| `src/pages/Signals.tsx` | Modify | Add watchlist filter, assign button, filter logic |
| `backend/server/src/services/signalStorage.ts` | Modify | Add `watchlist_id` to SignalData and insert |
| `backend/server/src/engine/cryptoEngine.ts` | Modify | Scan watchlist symbols instead of top 100 |

---

### Task 1: Database Migration

**Files:**
- Create: `backend/schema/047_watchlist_strategy_ids.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 047_watchlist_strategy_ids.sql
-- Add strategy_ids array to watchlists for multi-strategy assignment
-- Add watchlist_id FK to signals for watchlist-based filtering

-- 1. Add strategy_ids to watchlists
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS strategy_ids text[] DEFAULT '{}';

-- 2. Add watchlist_id to signals
ALTER TABLE signals ADD COLUMN IF NOT EXISTS watchlist_id uuid REFERENCES watchlists(id) ON DELETE SET NULL;

-- 3. Index for faster signal lookups by watchlist
CREATE INDEX IF NOT EXISTS idx_signals_watchlist_id ON signals(watchlist_id);
```

- [ ] **Step 2: Run the migration against Supabase**

Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor > New Query > Paste > Run).

Expected: "Success. No rows returned." for each statement.

- [ ] **Step 3: Verify columns exist**

Run in Supabase SQL Editor:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'watchlists' AND column_name = 'strategy_ids';

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'signals' AND column_name = 'watchlist_id';
```

Expected: Both queries return 1 row each.

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types.ts:31-54` (Signal interface)
- Modify: `src/types.ts:99-119` (Watchlist interface)

- [ ] **Step 1: Add `watchlistId` to Signal interface**

In `src/types.ts`, add `watchlistId` to the Signal interface after `closedAt`:

```typescript
// Add after line 51 (after closedAt?: string;)
    watchlistId?: string;
```

- [ ] **Step 2: Add `strategyIds` to Watchlist interface**

In `src/types.ts`, add `strategyIds` to the Watchlist interface after `autoLeverageEnabled`:

```typescript
// Add after line 118 (after autoLeverageEnabled?: boolean;)
    strategyIds?: string[];
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd "c:\Users\nirma\OneDrive\Desktop\My Project - Copy 1\My Project" && npx tsc --noEmit --skipLibCheck 2>&1 | head -20`

Expected: No new errors related to Signal or Watchlist types.

---

### Task 3: Update Watchlist Service

**Files:**
- Modify: `src/services/watchlistService.ts:4-26` (DbWatchlist interface)
- Modify: `src/services/watchlistService.ts:73-99` (mapDbToWatchlist)
- Modify: `src/services/watchlistService.ts:414-425` (exports)

- [ ] **Step 1: Add `strategy_ids` to `DbWatchlist` interface**

In `src/services/watchlistService.ts`, add to the `DbWatchlist` interface after `auto_leverage_enabled`:

```typescript
    strategy_ids: string[] | null;
```

- [ ] **Step 2: Map `strategy_ids` in `mapDbToWatchlist`**

In the `mapDbToWatchlist` function return object, add after `autoLeverageEnabled`:

```typescript
        strategyIds: row.strategy_ids || [],
```

- [ ] **Step 3: Add `updateWatchlistStrategies` function**

Add before the `export default` block at the bottom of the file:

```typescript
/**
 * Update assigned strategies for a watchlist
 */
export const updateWatchlistStrategies = async (
    watchlistId: string,
    strategyIds: string[]
): Promise<{ success: boolean }> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
        .from('watchlists')
        .update({ strategy_ids: strategyIds })
        .eq('id', watchlistId);

    if (error) throw new Error(error.message);

    return { success: true };
};
```

- [ ] **Step 4: Add to default export**

Add `updateWatchlistStrategies` to the default export object:

```typescript
export default {
    getWatchlists,
    createWatchlist,
    updateWatchlist,
    deleteWatchlist,
    addSymbol,
    removeSymbol,
    toggleMasterAutoTrade,
    toggleItemAutoTrade,
    toggleAutoTrade,
    updateWatchlistItemRiskSettings,
    updateWatchlistStrategies,
};
```

---

### Task 4: Update API Layer

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Add `updateWatchlistStrategies` export**

Add after the existing `updateWatchlistItemRiskSettings` export:

```typescript
export const updateWatchlistStrategies = (watchlistId: string, strategyIds: string[]) =>
    watchlistService.updateWatchlistStrategies(watchlistId, strategyIds);
```

---

### Task 5: Build AssignStrategiesModal

**Files:**
- Create: `src/components/AssignStrategiesModal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
import React, { useState, useEffect } from 'react';
import { CloseIcon } from './IconComponents';
import { Watchlist } from '../types';

interface Strategy {
    id: string;
    name: string;
    type: string;
}

interface AssignStrategiesModalProps {
    watchlist: Watchlist;
    onClose: () => void;
    onSave: (watchlistId: string, strategyIds: string[]) => void;
}

const AssignStrategiesModal: React.FC<AssignStrategiesModalProps> = ({
    watchlist,
    onClose,
    onSave,
}) => {
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        new Set(watchlist.strategyIds || [])
    );
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const loadStrategies = async () => {
            try {
                const { getStrategies } = await import('../services/strategyService');
                const all = await getStrategies();
                const strategyScripts = all
                    .filter((s: any) => s.type === 'STRATEGY')
                    .map((s: any) => ({ id: s.id, name: s.name, type: s.type }));
                setStrategies(strategyScripts);
            } catch (err) {
                console.error('Failed to load strategies:', err);
            } finally {
                setIsLoading(false);
            }
        };
        loadStrategies();
    }, []);

    const toggleStrategy = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(watchlist.id, Array.from(selectedIds));
            onClose();
        } catch (err) {
            console.error('Failed to save strategies:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <div>
                        <h3 className="text-lg font-bold text-white">Assign Strategies</h3>
                        <p className="text-sm text-gray-400 mt-0.5">{watchlist.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        title="Close"
                        aria-label="Close"
                        className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        <CloseIcon className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-4 max-h-80 overflow-y-auto">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-400">Loading strategies...</div>
                    ) : strategies.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-400">No strategies found.</p>
                            <p className="text-sm text-gray-500 mt-2">
                                Create strategies in the Strategy Studio first.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {strategies.map((strat) => (
                                <label
                                    key={strat.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                                        selectedIds.has(strat.id)
                                            ? 'bg-blue-500/10 border-blue-500/30'
                                            : 'bg-gray-700/30 border-transparent hover:bg-gray-700/50'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(strat.id)}
                                        onChange={() => toggleStrategy(strat.id)}
                                        className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-gray-700"
                                    />
                                    <span className="text-sm font-medium text-white flex-1">
                                        {strat.name}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                        Strategy
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
                    <span className="text-sm text-gray-400">
                        {selectedIds.size} selected
                    </span>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AssignStrategiesModal;
```

---

### Task 6: Update Signal Page — Add Watchlist Filter & Assign Button

**Files:**
- Modify: `src/pages/Signals.tsx`

- [ ] **Step 1: Add import for AssignStrategiesModal**

Add to the imports at the top of the file (after the ExecuteTradeModal import):

```typescript
import AssignStrategiesModal from '../components/AssignStrategiesModal';
```

- [ ] **Step 2: Add state variables**

Add after `const [symbolSearch, setSymbolSearch] = useState<string>('');` (line 124):

```typescript
    const [watchlistFilter, setWatchlistFilter] = useState<string>('All');
    const [showAssignModal, setShowAssignModal] = useState(false);
```

- [ ] **Step 3: Add watchlist filter to `filteredSignals` useMemo**

In the `filteredSignals` useMemo (around line 399), add a new `.filter()` call after the market type filter (after line 408) and before the timeframe filter:

```typescript
            .filter((s) => {
                // Watchlist filter
                if (watchlistFilter === 'All') return true;
                if ((s as any).watchlistId) return (s as any).watchlistId === watchlistFilter;
                // Fallback: check if signal's symbol is in the watchlist's items
                const wl = watchlists.find((w) => w.id === watchlistFilter);
                if (!wl) return true;
                return wl.items.some((item) => item.symbol === s.pair);
            })
```

Also add `watchlistFilter` to the useMemo dependency array.

- [ ] **Step 4: Add Watchlist FilterSelect in the combined filter row**

In the JSX, find the `{/* Combined Filter Row */}` section (around line 724). Add the Watchlist filter between Market Type and Timeframe Filter. Change the grid from `lg:grid-cols-4` to `lg:grid-cols-5`:

```tsx
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <FilterSelect
                        label="Strategy"
                        value={strategyFilter}
                        onChange={(e) => setStrategyFilter(e.target.value)}
                        options={availableStrategies}
                    />
                    <FilterSelect
                        label="Market Type"
                        value={marketTypeFilter}
                        onChange={(e) => setMarketTypeFilter(e.target.value)}
                        options={['Crypto']}
                    />
                    <FilterSelect
                        label="Watchlist"
                        value={watchlistFilter}
                        onChange={(e) => setWatchlistFilter(e.target.value)}
                        options={watchlists.map((w) => w.name)}
                    />
```

Wait — `FilterSelect` uses the option string as both value and label. But we need watchlist ID as value and name as display. Let me fix this. The `FilterSelect` component passes the option string directly. We need to map watchlist name to ID. Add a helper:

Actually, looking at the code, `FilterSelect` uses the string value directly. So let's use watchlist IDs as values and override the options rendering. The simplest approach: use watchlist ID as value, but we need the FilterSelect to show names. Since it's a simple component, let's create the watchlist dropdown manually instead:

Replace the Watchlist FilterSelect with a manual select:

```tsx
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Watchlist</label>
                        <select
                            title="Watchlist"
                            aria-label="Watchlist"
                            value={watchlistFilter}
                            onChange={(e) => setWatchlistFilter(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="All">All</option>
                            {watchlists.map((wl) => (
                                <option key={wl.id} value={wl.id}>
                                    {wl.name} ({wl.items.length})
                                </option>
                            ))}
                        </select>
                    </div>
```

- [ ] **Step 5: Add "Assign Strategies" button**

In the JSX, find the Signal Timeframe selector section (the `<div>` with label "Signal Timeframe" around line 683). Add the button to the right of that div. Wrap the timeframe div and button in a flex container:

Find the closing `</div>` of the top filter row (the `<div className="flex flex-col md:flex-row gap-6">` that contains Status, Direction, and Signal Timeframe). Before that closing `</div>`, add:

```tsx
                    {/* Assign Strategies Button */}
                    <div className="flex items-end">
                        <button
                            onClick={() => setShowAssignModal(true)}
                            disabled={watchlistFilter === 'All'}
                            title={watchlistFilter === 'All' ? 'Select a watchlist first' : 'Assign strategies to this watchlist'}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                                watchlistFilter === 'All'
                                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                    : 'bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30'
                            }`}
                        >
                            Assign Strategies
                        </button>
                    </div>
```

- [ ] **Step 6: Add `handleAssignStrategies` callback**

Add after `handleAddToWatchlist` (around line 510):

```typescript
    const handleAssignStrategies = async (watchlistId: string, strategyIds: string[]) => {
        try {
            await api.updateWatchlistStrategies(watchlistId, strategyIds);
            // Refresh watchlists to get updated strategy_ids
            const updatedWatchlists = await api.getWatchlists();
            setWatchlists(updatedWatchlists);
        } catch (err: any) {
            console.error('Failed to assign strategies:', err);
            alert(`Error: ${err.message || 'Could not assign strategies'}`);
        }
    };
```

- [ ] **Step 7: Add AssignStrategiesModal to JSX**

Add before the closing `</div>` of the return statement (before line 873), after the AddToWatchlistModal:

```tsx
            {/* Assign Strategies Modal */}
            {showAssignModal && watchlistFilter !== 'All' && (
                <AssignStrategiesModal
                    watchlist={watchlists.find((w) => w.id === watchlistFilter)!}
                    onClose={() => setShowAssignModal(false)}
                    onSave={handleAssignStrategies}
                />
            )}
```

- [ ] **Step 8: Add `watchlistId` mapping in the Supabase realtime handler**

In the INSERT handler (around line 234), add `watchlistId` to the Signal mapping:

```typescript
                            watchlistId: newRow.watchlist_id,
```

Add this after the `isPinned` line.

---

### Task 7: Update Backend Signal Storage

**Files:**
- Modify: `backend/server/src/services/signalStorage.ts:9-20` (SignalData interface)
- Modify: `backend/server/src/services/signalStorage.ts:77-94` (insert query)

- [ ] **Step 1: Add `watchlistId` to `SignalData` interface**

Add after `status: string;`:

```typescript
    watchlistId?: string;
```

- [ ] **Step 2: Add `watchlist_id` to the insert query**

In the `saveSignal` function, add to the insert object (after `activated_at`):

```typescript
                watchlist_id: signal.watchlistId || null,
```

---

### Task 8: Update Backend CryptoEngine — Watchlist-Driven Scanning

**Files:**
- Modify: `backend/server/src/engine/cryptoEngine.ts`

- [ ] **Step 1: Add Supabase import and watchlist fetching function**

Add at the top of the file, after the existing imports:

```typescript
import { supabaseAdmin } from '../services/supabaseAdmin';
import { executeKuri, Context } from '../kuri/kuriAdapter';
```

Add a new function after `fetchAllCryptoSymbols`:

```typescript
/**
 * Fetch all watchlists that have strategies assigned
 */
interface WatchlistScanConfig {
    watchlistId: string;
    userId: string;
    symbols: string[];
    strategyIds: string[];
    strategyScripts: Map<string, { id: string; name: string; source: string }>;
    timeframes: string[];
}

const fetchWatchlistScanConfigs = async (): Promise<WatchlistScanConfig[]> => {
    try {
        // 1. Get all watchlists with strategy_ids assigned
        const { data: watchlists, error: wlError } = await supabaseAdmin
            .from('watchlists')
            .select('id, user_id, strategy_ids, execution_timeframes')
            .not('strategy_ids', 'eq', '{}');

        if (wlError || !watchlists || watchlists.length === 0) {
            console.log('[CryptoEngine] No watchlists with assigned strategies found');
            return [];
        }

        // 2. Get all watchlist items (symbols)
        const watchlistIds = watchlists.map((wl: any) => wl.id);
        const { data: items, error: itemsError } = await supabaseAdmin
            .from('watchlist_items')
            .select('watchlist_id, symbol')
            .in('watchlist_id', watchlistIds);

        if (itemsError) {
            console.error('[CryptoEngine] Error fetching watchlist items:', itemsError);
            return [];
        }

        // Group items by watchlist
        const itemsByWl = new Map<string, string[]>();
        (items || []).forEach((item: any) => {
            const existing = itemsByWl.get(item.watchlist_id) || [];
            existing.push(item.symbol);
            itemsByWl.set(item.watchlist_id, existing);
        });

        // 3. Get all unique strategy IDs across all watchlists
        const allStrategyIds = new Set<string>();
        watchlists.forEach((wl: any) => {
            (wl.strategy_ids || []).forEach((id: string) => allStrategyIds.add(id));
        });

        // 4. Fetch strategy scripts
        const { data: scripts, error: scriptsError } = await supabaseAdmin
            .from('scripts')
            .select('id, name, source_code')
            .in('id', Array.from(allStrategyIds));

        if (scriptsError) {
            console.error('[CryptoEngine] Error fetching strategy scripts:', scriptsError);
            return [];
        }

        const scriptMap = new Map<string, { id: string; name: string; source: string }>();
        (scripts || []).forEach((s: any) => {
            scriptMap.set(s.id, { id: s.id, name: s.name, source: s.source_code });
        });

        // 5. Build configs
        const configs: WatchlistScanConfig[] = [];
        for (const wl of watchlists) {
            const symbols = itemsByWl.get(wl.id) || [];
            if (symbols.length === 0) continue;

            const strategyScripts = new Map<string, { id: string; name: string; source: string }>();
            (wl.strategy_ids || []).forEach((sid: string) => {
                const script = scriptMap.get(sid);
                if (script) strategyScripts.set(sid, script);
            });

            if (strategyScripts.size === 0) continue;

            configs.push({
                watchlistId: wl.id,
                userId: wl.user_id,
                symbols,
                strategyIds: wl.strategy_ids || [],
                strategyScripts,
                timeframes: wl.execution_timeframes || ['1h', '4h'],
            });
        }

        console.log(
            `[CryptoEngine] Loaded ${configs.length} watchlist scan configs (${Array.from(allStrategyIds).length} strategies)`
        );
        return configs;
    } catch (error) {
        console.error('[CryptoEngine] Error fetching watchlist configs:', error);
        return [];
    }
};
```

- [ ] **Step 2: Add watchlist-based candle processing function**

Add after `fetchWatchlistScanConfigs`:

```typescript
/**
 * Process a candle for watchlist-based strategy scanning
 */
const processWatchlistCandle = async (
    symbol: string,
    timeframe: string,
    candle: Candle,
    configs: WatchlistScanConfig[]
): Promise<void> => {
    // Find all watchlist configs that include this symbol and timeframe
    const matchingConfigs = configs.filter(
        (c) =>
            c.symbols.includes(symbol) &&
            c.timeframes.some((tf) => tf.toLowerCase() === timeframe.toLowerCase())
    );

    if (matchingConfigs.length === 0) return;

    const bufferKey = `${symbol}_${timeframe}`;
    let candles = candleBuffer.get(bufferKey) || [];
    candles.push(candle);
    if (candles.length > BUFFER_SIZE) candles = candles.slice(-BUFFER_SIZE);
    candleBuffer.set(bufferKey, candles);

    if (candles.length < 50) return;

    // Run each matching watchlist's strategies
    for (const config of matchingConfigs) {
        for (const [stratId, strat] of config.strategyScripts) {
            try {
                const context: Context = {
                    open: candles.map((c) => c.open),
                    high: candles.map((c) => c.high),
                    low: candles.map((c) => c.low),
                    close: candles.map((c) => c.close),
                    volume: candles.map((c) => c.volume),
                };

                const result = executeKuri(strat.source, context);

                for (const signal of result.signals) {
                    if (signal.type !== 'ENTRY') continue;

                    const entryPrice = candle.close;
                    const direction = signal.direction === 'SHORT' ? 'SELL' : 'BUY';

                    await saveSignal({
                        symbol,
                        strategy: strat.name,
                        strategyId: strat.id,
                        strategyCategory: 'Custom',
                        direction: direction as any,
                        entryPrice,
                        stopLoss: signal.stopLoss || result.stopLoss || null,
                        takeProfit: signal.takeProfit || result.takeProfit || null,
                        timeframe: timeframe.endsWith('m') ? timeframe : timeframe.toUpperCase(),
                        status: 'Active',
                        watchlistId: config.watchlistId,
                    });
                }
            } catch (err) {
                console.error(
                    `[CryptoEngine] Error running ${strat.name} on ${symbol}:`,
                    err
                );
            }
        }
    }
};
```

- [ ] **Step 3: Update `startCryptoEngine` to use watchlist configs**

Replace the body of `startCryptoEngine` (lines 275-319):

```typescript
export const startCryptoEngine = async (): Promise<void> => {
    console.log('[CryptoEngine] Starting Watchlist-Driven Signal Engine...');

    try {
        await loadMonitoredSignals();

        // Load watchlist scan configs
        const configs = await fetchWatchlistScanConfigs();

        if (configs.length === 0) {
            console.log('[CryptoEngine] No watchlist configs found. Engine idle — will retry in 60s.');
            // Retry periodically in case user adds watchlists/strategies later
            setTimeout(() => startCryptoEngine(), 60000);
            return;
        }

        // Collect unique symbols and timeframes across all configs
        const allSymbols = new Set<string>();
        const allTimeframes = new Set<string>();
        for (const config of configs) {
            config.symbols.forEach((s) => allSymbols.add(s));
            config.timeframes.forEach((tf) => allTimeframes.add(tf));
        }

        const symbols = Array.from(allSymbols);
        const timeframes = Array.from(allTimeframes);

        console.log(
            `[CryptoEngine] Scanning ${symbols.length} symbols on ${timeframes.length} timeframes`
        );

        // Initialize historical data buffers
        await initializeBuffers(symbols, timeframes);

        // Initialize signal monitoring
        initSignalMonitor();

        // Event-driven processing with watchlist configs
        eventBus.on(EngineEvents.CANDLE_CLOSED, async ({ symbol, timeframe, candle }) => {
            await processWatchlistCandle(symbol, timeframe, candle, configs);
        });

        // Subscribe to WebSocket streams
        await binanceStream.subscribe(symbols, timeframes);

        console.log('[CryptoEngine] Watchlist-Driven Signal Engine started');
        console.log(`[CryptoEngine] Monitoring ${symbols.length} symbols from user watchlists`);

        // Reload configs periodically (every 5 minutes) to pick up changes
        setInterval(async () => {
            try {
                const newConfigs = await fetchWatchlistScanConfigs();
                configs.length = 0;
                configs.push(...newConfigs);
                console.log(`[CryptoEngine] Reloaded ${newConfigs.length} watchlist configs`);
            } catch (err) {
                console.error('[CryptoEngine] Error reloading configs:', err);
            }
        }, 5 * 60 * 1000);
    } catch (error) {
        console.error('[CryptoEngine] Failed to start:', error);
    }
};
```

---

### Task 9: Verify & Test End-to-End

- [ ] **Step 1: Start the frontend dev server**

Run: `cd "c:\Users\nirma\OneDrive\Desktop\My Project - Copy 1\My Project" && pnpm dev`

Expected: Vite dev server starts without errors.

- [ ] **Step 2: Navigate to Signal page**

Open `http://localhost:3000/#/signals` in browser.

Verify:
- Watchlist dropdown appears in the filter row
- "Assign Strategies" button appears (grayed out when "All" is selected)
- Selecting a watchlist enables the "Assign Strategies" button
- Existing signals still display correctly

- [ ] **Step 3: Test AssignStrategiesModal**

1. Select a watchlist from the dropdown
2. Click "Assign Strategies"
3. Verify modal opens with list of saved strategies
4. Check/uncheck strategies
5. Click Save
6. Verify no errors in console

- [ ] **Step 4: Clean up temp file**

Delete the layout mockup file:

```bash
rm "c:\Users\nirma\OneDrive\Desktop\My Project - Copy 1\My Project\signal-page-layouts.html"
```

- [ ] **Step 5: Commit all changes**

```bash
git add -A
git commit -m "feat: add watchlist-driven signal scanner with strategy assignment

- Add strategy_ids array to watchlists table
- Add watchlist_id FK to signals table
- Add AssignStrategiesModal component
- Add watchlist filter dropdown to Signal page
- Add Assign Strategies button next to timeframe filter
- Update backend cryptoEngine to scan watchlist symbols only
- Update signalStorage to include watchlist_id"
```
