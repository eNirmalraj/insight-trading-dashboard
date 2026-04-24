# Symbol Search — UX Rebuild (Design)

**Status:** Approved 2026-04-24. Ready for implementation plan.

## Goal

Rebuild the chart's Symbol Search modal (`SymbolSearchModal.tsx`) to fix the long-standing UX gaps surfaced in the audit and add perceived-quality features: keyboard navigation, Supabase-persisted favorites, real coin icons, smarter Enter handling, and TradingView-inspired row layout. **Functional scope is unchanged** — Crypto remains the only real data source; Stocks / Forex / Indian / All tabs continue to surface the same data sources they always did, but with an honest "Coming soon" empty state when there's nothing to show. Live price ticking and additional exchanges are out of scope.

## Anchor & Scope Decisions

| Decision | Choice | Reason |
|---|---|---|
| Anchor pattern | Centered draggable modal (existing) | Familiar; user picked over command-palette / dropdown alternatives |
| Tab strategy | Keep all 5 tabs visible + add ★ Favorites (6 total) | Empty tabs render a friendly "Coming soon" empty state |
| Favorites placement | Dedicated tab at end of tab row | Clean spatial separation; cross-asset-class ready |
| Storage | Supabase per-user (`user_favorite_symbols`) | Syncs across devices; user is always logged in |
| Recents | **Out of scope** | Explicitly removed by user |
| Price column | **Removed** | Static snapshot was misleading; reference image confirmed no prices |
| Live updates | **Out of scope** | Modal is a switcher, not a monitor |

## Out of Scope (deferred)

- Live ticker / WebSocket price updates
- Actually populating Stocks / Forex / Indian / Indices with real data
- Recents auto-tracking
- Modal position persistence across opens
- Multiple exchanges per symbol (architecture supports it; no second source today)

## Row Anatomy

Inspired by the user's TradingView reference image. Single fixed-height row, left-to-right:

| Region | Width | Content |
|---|---|---|
| Coin icon | 32 px | CDN-loaded coin logo, with deterministic-color text avatar fallback (gradient + first 4 chars of base asset) |
| Symbol + description | 180 px fixed | `BTCUSDT.P` (bold) above `Bitcoin / Tether USD Perpetual` (muted) |
| Tags | flex 1 | Small uppercase pills: `spot`/`perp`, `crypto`, optional category (`meme`, `defi`, `layer1`) |
| Star (favorite) | auto | Outline ☆ → filled ★ amber on toggle |
| Exchange | 90 px min | Exchange name + 14 px logo, right-aligned (Binance only for now) |

**Row states:**
- Default: subtle text colors
- Hover: lighter row background, brighter text
- Keyboard-focused: 3px indigo left border + `↵` hint on the far right
- Favorited: star is filled amber `#fbbf24`

**Removed from current row:** price column, change %, redundant Add (+) button (row click selects; star toggles favorite — no ambiguity).

## Modal Chrome

```
┌──────────────────────────────────────────────────┐
│ ⫮⫮  Symbol Search                            ×  │  ← drag handle (separate from ×)
├──────────────────────────────────────────────────┤
│  🔍  [ Symbol, ISIN, or CUSIP ]      ↑↓ ↵      │  ← search input + kbd hint
├──────────────────────────────────────────────────┤
│ [All] Stocks Forex Crypto Indian      ★ Fav (7) │  ← tabs (Favorites at end)
├──────────────────────────────────────────────────┤
│ Market: All Spot USDT.P    Top: All 10 50 100   │  ← filters (Crypto + All only)
├──────────────────────────────────────────────────┤
│ ▌ ₿  BTCUSDT.P    perp crypto  ★  Binance     │  ← results list
│   Ξ  ETHUSDT.P    perp crypto  ☆  Binance     │
│   ◎  SOLUSDT.P    perp crypto  ☆  Binance     │
│ ...                                              │
├──────────────────────────────────────────────────┤
│ 1,287 symbols · powered by Binance     esc to ×│  ← informative footer
└──────────────────────────────────────────────────┘
```

**Chrome rules:**
- Drag handle is a dedicated dark bar at the top with grip dots. **Only drag surface.** Fixes the audit's drag/click conflict (drag handler currently lives on the same div as the close button).
- Tabs are pill-shaped buttons. Active = filled `#1f2937` bg + white text. Inactive = transparent + grey text.
- ★ Favorites tab sits at the right end with a count badge.
- "All" tab default-active. For now functionally equivalent to Crypto since that's the only data source.
- Filters (Market / Top) only render on Crypto and All tabs. Hidden when a Coming-soon tab is active.
- Footer shows live symbol count + provider + a small `esc to close` hint.

