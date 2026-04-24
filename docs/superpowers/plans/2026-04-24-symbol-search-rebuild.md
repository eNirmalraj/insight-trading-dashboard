# Symbol Search UX Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `SymbolSearchModal.tsx` with TradingView-inspired row layout, keyboard navigation, Supabase-persisted favorites, real coin icons, smarter Enter handling, and Coming-soon empty states — without expanding data sources.

**Architecture:** Centered draggable modal pattern preserved. Five supporting files added (CoinAvatar, tags helper, static category map, favoritesService, FavoritesContext). One Supabase migration. Modal internals rebuilt against these new primitives. Three existing call sites (`ChartHeader`, `MyScripts`, `SidePanels`) keep their existing prop contract.

**Tech Stack:** React 19 + TypeScript, Vite, Supabase (PostgreSQL + RLS), Tailwind CSS. No test runner in frontend — verification via `pnpm build` + manual QA (consistent with prior sub-projects).

**Spec:** [docs/superpowers/specs/2026-04-24-symbol-search-rebuild-design.md](../specs/2026-04-24-symbol-search-rebuild-design.md)

---

## File Structure

**Modify:**
- `src/components/market-chart/SymbolSearchModal.tsx` — full rebuild (~515 → ~650 lines). Touched across Tasks 3, 4, 5, 6.
- `src/components/market-chart/ChartHeader.tsx` — add `Ctrl/⌘+K` global listener (Task 5).
- `src/pages/Market.tsx` — wrap with `<FavoritesProvider>` (Task 1).

**Create:**
- `backend/schema/071_user_favorite_symbols.sql` — Supabase migration (Task 1)
- `src/services/favoritesService.ts` — Supabase CRUD (Task 1)
- `src/contexts/FavoritesContext.tsx` — React context + provider + hook (Task 1)
- `src/components/market-chart/CoinAvatar.tsx` — CDN icon + text-avatar fallback (Task 2)
- `src/data/symbolCategories.ts` — base-asset → category tag static map (Task 2)
- `src/components/market-chart/symbolSearchTags.ts` — `deriveTags()` pure helper (Task 2)

**Unchanged:**
- `src/services/marketDataService.ts` (`fetchAllCryptoSymbols` shape preserved)
- `src/pages/My Scripts.tsx`, `src/components/market-chart/SidePanels.tsx` (modal prop contract preserved — existing `existingSymbols` behavior reworked internally in Task 4)

---

## Task 1: Schema + favoritesService + FavoritesContext

**Files:**
- Create: `backend/schema/071_user_favorite_symbols.sql`
- Create: `src/services/favoritesService.ts`
- Create: `src/contexts/FavoritesContext.tsx`
- Modify: `src/pages/Market.tsx`

### - [ ] Step 1.1: Write Supabase migration

Create `backend/schema/071_user_favorite_symbols.sql`:

```sql
-- 071_user_favorite_symbols.sql
-- User-scoped favorite symbols for the Symbol Search modal.

create table public.user_favorite_symbols (
    user_id uuid references auth.users(id) on delete cascade,
    symbol text not null,
    added_at timestamptz default now() not null,
    primary key (user_id, symbol)
);

alter table public.user_favorite_symbols enable row level security;

create policy "users manage own favorites"
    on public.user_favorite_symbols
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index user_favorite_symbols_user_idx
    on public.user_favorite_symbols (user_id);
```

Apply via the project's existing migration flow. The engineer is expected to know whether to run this via the Supabase CLI (`supabase db push`) or the Supabase dashboard SQL editor — match how recent migrations (e.g. `070_remove_binance_broker.sql`) were applied in this project.

### - [ ] Step 1.2: Create `favoritesService.ts`

Create `src/services/favoritesService.ts`:

```ts
// src/services/favoritesService.ts
import { db, isSupabaseConfigured } from './supabaseClient';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// In-memory mock storage
let mockFavorites = new Set<string>();

export const loadFavorites = async (): Promise<string[]> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        return Promise.resolve(Array.from(mockFavorites));
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return [];

        const { data, error } = await db()
            .from('user_favorite_symbols')
            .select('symbol')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error loading favorites:', error);
            return [];
        }

        return (data ?? []).map((row) => row.symbol);
    } catch (error) {
        console.error('Failed to load favorites:', error);
        return [];
    }
};

export const addFavorite = async (symbol: string): Promise<void> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        mockFavorites.add(symbol);
        return;
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return;

        const { error } = await db()
            .from('user_favorite_symbols')
            .upsert({ user_id: user.id, symbol });

        if (error) throw error;
    } catch (error) {
        console.error('Error adding favorite:', error);
        throw error;
    }
};

export const removeFavorite = async (symbol: string): Promise<void> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        mockFavorites.delete(symbol);
        return;
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return;

        const { error } = await db()
            .from('user_favorite_symbols')
            .delete()
            .eq('user_id', user.id)
            .eq('symbol', symbol);

        if (error) throw error;
    } catch (error) {
        console.error('Error removing favorite:', error);
        throw error;
    }
};
```

### - [ ] Step 1.3: Create `FavoritesContext.tsx`

Create `src/contexts/FavoritesContext.tsx`:

```tsx
// src/contexts/FavoritesContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { loadFavorites, addFavorite, removeFavorite } from '../services/favoritesService';

interface FavoritesContextValue {
    favorites: Set<string>;
    isFavorite: (symbol: string) => boolean;
    toggleFavorite: (symbol: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [favorites, setFavorites] = useState<Set<string>>(new Set());

    useEffect(() => {
        let cancelled = false;
        loadFavorites().then((list) => {
            if (!cancelled) setFavorites(new Set(list));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const isFavorite = useCallback((symbol: string) => favorites.has(symbol), [favorites]);

    const toggleFavorite = useCallback(
        async (symbol: string) => {
            const wasFav = favorites.has(symbol);

            // Optimistic update
            setFavorites((prev) => {
                const next = new Set(prev);
                if (wasFav) next.delete(symbol);
                else next.add(symbol);
                return next;
            });

            try {
                if (wasFav) {
                    await removeFavorite(symbol);
                } else {
                    await addFavorite(symbol);
                }
            } catch (error) {
                // Revert on failure
                setFavorites((prev) => {
                    const next = new Set(prev);
                    if (wasFav) next.add(symbol);
                    else next.delete(symbol);
                    return next;
                });
                console.error('Toggle favorite failed:', error);
            }
        },
        [favorites]
    );

    return (
        <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite }}>
            {children}
        </FavoritesContext.Provider>
    );
};

export const useFavorites = (): FavoritesContextValue => {
    const ctx = useContext(FavoritesContext);
    if (!ctx) {
        throw new Error('useFavorites must be used within FavoritesProvider');
    }
    return ctx;
};
```