## Coming-Soon Empty State

When the user activates a tab without a real data source (Stocks / Forex / Indian / Indices):

```
       🔜
   Stocks coming soon
   For now, browse Crypto or your Favorites.
```

Two click-through links: "Crypto" (switches to Crypto tab) and "Favorites" (switches to Favorites tab).

## Interaction Model

### Open / close
- Click the symbol button in `ChartHeader.tsx` (existing trigger).
- **New:** global keyboard shortcut `Ctrl/⌘+K` opens the modal from anywhere on the Market page.
- `Esc` closes.
- Outside-click closes (existing).

### Search input
- Typing filters the visible-tab's source list live (existing).
- Search input shows `↑↓ ↵` hint on the right edge — discoverable keyboard nav.

### Keyboard navigation
- `↑` / `↓` move keyboard focus through visible result rows.
- Wraps at top/bottom (loop).
- Auto-scrolls focused row into view.
- Focused row gets the visual treatment from § Row Anatomy (indigo left bar + ↵ hint).

### Enter behavior
Smarter than current. `Enter` selects when **either**:
1. A result row is keyboard-focused (commit the focused row), OR
2. The search term **exactly matches** an available symbol (case-insensitive, e.g. typing `btcusdt` matches `BTCUSDT`).

**If neither**: show an inline "No symbol matches" message just below the input. Do **not** silently accept arbitrary text as the current code does (`searchTerm.toUpperCase().replace('/', '')`).

### Favorites
- Click the ☆/★ button on any row → instant Supabase upsert/delete via `favoritesService`.
- Optimistic UI: icon flips immediately; on Supabase error, revert + show inline error toast on the row.
- ★ Favorites tab count badge updates from local state (no extra round-trip).

### Drag
- Drag handle bar is the only drag surface. Pressing down on tabs / input / results does NOT initiate drag.
- First drag converts modal from `transform: translateX(-50%)` to absolute pixel coordinates (current implementation, just isolated to the handle).
- Modal position is **not persisted** between opens — every open re-centers.

### Tab focus order
`Tab` cycles: search input → tabs (left→right) → filters → first result row → next result row → … → close button → loops back. No focus traps.

## Tags Derivation

Tags come from a small pure helper `deriveTags(symbol: string): string[]`. Not Supabase-backed.

| Tag | Rule |
|---|---|
| `perp` | Symbol ends with `.P` |
| `spot` | Symbol does not end with `.P` |
| `crypto` | Always (only data source) |
| `meme` / `defi` / `layer1` / `stablecoin` | Static map keyed by base asset (BTC → `layer1`, PEPE → `meme`, UNI → `defi`, USDC → `stablecoin`, etc.) — ~30 curated entries. No tag if not in map. |

The static category map lives in `src/data/symbolCategories.ts` so it can be edited without touching the search component.

## Coin Icons

Source: third-party CDN. Recommended provider: `cryptoicons.org` or `cryptoicon-api.vercel.app` (specific URL to be picked in implementation; both serve `${baseAsset.toLowerCase()}.svg`/`.png`).

Loading: standard `<img>` tag with `onError` fallback to text avatar.

Text avatar fallback:
- 32 px circle with linear gradient background
- Color hashed from base asset string (deterministic)
- Centered uppercase text: first 4 chars of base asset (or symbol if no base asset extractable)

## Data Persistence

### Supabase migration

```sql
-- backend/schema/071_user_favorite_symbols.sql
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
```

### Service module

New file `src/services/favoritesService.ts`:

```ts
export const loadFavorites = async (): Promise<string[]>;       // returns symbol list
export const addFavorite = async (symbol: string): Promise<void>;
export const removeFavorite = async (symbol: string): Promise<void>;
```

Mirrors the pattern of `marketStateService.ts` and supports the same `USE_MOCK` / `isSupabaseConfigured()` guards.

### React context

New `src/contexts/FavoritesContext.tsx`:

```tsx
const FavoritesContext = createContext<{
    favorites: Set<string>;
    isFavorite: (symbol: string) => boolean;
    toggleFavorite: (symbol: string) => Promise<void>;
}>(...);
```

- Provider wraps the Market page.
- Loads once on mount via `loadFavorites()`.
- `toggleFavorite` does optimistic update + Supabase write + revert-on-error.

The modal, the chart header (future star indicator next to active symbol), and any future favorites widget all consume this same context.

## File Touch List

**Modify:**
- `src/components/market-chart/SymbolSearchModal.tsx` — full rebuild (~515 lines → ~600 lines)
- `src/components/market-chart/ChartHeader.tsx` — add `Ctrl/⌘+K` global keyboard listener that opens the modal
- `src/pages/Market.tsx` — wrap with `<FavoritesProvider>`

**Create:**
- `src/services/favoritesService.ts` — Supabase CRUD for favorites
- `src/contexts/FavoritesContext.tsx` — React context + provider + hook
- `src/data/symbolCategories.ts` — static base-asset → category tag map
- `src/components/market-chart/symbolSearchTags.ts` — pure `deriveTags(symbol: string): string[]` helper
- `src/components/market-chart/CoinAvatar.tsx` — `<CoinAvatar symbol baseAsset />` component handling CDN + fallback
- `backend/schema/071_user_favorite_symbols.sql` — migration

**Unchanged:**
- `src/services/marketDataService.ts` (`fetchAllCryptoSymbols` keeps current shape)

## Behaviors That Stay The Same

- Modal is opened from the chart header symbol button (existing trigger preserved + new `Ctrl/⌘+K` shortcut)
- Search filters live as you type
- Scroll-to-load pagination (50 rows at a time)
- `marketType` prop still enforces Spot vs Futures when called from a context that requires it (e.g. add-to-watchlist)
- `existingSymbols` prop still de-duplicates already-added symbols. Treatment: when `existingSymbols` is provided (watchlist add flow), rows whose symbol is in the set render at 50 % opacity with a small `✓ added` chip in place of the star button, and clicking them is a no-op. The star (favorites) remains a separate concept and is still clickable. When `existingSymbols` is empty / undefined (chart-header switch flow), all rows render normally with star buttons
- Outside-click closes the modal

## Testing Checklist (manual QA, no test runner exists)

- [ ] Open modal via symbol button → focus lands in search input
- [ ] `Ctrl/⌘+K` from anywhere on Market page opens modal
- [ ] Type `btc` → only matching symbols visible
- [ ] `↓` from input → first result row gets indigo focus bar; `↵` selects it
- [ ] `↓↓↓↑` → focus moves accordingly, auto-scrolls
- [ ] Type exact symbol (`btcusdt`) → `↵` selects without needing to focus the row
- [ ] Type garbage (`xyzabc`) → `↵` shows "No symbol matches" inline message
- [ ] `Esc` closes modal from any focused element
- [ ] Click ☆ on a row → flips to ★ instantly; reload → still favorited (Supabase persisted)
- [ ] Click ★ Favorites tab → only starred symbols visible; count badge matches
- [ ] Click Stocks tab → "Stocks coming soon" empty state with click-throughs
- [ ] Click "Crypto" link in empty state → switches to Crypto tab
- [ ] Drag the title bar → modal moves; drag bar ≠ close button area
- [ ] Click ✕ → closes; doesn't accidentally trigger drag
- [ ] Click outside modal → closes
- [ ] Coin icon for BTC, ETH, SOL → CDN loads; for an unusual symbol (e.g. an obscure perp) → text-avatar gradient fallback
- [ ] Tags render correctly: `BTCUSDT.P` → `perp` `crypto` `layer1`; `PEPEUSDT` → `spot` `crypto` `meme`
- [ ] Reopen modal → resets to centered position (no persistence)

## Task Decomposition (for writing-plans)

Suggested split (will be refined in the plan):

1. **Schema + service + context** — Supabase migration + `favoritesService.ts` + `FavoritesContext.tsx` + provider wiring
2. **Coin avatar + tag helper** — `CoinAvatar.tsx` + `symbolCategories.ts` + `symbolSearchTags.ts` (pure helpers, easy to verify)
3. **Modal chrome rebuild** — drag-handle separation + tab pill restyle + filter row + footer + Coming-soon empty state
4. **Row layout rebuild** — replace `<table>` with flex rows using new anatomy + integrate `<CoinAvatar>` + tags + star button (wired to `FavoritesContext`)
5. **Keyboard navigation + Enter logic** — focus state, ↑/↓ handlers, smart Enter, `Ctrl/⌘+K` global shortcut
6. **★ Favorites tab content + count badge** — wire tab to filter the source list by favorites set
7. **Manual QA pass** — run through the testing checklist