### - [ ] Step 1.4: Wrap Market page with `<FavoritesProvider>`

Open `src/pages/Market.tsx`. Find the top-level JSX returned by the `Market` component (search for the outermost `<div` or fragment after `return (`). Add the import at the top:

```ts
import { FavoritesProvider } from '../contexts/FavoritesContext';
```

Wrap the entire returned JSX with `<FavoritesProvider>…</FavoritesProvider>`. For example, if the return currently looks like:

```tsx
return (
    <div className="h-full flex flex-col">
        { /* ... */ }
    </div>
);
```

Change it to:

```tsx
return (
    <FavoritesProvider>
        <div className="h-full flex flex-col">
            { /* ... */ }
        </div>
    </FavoritesProvider>
);
```

### - [ ] Step 1.5: Build verification

Run: `pnpm build 2>&1 | tail -10`

Expected: `✓ built in <N>s` with zero TypeScript errors. Chunk-size warnings are pre-existing and acceptable.

### - [ ] Step 1.6: Git status check — exactly 4 files

Run: `git status --short`

Expected:
```
 M src/pages/Market.tsx
?? backend/schema/071_user_favorite_symbols.sql
?? src/services/favoritesService.ts
?? src/contexts/FavoritesContext.tsx
```

**CRITICAL:** If any other file is modified (OneDrive-sync drift has caused this in prior sessions), STOP. Do NOT `git add` unrelated files — they are not part of this task.

### - [ ] Step 1.7: Commit

```bash
git add backend/schema/071_user_favorite_symbols.sql src/services/favoritesService.ts src/contexts/FavoritesContext.tsx src/pages/Market.tsx
git commit -m "feat(symbol-search): add user favorite symbols persistence

Supabase table user_favorite_symbols with RLS. Service module
favoritesService exposes loadFavorites / addFavorite / removeFavorite.
FavoritesProvider wraps the Market page and exposes useFavorites() hook
with optimistic toggle + revert-on-error. No UI integration yet — modal
changes come in later tasks."
```

---

## Task 2: CoinAvatar + tags helper + category map

**Files:**
- Create: `src/data/symbolCategories.ts`
- Create: `src/components/market-chart/symbolSearchTags.ts`
- Create: `src/components/market-chart/CoinAvatar.tsx`

### - [ ] Step 2.1: Create `symbolCategories.ts`

Create `src/data/symbolCategories.ts`:

```ts
// src/data/symbolCategories.ts
// Base-asset → category tag map for the Symbol Search modal. Curated; edit freely.
// Key is the uppercase base asset (e.g. "BTC", "ETH"). Value is a single lowercase tag.

export const SYMBOL_CATEGORIES: Record<string, string> = {
    // Layer-1 blockchains
    BTC: 'layer1',
    ETH: 'layer1',
    SOL: 'layer1',
    AVAX: 'layer1',
    ADA: 'layer1',
    DOT: 'layer1',
    ATOM: 'layer1',
    NEAR: 'layer1',
    APT: 'layer1',
    SUI: 'layer1',
    TON: 'layer1',
    TRX: 'layer1',

    // DeFi blue chips
    UNI: 'defi',
    AAVE: 'defi',
    MKR: 'defi',
    COMP: 'defi',
    CRV: 'defi',
    SNX: 'defi',
    LDO: 'defi',

    // Stablecoins
    USDT: 'stablecoin',
    USDC: 'stablecoin',
    DAI: 'stablecoin',
    BUSD: 'stablecoin',
    TUSD: 'stablecoin',
    FDUSD: 'stablecoin',

    // Memes
    DOGE: 'meme',
    SHIB: 'meme',
    PEPE: 'meme',
    WIF: 'meme',
    BONK: 'meme',
    FLOKI: 'meme',

    // Layer-2 / scaling
    MATIC: 'layer2',
    ARB: 'layer2',
    OP: 'layer2',
    IMX: 'layer2',
    STRK: 'layer2',
};
```

### - [ ] Step 2.2: Create `symbolSearchTags.ts`

Create `src/components/market-chart/symbolSearchTags.ts`:

```ts
// src/components/market-chart/symbolSearchTags.ts
import { SYMBOL_CATEGORIES } from '../../data/symbolCategories';

/**
 * Extract the base asset from a Binance symbol.
 * BTCUSDT    -> BTC
 * BTCUSDT.P  -> BTC
 * ETHBTC     -> ETH
 * ETH/USDT   -> ETH
 * Falls back to the whole symbol if no known quote is detected.
 */
export const extractBaseAsset = (symbol: string): string => {
    const cleaned = symbol.replace('/', '').replace('.P', '').toUpperCase();
    const quotes = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'BTC', 'ETH', 'BNB'];
    for (const q of quotes) {
        if (cleaned.endsWith(q) && cleaned.length > q.length) {
            return cleaned.slice(0, -q.length);
        }
    }
    return cleaned;
};

/**
 * Derive display tags for a symbol row in the Symbol Search modal.
 * Always returns at least one tag ("spot" or "perp", and "crypto").
 * Adds a category tag if the base asset is in SYMBOL_CATEGORIES.
 */
export const deriveTags = (symbol: string): string[] => {
    const tags: string[] = [];
    tags.push(symbol.endsWith('.P') ? 'perp' : 'spot');
    tags.push('crypto');

    const base = extractBaseAsset(symbol);
    const category = SYMBOL_CATEGORIES[base];
    if (category) tags.push(category);

    return tags;
};
```

### - [ ] Step 2.3: Create `CoinAvatar.tsx`

Create `src/components/market-chart/CoinAvatar.tsx`:

```tsx
// src/components/market-chart/CoinAvatar.tsx
import React, { useState } from 'react';
import { extractBaseAsset } from './symbolSearchTags';

interface CoinAvatarProps {
    symbol: string;
    size?: number;
}

/**
 * Deterministic hue from a string (0–360). Same input always yields same hue.
 */
const hueFromString = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) % 360;
    }
    return h;
};

/**
 * Coin icon: CDN SVG with deterministic-color text fallback on load error.
 */
const CoinAvatar: React.FC<CoinAvatarProps> = ({ symbol, size = 32 }) => {
    const [errored, setErrored] = useState(false);
    const base = extractBaseAsset(symbol);
    const cdnUrl = `https://cryptoicon-api.pages.dev/api/icon/${base.toLowerCase()}`;

    if (errored) {
        const hue = hueFromString(base);
        const gradient = `linear-gradient(135deg, hsl(${hue}, 65%, 55%), hsl(${(hue + 40) % 360}, 70%, 40%))`;
        const label = base.slice(0, 4);
        const fontSize = Math.max(9, Math.floor(size * 0.32));
        return (
            <div
                style={{
                    width: size,
                    height: size,
                    background: gradient,
                    fontSize,
                }}
                className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
                aria-label={`${base} avatar`}
            >
                {label}
            </div>
        );
    }

    return (
        <img
            src={cdnUrl}
            alt={base}
            width={size}
            height={size}
            onError={() => setErrored(true)}
            className="rounded-full flex-shrink-0"
            loading="lazy"
        />
    );
};

export default CoinAvatar;
```

**Note on CDN choice:** If `cryptoicon-api.pages.dev` proves unreliable at integration time, swap to `https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png` — same interface, just change `cdnUrl`. Do not change the interface in this task.

### - [ ] Step 2.4: Build verification

Run: `pnpm build 2>&1 | tail -10`

Expected: `✓ built in <N>s`.

### - [ ] Step 2.5: Commit

Verify via `git status --short` that only the 3 created files show as untracked. Then:

```bash
git add src/data/symbolCategories.ts src/components/market-chart/symbolSearchTags.ts src/components/market-chart/CoinAvatar.tsx
git commit -m "feat(symbol-search): add CoinAvatar + deriveTags + SYMBOL_CATEGORIES

Pure helpers for the Symbol Search rebuild. CoinAvatar renders a CDN coin
icon with a deterministic-color text-avatar fallback. deriveTags returns
['spot'|'perp', 'crypto', optional category] based on symbol shape and a
curated base-asset → category map (~40 entries). No modal integration yet."
```

---

## Task 3: Modal chrome rebuild

**Files:**
- Modify: `src/components/market-chart/SymbolSearchModal.tsx`

Replace the existing header / tabs / filters / footer. The results list and filter-application logic stay as-is for this task — they're rebuilt in Task 4.

### - [ ] Step 3.1: Add new imports at the top of the file

Find the import block at the top of `SymbolSearchModal.tsx` (lines 1–10). Add after the existing imports:

```ts
import { useFavorites } from '../../contexts/FavoritesContext';
```

### - [ ] Step 3.2: Replace the modal tabs list

The current tabs array on line 131 is:

```ts
const allTabs = ['All', 'Stocks', 'Forex', 'Crypto', 'Indian'];
```

Change it to add Favorites at the end. We'll treat Favorites like a "pseudo-tab" — it's in the array but has special handling:

```ts
type SymbolTab = 'All' | 'Stocks' | 'Forex' | 'Crypto' | 'Indian' | 'Favorites';
const allTabs: SymbolTab[] = ['All', 'Stocks', 'Forex', 'Crypto', 'Indian', 'Favorites'];
```

Update the `activeTab` useState type:

```ts
const [activeTab, setActiveTab] = useState<SymbolTab>(defaultTab as SymbolTab);
```

(Cast is safe because callers pass string literals matching the union.)

### - [ ] Step 3.3: Read favorites from context

Near the other hooks at the top of the component body (around line 33–50, after the existing `useState` calls), add:

```ts
const { favorites, isFavorite, toggleFavorite } = useFavorites();
```

This is for use in Tasks 4 and 6; declared here so it's in scope throughout.

### - [ ] Step 3.4: Replace the header bar

The current header is at lines 257–271 (the `<div className="p-4 border-b border-gray-700/50">...</div>` with drag handler and title + close button mixed together).

Find this block:

```tsx
                {/* Header / Search Area */}
                <div
                    className="p-4 border-b border-gray-700/50"
                    onPointerDown={handleResizePointerDown}
                >
                    <div className="flex justify-between items-center mb-4 cursor-move">
                        <h2 className="text-lg font-medium text-white">
                            {title || 'Symbol Search'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>
```

Replace it with two separated regions — a drag-only title bar, and a non-draggable search area below it:

```tsx
                {/* Drag handle / title bar (ONLY drag surface) */}
                <div
                    className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-gray-700/50 cursor-move select-none"
                    onPointerDown={handleResizePointerDown}
                >
                    <div className="flex items-center gap-2">
                        <div className="flex gap-[3px]">
                            <div className="w-[3px] h-3 bg-gray-600 rounded-sm" />
                            <div className="w-[3px] h-3 bg-gray-600 rounded-sm" />
                        </div>
                        <h2 className="text-sm font-semibold text-white pl-1">
                            {title || 'Symbol Search'}
                        </h2>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="text-gray-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Search input (NOT a drag surface) */}
                <div className="p-4 border-b border-gray-700/50">
```

Note the new search-input wrapper opens a `<div>` that replaces the old closing `</div>` on line 271 (the one that ended the outer header). You'll close it after the search input section. The existing search input JSX (lines 273–327) stays INSIDE this new div but loses its `group` wrapper — details below.

### - [ ] Step 3.5: Wrap search input, add kbd hint

The existing search input block (starting around line 273 with `<div className="relative group">`) stays logically but we add a small `↑↓ ↵` hint on the right edge. Find the block:

```tsx
                    <div className="relative group">
                        <SearchIcon className="w-5 h-5 absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            ref={inputRef}
```

And the closing `</div>` that ends this block (after the conditional with `searchTerm &&`, around line 327).

Immediately before that closing `</div>`, add:

```tsx
                        {!searchTerm && (
                            <div className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 font-mono pointer-events-none">
                                ↑↓ ↵
                            </div>
                        )}
```

This renders the hint ONLY when the search is empty (so it doesn't overlap with the clear / add buttons that appear when typing).

After the existing `</div>` closing the `relative group` input wrapper, add a NEW closing `</div>` for the Task-3.4 search-area wrapper we opened:

```tsx
                    </div>
                </div>
                {/* end search input region */}
```

Your final structure should now be:
```
<Drag-handle bar>
<Search area>
  <Input group with kbd hint>
</Search area>
```
…followed by the existing tabs / filters / results (which we restyle below).

### - [ ] Step 3.6: Restyle the tabs row

The current tabs row is at lines 330–343:

```tsx
                <div className="flex flex-col border-b border-gray-700/50 bg-gray-800/90">
                    <div className="flex items-center overflow-x-auto scrollbar-hide px-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
```

Replace with pill-style tabs, with Favorites pushed to the right:

```tsx
                <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700/50 bg-gray-800/90 overflow-x-auto scrollbar-hide">
                    {tabs.filter((t) => t !== 'Favorites').map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`whitespace-nowrap px-3.5 py-1.5 text-sm rounded-full transition-colors ${
                                activeTab === tab
                                    ? 'bg-gray-700 text-white font-medium'
                                    : 'text-gray-400 hover:text-gray-200'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                    {tabs.includes('Favorites') && (
                        <>
                            <div className="flex-1" />
                            <button
                                onClick={() => setActiveTab('Favorites')}
                                className={`whitespace-nowrap px-3.5 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5 ${
                                    activeTab === 'Favorites'
                                        ? 'bg-amber-500/15 text-amber-400 font-medium'
                                        : 'text-amber-500/80 hover:text-amber-400'
                                }`}
                            >
                                <span>★</span>
                                <span>Favorites</span>
                                {favorites.size > 0 && (
                                    <span className="text-[10px] text-gray-500 font-mono">
                                        {favorites.size}
                                    </span>
                                )}
                            </button>
                        </>
                    )}
                </div>
```

### - [ ] Step 3.7: Hide filters row on Coming-soon tabs and Favorites

Find the filters row (around line 346 `<div className="px-4 py-2 border-b ...`). Wrap the entire row in a conditional so it only renders for Crypto and All tabs:

```tsx
                {(activeTab === 'Crypto' || activeTab === 'All') && (
                    <div className="px-4 py-2 border-b border-gray-700/50 bg-gray-800/90 flex items-center gap-6 text-xs overflow-x-auto">
                        { /* existing filter contents unchanged in this task */ }
                    </div>
                )}
```

### - [ ] Step 3.8: Restyle the footer

Find the footer at line 506:

```tsx
                <div className="p-2 border-t border-gray-700/50 bg-gray-800/90 text-[10px] text-center text-gray-500">
                    Search powered by Binance API
                </div>
```

Replace with a two-column informative footer:

```tsx
                <div className="px-4 py-2 border-t border-gray-700/50 bg-black/30 flex items-center justify-between text-[11px] text-gray-500">
                    <span>
                        {filteredSymbols.length.toLocaleString()} symbols · powered by Binance
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="border border-gray-700 rounded px-1.5 py-0.5 font-mono text-[9px]">esc</kbd>
                        <span>to close</span>
                    </span>
                </div>
```

### - [ ] Step 3.9: Build verification

Run: `pnpm build 2>&1 | tail -10`

Expected: `✓ built in <N>s` with no errors. The modal may have broken visuals temporarily because we haven't rebuilt the results rows yet (Task 4) — that's expected; the build passes because types still line up.

### - [ ] Step 3.10: Git scope + commit

Run: `git status --short`. Expected one modified file:

```
 M src/components/market-chart/SymbolSearchModal.tsx
```

```bash
git add src/components/market-chart/SymbolSearchModal.tsx
git commit -m "feat(symbol-search): rebuild modal chrome — drag handle, pill tabs, kbd hint, footer

Drag handle is now a dedicated dark bar at the top (fixes conflict with
close button). Tabs are pill-shaped; Favorites tab sits at the right end
with an amber count badge. Filters hidden on Favorites and Coming-soon
tabs. Footer shows live symbol count + 'esc to close' hint. Search input
gains a subtle ↑↓ ↵ discoverability hint when empty.

Results list still uses the old table layout — rebuilt in the next task."
```

---

## Task 4: Row layout rebuild + Coming-soon empty state

**Files:**
- Modify: `src/components/market-chart/SymbolSearchModal.tsx`

Rebuild the `<table>` results list as flex rows using `CoinAvatar` + `deriveTags`. Add the Coming-soon empty state for Stocks/Forex/Indian tabs.

### - [ ] Step 4.1: Add imports

At the top of `SymbolSearchModal.tsx`, add:

```ts
import CoinAvatar from './CoinAvatar';
import { deriveTags } from './symbolSearchTags';
```

### - [ ] Step 4.2: Define a helper for the Coming-soon tab set

Near the top of the component body (after `tabs` is declared), add:

```ts
const COMING_SOON_TABS: SymbolTab[] = ['Stocks', 'Forex', 'Indian'];
const isComingSoonTab = (t: SymbolTab) => COMING_SOON_TABS.includes(t);
```

### - [ ] Step 4.3: Gate the filteredSymbols source on active tab

Find the `filteredSymbols` useMemo (around line 134). Replace the source-selection block with:

```ts
    const filteredSymbols = useMemo(() => {
        let source: SearchSymbol[] = [];

        if (activeTab === 'Favorites') {
            // Favorites tab is handled in Task 6 — for now, return an empty source.
            source = [];
        } else if (isComingSoonTab(activeTab)) {
            source = [];
        } else if (activeTab === 'All' || activeTab === 'Crypto') {
            source = cryptoSymbols;
        }

        // Filter by Market (Spot/Futures)
        if (marketFilter !== 'All' && (activeTab === 'Crypto' || activeTab === 'All')) {
            source = source.filter((s) => s.market === marketFilter);
        }

        let result = source;

        // Apply Search Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(
                (s) =>
                    s.symbol.toLowerCase().replace('/', '').includes(lower) ||
                    s.description.toLowerCase().includes(lower)
            );
        }

        // Rank Filter (Top X by Volume)
        if (rankFilter !== 'All') {
            result.sort((a, b) => (b.volume || 0) - (a.volume || 0));
            if (rankFilter === 'Top 10') result = result.slice(0, 10);
            else if (rankFilter === 'Top 50') result = result.slice(0, 50);
            else if (rankFilter === 'Top 100') result = result.slice(0, 100);
        }

        return result;
    }, [searchTerm, activeTab, cryptoSymbols, marketFilter, rankFilter, favorites]);
```

(The `favorites` dep is harmless now and Task 6 uses it.)

### - [ ] Step 4.4: Replace the results `<table>` with flex rows

Find the `{ /* Results List */ }` section (around line 391):

```tsx
                {/* Results List */}
                <div
                    className="flex-1 overflow-y-auto custom-scrollbar bg-gray-800/90"
                    onScroll={handleScroll}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                            Loading items...
                        </div>
                    ) : filteredSymbols.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <MarketIcon className="w-16 h-16 opacity-20 mb-4" />
                            <p>No symbols match your criteria</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            { /* ... existing <tbody> ... */ }
                        </table>
                    )}
                </div>
```

Replace the entire block from `{/* Results List */}` through its closing `</div>` with:

```tsx
                {/* Results List */}
                <div
                    className="flex-1 overflow-y-auto custom-scrollbar bg-gray-800/90"
                    onScroll={handleScroll}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                            Loading items...
                        </div>
                    ) : isComingSoonTab(activeTab) ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 text-center">
                            <div className="text-5xl opacity-30 mb-3">🔜</div>
                            <p className="text-sm font-medium text-gray-300 mb-1">
                                {activeTab} coming soon
                            </p>
                            <p className="text-xs">
                                For now, browse{' '}
                                <button
                                    onClick={() => setActiveTab('Crypto')}
                                    className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
                                >
                                    Crypto
                                </button>
                                {' '}or your{' '}
                                <button
                                    onClick={() => setActiveTab('Favorites')}
                                    className="text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline"
                                >
                                    Favorites
                                </button>
                                .
                            </p>
                        </div>
                    ) : filteredSymbols.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <MarketIcon className="w-16 h-16 opacity-20 mb-4" />
                            <p>No symbols match your criteria</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-800/60">
                            {visibleSymbols.map((item, idx) => {
                                const normalised = item.symbol.replace('/', '');
                                const tags = deriveTags(item.symbol);
                                const favorited = isFavorite(normalised);
                                const alreadyAdded = existingSymbols.includes(normalised);
                                return (
                                    <div
                                        key={item.symbol + idx}
                                        onClick={() => {
                                            if (alreadyAdded) return;
                                            onSymbolSelect(normalised);
                                        }}
                                        className={`flex items-center gap-3.5 px-4 py-3 transition-colors ${
                                            alreadyAdded
                                                ? 'opacity-50 cursor-default'
                                                : 'hover:bg-gray-700/50 cursor-pointer'
                                        }`}
                                    >
                                        <CoinAvatar symbol={item.symbol} size={32} />
                                        <div className="flex-none w-[180px] min-w-0">
                                            <div className="font-semibold text-white text-sm truncate">
                                                {item.symbol}
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {item.description}
                                            </div>
                                        </div>
                                        <div className="flex-1 flex gap-1.5 flex-wrap">
                                            {tags.map((t) => (
                                                <span
                                                    key={t}
                                                    className="text-[10px] uppercase tracking-wider text-gray-400 bg-gray-800/80 border border-gray-700/50 rounded px-1.5 py-0.5"
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                        {alreadyAdded ? (
                                            <span className="text-[10px] uppercase tracking-wider text-green-500 bg-green-500/10 border border-green-500/30 rounded px-2 py-1">
                                                ✓ added
                                            </span>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleFavorite(normalised);
                                                }}
                                                className={`p-1.5 rounded transition-colors ${
                                                    favorited
                                                        ? 'text-amber-400 hover:text-amber-300'
                                                        : 'text-gray-600 hover:text-gray-400'
                                                }`}
                                                aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
                                            >
                                                <span className="text-base">
                                                    {favorited ? '★' : '☆'}
                                                </span>
                                            </button>
                                        )}
                                        <div className="flex items-center gap-1.5 min-w-[80px] justify-end">
                                            <span className="text-[11px] text-gray-400 font-medium">
                                                {item.exchange === 'BINANCE' ? 'Binance' : item.exchange}
                                            </span>
                                            <div className="w-3.5 h-3.5 rounded-sm bg-[#f3ba2f] flex-shrink-0" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
```

### - [ ] Step 4.5: Remove now-dead imports

In the import block at the top of the file, these icons are no longer used:
- `PlusCircleIcon` (in-row add button is gone — replaced by star or ✓ added chip)
- `CheckCircleIcon` (in-row check — replaced by text chip)

Find the imports block near the top (lines 2–9) and remove `PlusCircleIcon` and `CheckCircleIcon` from the list — but ONLY if they're not referenced elsewhere in the file. Verify with `grep -n "PlusCircleIcon\|CheckCircleIcon" src/components/market-chart/SymbolSearchModal.tsx` before removal; if `grep` returns hits beyond the import line, keep them.

### - [ ] Step 4.6: Build verification

Run: `pnpm build 2>&1 | tail -10`

Expected: `✓ built in <N>s`.

### - [ ] Step 4.7: Manual visual spot-check

Run `pnpm dev`. Open the Market page → click the symbol button in the chart header.

Verify in the browser:
- [ ] Rows render as flex layout (no `<table>` DOM)
- [ ] Coin icons load from CDN for BTC, ETH, SOL (if not, fallback text avatar appears)
- [ ] Tags `spot`/`perp` + `crypto` + optional category render on each row
- [ ] Star button toggles between ☆ and ★ — amber when filled
- [ ] Click outside the star but inside the row → row selects symbol + closes modal
- [ ] Click the star → does NOT close modal (toggles favorite)
- [ ] Click Stocks / Forex / Indian tab → Coming-soon empty state with click-throughs
- [ ] Click "Crypto" link in empty state → switches to Crypto tab
- [ ] Footer count updates when you filter

### - [ ] Step 4.8: Commit

```bash
git add src/components/market-chart/SymbolSearchModal.tsx
git commit -m "feat(symbol-search): flex-row results + Coming-soon empty state + star button

Replace the <table> results with flex rows matching the spec's row anatomy:
CoinAvatar · symbol+description · tags · star (or ✓ added chip) · exchange.
Star button toggles user favorite via FavoritesContext. Row-level click
still selects the symbol (except when already added in watchlist context,
where it's a no-op). Stocks/Forex/Indian tabs show Coming-soon empty
state with click-throughs to Crypto and Favorites."
```

---

## Task 5: Keyboard navigation + smart Enter + Ctrl/⌘+K

**Files:**
- Modify: `src/components/market-chart/SymbolSearchModal.tsx`
- Modify: `src/components/market-chart/ChartHeader.tsx`

### - [ ] Step 5.1: Add `focusedIndex` state and inline error state to the modal

In `SymbolSearchModal.tsx`, near the other `useState` declarations (around line 33), add:

```ts
const [focusedIndex, setFocusedIndex] = useState<number>(-1);
const [enterError, setEnterError] = useState<string | null>(null);
```

### - [ ] Step 5.2: Reset `focusedIndex` when results change

Find the existing `useEffect` that resets `displayLimit` (around line 176):

```ts
    useEffect(() => {
        setDisplayLimit(50);
    }, [searchTerm, activeTab, marketFilter, rankFilter]);
```

Add `setFocusedIndex(-1)` inside that effect and add the same dependencies:

```ts
    useEffect(() => {
        setDisplayLimit(50);
        setFocusedIndex(-1);
        setEnterError(null);
    }, [searchTerm, activeTab, marketFilter, rankFilter]);
```

### - [ ] Step 5.3: Wire keyboard navigation onto the input

Find the existing `onKeyDown` handler on the `<input ref={inputRef} ...>` (around line 281):

```tsx
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && searchTerm) {
                                    onSymbolSelect(searchTerm.toUpperCase().replace('/', ''));
                                }
                            }}
```

Replace with:

```tsx
                            onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setFocusedIndex((prev) => {
                                        if (visibleSymbols.length === 0) return -1;
                                        return (prev + 1) % visibleSymbols.length;
                                    });
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setFocusedIndex((prev) => {
                                        if (visibleSymbols.length === 0) return -1;
                                        return (prev - 1 + visibleSymbols.length) % visibleSymbols.length;
                                    });
                                } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    // Smart Enter: prefer focused row; fall back to exact match.
                                    if (focusedIndex >= 0 && focusedIndex < visibleSymbols.length) {
                                        const item = visibleSymbols[focusedIndex];
                                        const normalised = item.symbol.replace('/', '');
                                        if (!existingSymbols.includes(normalised)) {
                                            onSymbolSelect(normalised);
                                        }
                                    } else if (searchTerm) {
                                        const needle = searchTerm.toUpperCase().replace('/', '');
                                        const exact = visibleSymbols.find(
                                            (s) => s.symbol.replace('/', '').toUpperCase() === needle
                                        );
                                        if (exact) {
                                            const normalised = exact.symbol.replace('/', '');
                                            if (!existingSymbols.includes(normalised)) {
                                                onSymbolSelect(normalised);
                                            }
                                        } else {
                                            setEnterError(`No symbol matches "${searchTerm}"`);
                                        }
                                    }
                                } else if (e.key === 'Escape') {
                                    onClose();
                                }
                            }}
```

### - [ ] Step 5.4: Show the inline error below the input

Just below the search input wrapper (after the `</div>` that closes the `relative group` input and BEFORE the `</div>` that closes the search-area wrapper added in Task 3.4), add:

```tsx
                    {enterError && (
                        <div className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                            <span>⚠</span>
                            <span>{enterError}</span>
                        </div>
                    )}
```

The error clears automatically when the user types again (via the useEffect in Step 5.2).

### - [ ] Step 5.5: Render focused-row styles + `↵` hint in the row map

Inside the row `.map` in the results list (the `visibleSymbols.map(...)` from Task 4.4), change the `key` line and the root `<div>` className to read `focusedIndex`:

Find this line inside the map callback:
```ts
const normalised = item.symbol.replace('/', '');
```

Right after it, add:
```ts
const isFocused = idx === focusedIndex;
```

Then replace the root row `<div>` opening:

```tsx
                                    <div
                                        key={item.symbol + idx}
                                        onClick={() => {
                                            if (alreadyAdded) return;
                                            onSymbolSelect(normalised);
                                        }}
                                        className={`flex items-center gap-3.5 px-4 py-3 transition-colors ${
                                            alreadyAdded
                                                ? 'opacity-50 cursor-default'
                                                : 'hover:bg-gray-700/50 cursor-pointer'
                                        }`}
                                    >
```

with:

```tsx
                                    <div
                                        key={item.symbol + idx}
                                        data-focused={isFocused ? 'true' : undefined}
                                        onClick={() => {
                                            if (alreadyAdded) return;
                                            onSymbolSelect(normalised);
                                        }}
                                        onMouseEnter={() => setFocusedIndex(idx)}
                                        className={`flex items-center gap-3.5 px-4 py-3 transition-colors ${
                                            isFocused
                                                ? 'bg-indigo-500/10 shadow-[inset_3px_0_0_0_#6366f1]'
                                                : alreadyAdded
                                                  ? 'opacity-50'
                                                  : 'hover:bg-gray-700/50'
                                        } ${alreadyAdded ? 'cursor-default' : 'cursor-pointer'}`}
                                    >
```

At the end of the row — right before the closing `</div>` of the row — add a conditional `↵` hint:

```tsx
                                        {isFocused && (
                                            <div className="text-indigo-400 text-xs pl-1 border-l border-gray-700 ml-1">
                                                ↵
                                            </div>
                                        )}
                                    </div>
```

### - [ ] Step 5.6: Auto-scroll focused row into view

Just after the state declarations, add:

```ts
const resultsListRef = useRef<HTMLDivElement>(null);
```

Find the results-list scrolling container `<div className="flex-1 overflow-y-auto custom-scrollbar ..." onScroll={handleScroll}>`. Add `ref={resultsListRef}`:

```tsx
                <div
                    ref={resultsListRef}
                    className="flex-1 overflow-y-auto custom-scrollbar bg-gray-800/90"
                    onScroll={handleScroll}
                >
```

Then add a useEffect after the existing effects:

```ts
    useEffect(() => {
        if (focusedIndex < 0 || !resultsListRef.current) return;
        const row = resultsListRef.current.querySelector<HTMLElement>(
            `[data-focused="true"]`
        );
        row?.scrollIntoView({ block: 'nearest' });
    }, [focusedIndex]);
```

### - [ ] Step 5.7: Wire `Ctrl/⌘+K` global shortcut in ChartHeader

Open `src/components/market-chart/ChartHeader.tsx`. Find the existing state declaration around line 188:

```ts
const [isSymbolSearchOpen, setSymbolSearchOpen] = useState(false);
```

Below the existing market-status useEffect (around lines 192–198), add:

```ts
    // Global Ctrl/⌘+K opens the symbol search from anywhere on the Market page.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                // Don't hijack if focus is in an input/textarea/contenteditable (e.g., drawing text tool).
                const el = document.activeElement as HTMLElement | null;
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                    return;
                }
                e.preventDefault();
                setSymbolSearchOpen(true);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
```

### - [ ] Step 5.8: Build verification

Run: `pnpm build 2>&1 | tail -10`

Expected: `✓ built in <N>s`.

### - [ ] Step 5.9: Manual QA

Run `pnpm dev`. On the Market page:
- [ ] Click symbol button → modal opens, input focused
- [ ] Press ↓ → first row gets indigo-tinted background and left bar; `↵` hint appears on the right
- [ ] Press ↓↓↓ → focus advances; auto-scrolls when near the bottom
- [ ] Press ↑ at top → wraps to last visible row
- [ ] Press Enter on a focused row → selects that symbol (modal closes)
- [ ] Type `BTCUSDT` exactly → Enter → selects BTCUSDT
- [ ] Type `xyzabc` → Enter → inline red "No symbol matches 'xyzabc'" appears below the input
- [ ] Type another character → error clears
- [ ] Press Esc → modal closes
- [ ] With modal closed, press Ctrl+K (or ⌘+K on Mac) → modal opens
- [ ] Focus an unrelated text input anywhere on the page → press Ctrl+K → modal does NOT open (the input isn't hijacked)

### - [ ] Step 5.10: Commit

```bash
git add src/components/market-chart/SymbolSearchModal.tsx src/components/market-chart/ChartHeader.tsx
git commit -m "feat(symbol-search): keyboard navigation + smart Enter + Ctrl/⌘+K shortcut

Arrow keys move focus through visible result rows (wraps top/bottom,
auto-scrolls into view). Enter selects the focused row; if no row is
focused, Enter selects on exact-match typed symbol. If neither,
shows an inline 'No symbol matches' error instead of silently
accepting arbitrary text (fixes audit bug). Hovering a row also
promotes it to focused (mouse + keyboard stay in sync).

Escape closes the modal. Ctrl/⌘+K opens the modal from anywhere on
the Market page unless focus is already in a text input."
```

---

## Task 6: Favorites tab content

**Files:**
- Modify: `src/components/market-chart/SymbolSearchModal.tsx`

Wire the Favorites tab to surface the user's starred symbols. Since favorites is just a set of symbol strings and the full symbol metadata lives in `cryptoSymbols`, we filter `cryptoSymbols` by membership in `favorites`.

### - [ ] Step 6.1: Populate the source when Favorites tab is active

Find the `filteredSymbols` useMemo modified in Task 4.3. Change the Favorites branch from returning an empty array to filtering `cryptoSymbols`:

```ts
        if (activeTab === 'Favorites') {
            source = cryptoSymbols.filter((s) =>
                favorites.has(s.symbol.replace('/', ''))
            );
        } else if (isComingSoonTab(activeTab)) {
```

### - [ ] Step 6.2: Add a friendly empty state when no favorites yet

In the results-list conditional chain, currently we have:

```tsx
                    ) : filteredSymbols.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <MarketIcon className="w-16 h-16 opacity-20 mb-4" />
                            <p>No symbols match your criteria</p>
                        </div>
                    ) : (
```

Replace that branch so Favorites tab with zero favorites shows a dedicated message:

```tsx
                    ) : filteredSymbols.length === 0 ? (
                        activeTab === 'Favorites' ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 text-center">
                                <div className="text-5xl opacity-30 mb-3">☆</div>
                                <p className="text-sm font-medium text-gray-300 mb-1">
                                    No favorites yet
                                </p>
                                <p className="text-xs">
                                    Click the ☆ next to any symbol on other tabs to pin it here.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <MarketIcon className="w-16 h-16 opacity-20 mb-4" />
                                <p>No symbols match your criteria</p>
                            </div>
                        )
                    ) : (
```

### - [ ] Step 6.3: Build verification

Run: `pnpm build 2>&1 | tail -10`

Expected: `✓ built in <N>s`.

### - [ ] Step 6.4: Manual QA

Run `pnpm dev`. On the Market page → open symbol search:
- [ ] Click ★ Favorites tab with no favorites → empty state "No favorites yet"
- [ ] Go back to Crypto → click ☆ on 3 rows → icons flip to amber ★
- [ ] Favorites count badge increments to 3
- [ ] Click ★ Favorites tab → exactly those 3 rows visible
- [ ] Click ★ on one of them → removes from favorites → list shrinks to 2
- [ ] Reload the page → open modal → Favorites count still 2; rows still present (Supabase persisted)

### - [ ] Step 6.5: Commit

```bash
git add src/components/market-chart/SymbolSearchModal.tsx
git commit -m "feat(symbol-search): Favorites tab shows starred symbols

Favorites tab now filters cryptoSymbols by the user's favorites set
from FavoritesContext. Empty state prompts the user to star symbols
on other tabs. Count badge in the tab header stays in sync via the
context."
```

---

## Task 7: Manual QA pass

**Files:** none (verification only)

Final end-to-end check before the sub-project is considered done. All prior tasks did local verification; this task sweeps the full spec's testing checklist.

### - [ ] Step 7.1: Build clean

Run: `pnpm build 2>&1 | tail -10`

Expected: `✓ built in <N>s`.

### - [ ] Step 7.2: Full testing-checklist pass

Run `pnpm dev`. On the Market page, tick off each item from the spec. Each bullet is a pass/fail.

- [ ] Open modal via symbol button → focus lands in search input
- [ ] `Ctrl/⌘+K` from anywhere on Market page opens modal
- [ ] `Ctrl/⌘+K` while focus is already in a text input is ignored
- [ ] Type `btc` → only matching symbols visible
- [ ] `↓` from input → first result row gets indigo focus bar
- [ ] `↵` on focused row → selects it (modal closes, chart updates)
- [ ] `↓↓↓↑` → focus moves accordingly, auto-scrolls
- [ ] Type exact symbol (`btcusdt`) → `↵` selects without needing to focus the row
- [ ] Type garbage (`xyzabc`) → `↵` shows inline "No symbol matches" red message
- [ ] Typing clears the inline error
- [ ] `Esc` closes modal
- [ ] Click ☆ on a row → flips to ★ instantly
- [ ] Reload page → favorite persists (Supabase round-trip works)
- [ ] Click ★ Favorites tab → only starred symbols visible; count badge matches
- [ ] Empty Favorites state shows when none starred
- [ ] Click Stocks tab → "Stocks coming soon" empty state with click-throughs
- [ ] Click "Crypto" link in Stocks empty state → switches to Crypto tab
- [ ] Click "Favorites" link in Forex empty state → switches to Favorites tab
- [ ] Drag the title bar → modal moves; grip is the only drag surface
- [ ] Click ✕ on the title bar → closes without initiating drag
- [ ] Click outside modal → closes
- [ ] Coin icon for BTC, ETH, SOL → CDN loads
- [ ] Unusual symbol (obscure perp) → text-avatar gradient fallback renders
- [ ] Tags render correctly: `BTCUSDT.P` → `perp crypto layer1`; `PEPEUSDT` → `spot crypto meme`; `USDCUSDT` → `spot crypto stablecoin`
- [ ] Reopen modal → resets to centered position (no persistence)
- [ ] Open modal from watchlist-add flow (existing call site in `SidePanels.tsx`) → `existingSymbols` handling still works: already-added rows render muted with `✓ added` chip
- [ ] Footer count matches the visible-filtered count
- [ ] No console errors when interacting with the modal

### - [ ] Step 7.3: Regression check on the three call sites

Each consumer calls `<SymbolSearchModal ...>` with different props. Verify each still works:
- [ ] **Chart header** (`ChartHeader.tsx`): click the symbol button → modal opens → pick a symbol → chart re-renders with new symbol
- [ ] **My Scripts** page (`My Scripts.tsx`): open the add-symbol flow → modal opens with `defaultTab`/`allowedTabs` props → pick a symbol → it's added to the script
- [ ] **Side panels** (`SidePanels.tsx`, watchlist): open "Add to watchlist" → modal opens with `existingSymbols` → attempt to add an already-in-list symbol → row is muted with `✓ added`, click is a no-op

### - [ ] Step 7.4: Final report

If all boxes checked: sub-project done. If any failed: open a follow-up task list for the specific failure(s) and fix in a focused commit.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|--------------|---------|
| Row anatomy (§ Row Anatomy) | Task 4 |
| Modal chrome (§ Modal Chrome) | Task 3 |
| Coming-Soon Empty State | Task 4 |
| Interaction model — open/close, Esc, Ctrl+K | Task 5 |
| Interaction model — keyboard nav + smart Enter | Task 5 |
| Interaction model — Favorites toggle (optimistic + revert) | Task 1 + Task 4 (toggle wired in row) |
| Interaction model — drag (handle isolated) | Task 3 |
| Tags derivation | Task 2 |
| Coin icons + fallback | Task 2 |
| Supabase migration + RLS | Task 1 |
| Service module | Task 1 |
| React context + provider | Task 1 |
| `existingSymbols` treatment (muted + ✓ added) | Task 4 |
| Favorites tab content | Task 6 |
| Testing checklist | Task 7 |

No gaps.

**2. Placeholder scan** — no `TBD`, no "add error handling" hand-waves, no "similar to task N" redirects. All code steps contain concrete copy-paste-ready code.

**3. Type consistency** — names verified across tasks:
- `FavoritesContextValue.toggleFavorite(symbol: string): Promise<void>` (Task 1) → consumed as `toggleFavorite(normalised)` in Task 4, with `normalised = item.symbol.replace('/', '')` — consistent.
- `deriveTags(symbol: string): string[]` (Task 2) → called as `deriveTags(item.symbol)` in Task 4 — consistent.
- `CoinAvatar` prop `symbol` + optional `size` (Task 2) → used as `<CoinAvatar symbol={item.symbol} size={32} />` in Task 4 — consistent.
- `SymbolTab` union (Task 3) includes 'Favorites' → referenced via `activeTab === 'Favorites'` in Tasks 3, 4, 6 — consistent.
- `focusedIndex: number` (Task 5) with sentinel `-1` → checked `>= 0` before indexing — consistent.
