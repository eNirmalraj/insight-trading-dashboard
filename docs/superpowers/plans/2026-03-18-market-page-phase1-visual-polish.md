# Market Page Phase 1: Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Market page from basic dark UI to TradingView-level professional polish using CSS design tokens and systematic component updates.

**Architecture:** CSS custom properties define all colors, spacing, and typography in `src/index.css`. Each component is updated to replace hardcoded Tailwind gray classes and hex values with token-based equivalents. Animations and transitions are added globally and per-component.

**Tech Stack:** CSS Custom Properties, Tailwind CSS utility classes, React, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/index.css` | Design tokens (CSS custom properties), global transitions, scrollbar, skeleton animation |
| Modify | `src/pages/Market.tsx` | Background token, error boundary wrapper |
| Modify | `src/components/market-chart/ChartHeader.tsx` | Header bar styling, OHLC display, timeframe buttons |
| Modify | `src/components/market-chart/RightToolbar.tsx` | Sidebar styling, icon states, tooltips |
| Modify | `src/components/market-chart/BottomPanel.tsx` | Panel styling, tabs, resize handle, table |
| Modify | `src/components/market-chart/ContextMenu.tsx` | Menu styling, width, hover states |
| Modify | `src/components/market-chart/FloatingDrawingToolbar.tsx` | Remove hardcoded hex, align to tokens |
| Modify | `src/components/market-chart/SymbolSearchModal.tsx` | Modal styling, input focus, result rows |
| Modify | `src/components/market-chart/DrawingToolbar.tsx` | Tool button styling, submenu |
| Modify | `src/components/market-chart/SidePanels.tsx` | Watchlist, alerts, order panel, data window |
| Modify | `src/components/market-chart/CandlestickChart.tsx` | Canvas colors, default chart settings, modal layers |
| Modify | `src/components/market-chart/ActiveIndicatorsDisplay.css` | Indicator label styling |
| Modify | `src/components/market-chart/SidePanels.css` | Panel CSS variables |
| Modify | `src/components/Loader.tsx` | Loader styling |
| Modify | `src/components/market-chart/mobile/MobileDrawingToolsModal.tsx` | Mobile modal styling |
| Modify | `src/components/market-chart/mobile/MobileMoreMenu.tsx` | Mobile menu styling |

---

### Task 1: Design Tokens & Global Styles

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add CSS custom properties to `:root`**

Add to `src/index.css` after the `@tailwind` directives and before the scrollbar styles:

```css
:root {
  /* Backgrounds */
  --bg-primary: #161616;
  --bg-secondary: #1E1E1E;
  --bg-tertiary: #262626;
  --bg-hover: #2C2C2C;
  --bg-active: #363636;

  /* Borders */
  --border: #2A2A2A;

  /* Text */
  --text-primary: #D1D4DC;
  --text-secondary: #787B86;
  --text-tertiary: #4C525E;

  /* Accent */
  --accent: #2962FF;
  --accent-hover: #1E53E5;
  --accent-subtle: rgba(41, 98, 255, 0.12);

  /* Trading */
  --up: #08CFAC;
  --down: #CF082B;
  --up-subtle: rgba(8, 207, 172, 0.12);
  --down-subtle: rgba(207, 8, 43, 0.12);

  /* Typography */
  --font-family: 'Trebuchet MS', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-xs: 11px;
  --font-sm: 13px;
  --font-md: 15px;
  --font-lg: 20px;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
}
```

- [ ] **Step 2: Add global body and transition styles**

Add after the `:root` block:

```css
body {
  font-family: var(--font-family);
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* Global transitions for interactive elements */
button, a, input, select, textarea,
[role="button"], [role="tab"], [role="menuitem"] {
  transition: all 150ms ease;
}

/* Skeleton loader animation */
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

.skeleton {
  background: var(--bg-hover);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

/* Modal animations */
@keyframes modal-fade-in {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes modal-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes slide-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.animate-modal-in {
  animation: modal-fade-in 200ms ease-out forwards;
}

.animate-backdrop-in {
  animation: modal-backdrop-in 150ms ease-out forwards;
}

.animate-slide-up {
  animation: slide-up 200ms ease-out forwards;
}

.animate-slide-right {
  animation: slide-right 200ms ease-out forwards;
}
```

- [ ] **Step 3: Update scrollbar styles to use tokens**

Replace existing scrollbar CSS:

```css
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--bg-active);
  border-radius: var(--radius-sm);
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
```

- [ ] **Step 4: Verify tokens load correctly**

Run: `pnpm dev` and inspect browser DevTools → Elements → `:root` computed styles to confirm all custom properties are defined.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(market): add design token system with TradingView-inspired palette"
```

---

### Task 2: Market Page Container & Error Boundary

**Files:**
- Modify: `src/pages/Market.tsx`

- [ ] **Step 1: Update Market page background and loader overlay**

Replace `bg-gray-900` classes with token-based inline styles:

In the return JSX of `Market.tsx`:
- Outer div: change `className="h-full flex flex-col bg-gray-900 relative"` to `className="h-full flex flex-col relative" style={{ background: 'var(--bg-primary)' }}`
- Loader overlay: change `bg-gray-900/80` to `style={{ background: 'rgba(22,22,22,0.85)' }}` with `backdrop-blur-sm`

- [ ] **Step 2: Add React Error Boundary**

Add an error boundary component at the top of `Market.tsx`:

```tsx
class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          <svg className="w-12 h-12" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>Chart failed to load</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ background: 'var(--accent)', color: '#fff', padding: '8px 16px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-sm)' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap the `CandlestickChart` in the JSX with `<ChartErrorBoundary>`.

- [ ] **Step 3: Verify page renders correctly**

Check `http://localhost:3000` — Market page should show with new background color and error boundary should be invisible during normal operation.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Market.tsx
git commit -m "feat(market): apply design tokens to Market page, add error boundary"
```

---

### Task 3: Chart Header Polish

**Files:**
- Modify: `src/components/market-chart/ChartHeader.tsx` (362 lines)

- [ ] **Step 1: Replace all background color classes**

Across the entire file, make these replacements:
- `bg-gray-900` → `style={{ background: 'var(--bg-secondary)' }}` (header bar)
- `bg-gray-800` → `style={{ background: 'var(--bg-tertiary)' }}`
- `bg-gray-700` → `style={{ background: 'var(--bg-hover)' }}`
- `hover:bg-gray-700` → `hover:bg-[var(--bg-hover)]` or inline
- `bg-blue-500/30` → `style={{ background: 'var(--accent-subtle)' }}`
- `bg-blue-500` → `style={{ background: 'var(--accent)' }}`

- [ ] **Step 2: Replace all text color classes**

- `text-gray-400` → `style={{ color: 'var(--text-secondary)' }}`
- `text-gray-500` → `style={{ color: 'var(--text-secondary)' }}`
- `text-white` → `style={{ color: 'var(--text-primary)' }}`
- `text-blue-300` → `style={{ color: 'var(--accent)' }}`
- `text-green-400` → `style={{ color: 'var(--up)' }}`
- `text-red-400` → `style={{ color: 'var(--down)' }}`

- [ ] **Step 3: Replace border classes**

- `border-gray-700/50` → `style={{ borderColor: 'var(--border)' }}`
- `border-gray-700` → `style={{ borderColor: 'var(--border)' }}`
- `border-gray-600` → `style={{ borderColor: 'var(--border)' }}`

- [ ] **Step 4: Fix spacing — increase header padding**

- Change header container padding from `p-1.5` to `px-3 py-2`
- Add `gap-2` between button groups
- Add `1px` vertical separator divs between groups: `<div style={{ width: 1, height: 20, background: 'var(--border)' }} />`

- [ ] **Step 5: Polish timeframe buttons**

Active timeframe button should use:
```
style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}
```

Inactive: `style={{ color: 'var(--text-secondary)' }}` with hover → `var(--text-primary)`

- [ ] **Step 6: Verify header appearance**

Open Market page, check: new colors, spacing, active timeframe highlight, OHLC colors, separator lines visible.

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/ChartHeader.tsx
git commit -m "feat(market): polish ChartHeader with design tokens and improved spacing"
```

---

### Task 4: Right Toolbar Polish

**Files:**
- Modify: `src/components/market-chart/RightToolbar.tsx` (86 lines)

- [ ] **Step 1: Update toolbar container**

- Background: `style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}`
- Remove `bg-gray-900` and `border-l border-gray-700/50`

- [ ] **Step 2: Update icon buttons**

- Default: `style={{ color: 'var(--text-secondary)', padding: 10, borderRadius: 'var(--radius-sm)' }}`
- Hover: background → `var(--bg-hover)`, color → `var(--text-primary)`
- Active (panel open): color → `var(--accent)`
- Increase button padding from `p-2` to `p-2.5` for better click targets

- [ ] **Step 3: Verify toolbar**

Check right toolbar — icons should be subtler by default, brighten on hover, highlight blue when panel is open.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/RightToolbar.tsx
git commit -m "feat(market): polish RightToolbar with design tokens and better icon states"
```

---

### Task 5: Bottom Panel Polish

**Files:**
- Modify: `src/components/market-chart/BottomPanel.tsx` (446 lines)

- [ ] **Step 1: Add visible resize handle**

Replace the invisible resize area with a visible handle bar:
```tsx
<div
  className="cursor-row-resize flex items-center justify-center"
  style={{ height: 6, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}
  onMouseDown={handleResizeStart}
>
  <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--bg-active)' }} />
</div>
```

- [ ] **Step 2: Update tab styling**

Replace filled active tab (`bg-blue-600 text-white`) with TradingView-style underline:
- Active: `style={{ color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)' }}`
- Inactive: `style={{ color: 'var(--text-secondary)' }}` with hover → `var(--text-primary)`
- Remove all `bg-blue-600` from tabs

- [ ] **Step 3: Update table styling**

- Table header row: `style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', textTransform: 'uppercase' }}`
- Table rows: `style={{ borderBottom: '1px solid var(--border)' }}` with hover → `background: var(--bg-hover)`
- Profit/loss colors: `var(--up)` / `var(--down)`

- [ ] **Step 4: Replace all background/border/text classes**

Same pattern as ChartHeader — replace `bg-gray-*`, `text-gray-*`, `border-gray-*` with token equivalents.

- [ ] **Step 5: Verify bottom panel**

Check: visible resize handle, tab underline style, table hover, correct colors.

- [ ] **Step 6: Commit**

```bash
git add src/components/market-chart/BottomPanel.tsx
git commit -m "feat(market): polish BottomPanel with visible resize handle, tab redesign, table styling"
```

---

### Task 6: Context Menu Polish

**Files:**
- Modify: `src/components/market-chart/ContextMenu.tsx` (166 lines)

- [ ] **Step 1: Update menu container**

```tsx
style={{
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  width: 200,
  padding: 4,
}}
```

Remove `w-60 bg-gray-800 border-gray-700 rounded-lg`.

- [ ] **Step 2: Update menu items**

- Text: `style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' }}`
- Hover: `background: var(--bg-hover)`, `color: var(--text-primary)`
- Shortcuts: right-aligned, `style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)' }}`
- Separator: `style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }}`

- [ ] **Step 3: Verify context menu**

Right-click on chart canvas — menu should appear with proper colors, shadow, compact width.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/ContextMenu.tsx
git commit -m "feat(market): polish ContextMenu with design tokens and shadow"
```

---

### Task 7: Floating Drawing Toolbar Polish

**Files:**
- Modify: `src/components/market-chart/FloatingDrawingToolbar.tsx` (397 lines)

- [ ] **Step 1: Replace all hardcoded hex colors**

- `bg-[#1E222D]` → `style={{ background: 'var(--bg-tertiary)' }}`
- `border-[#2A2E39]` → `style={{ borderColor: 'var(--border)' }}`
- `text-[#B2B5BE]` → `style={{ color: 'var(--text-secondary)' }}`
- `text-[#D1D4DC]` → `style={{ color: 'var(--text-primary)' }}`
- `bg-gray-700/50` → `style={{ background: 'var(--bg-hover)' }}`
- `bg-gray-700` → `style={{ background: 'var(--bg-hover)' }}`

- [ ] **Step 2: Add box shadow to toolbar container**

Add `boxShadow: '0 4px 12px rgba(0,0,0,0.4)'` to the toolbar's main container style.

- [ ] **Step 3: Update tab active indicator**

Replace `border-b-2 border-blue-400` with `borderBottom: '2px solid var(--accent)'`.

- [ ] **Step 4: Verify floating toolbar**

Select a drawing on chart, confirm toolbar appears with correct token colors and shadow.

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/FloatingDrawingToolbar.tsx
git commit -m "feat(market): polish FloatingDrawingToolbar, remove hardcoded hex colors"
```

---

### Task 8: Symbol Search Modal Polish

**Files:**
- Modify: `src/components/market-chart/SymbolSearchModal.tsx` (480 lines)

- [ ] **Step 1: Update modal container and backdrop**

- Backdrop: add `animate-backdrop-in` class
- Modal: add `animate-modal-in` class
- Background: `style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}`
- Remove `bg-gray-900`, `rounded-xi`

- [ ] **Step 2: Update search input**

```
style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--font-sm)' }}
```
On focus, border should change to `var(--accent)`.

- [ ] **Step 3: Update tabs and filters**

- Active tab: `color: var(--text-primary)`, `borderBottom: 2px solid var(--accent)`
- Inactive tab: `color: var(--text-secondary)`, hover → `var(--text-primary)`
- Filter buttons: `style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}`

- [ ] **Step 4: Update result rows**

- Row hover: `background: var(--bg-hover)`
- Symbol text: `color: var(--text-primary)`
- Price up: `color: var(--up)`, price down: `color: var(--down)`
- Replace hardcoded `text-[#00C076]` and `text-[#FF6838]`

- [ ] **Step 5: Verify symbol search**

Click symbol button in header → modal should animate in with correct colors, search input highlights on focus.

- [ ] **Step 6: Commit**

```bash
git add src/components/market-chart/SymbolSearchModal.tsx
git commit -m "feat(market): polish SymbolSearchModal with animations and design tokens"
```

---

### Task 9: Drawing Toolbar Polish

**Files:**
- Modify: `src/components/market-chart/DrawingToolbar.tsx` (154 lines)

- [ ] **Step 1: Replace all color classes**

- `bg-gray-800` → `var(--bg-secondary)`
- `bg-gray-900` → `var(--bg-primary)`
- `bg-blue-500/10` → `var(--accent-subtle)`
- `text-gray-400` → `var(--text-secondary)`
- `text-blue-400` → `var(--accent)`
- `border-gray-700` → `var(--border)`
- `hover:bg-gray-700` → hover `var(--bg-hover)`

- [ ] **Step 2: Improve active tool indicator**

Replace tiny 6x6 triangle with a left-side accent bar:
```tsx
<div style={{ position: 'absolute', left: 0, top: '25%', height: '50%', width: 2, borderRadius: 1, background: 'var(--accent)' }} />
```

- [ ] **Step 3: Verify drawing toolbar**

Check right toolbar drawing tools — active tool should show accent bar, submenu should use token colors.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/DrawingToolbar.tsx
git commit -m "feat(market): polish DrawingToolbar with design tokens and active indicator"
```

---

### Task 10: Side Panels Polish

**Files:**
- Modify: `src/components/market-chart/SidePanels.tsx` (1684 lines)
- Modify: `src/components/market-chart/SidePanels.css` (18 lines)

- [ ] **Step 1: Update panel containers**

All side panels (Watchlist, Alerts, Data Window, Order Panel):
- Panel background: `var(--bg-secondary)`
- Header: `var(--bg-secondary)` with bottom `var(--border)` border
- Panel border-left: `1px solid var(--border)`

- [ ] **Step 2: Update Watchlist panel**

- Symbol rows: hover → `background: var(--bg-hover)`
- Price positive: `color: var(--up)`, negative: `color: var(--down)`
- Column headers: `color: var(--text-tertiary)`, `fontSize: var(--font-xs)`, `textTransform: uppercase`
- Watchlist dropdown: `background: var(--bg-tertiary)`, `border: var(--border)`

- [ ] **Step 3: Update Order Panel**

- Buy button: `background: var(--up)`, hover darken
- Sell button: `background: var(--down)`, hover darken
- Inputs: `background: var(--bg-primary)`, `border: 1px solid var(--border)`, focus → `border-color: var(--accent)`
- Tab buttons (Market/Limit/Stop): same underline pattern as BottomPanel

- [ ] **Step 4: Update remaining panels (Alerts, Data Window)**

Same token replacement pattern — replace `bg-gray-*`, `text-gray-*`, `border-gray-*` throughout.

- [ ] **Step 5: Update SidePanels.css**

```css
.no-select { user-select: none; }
.col-width-dynamic { width: var(--col-width); }
.price-color-dynamic { color: var(--price-color); }
.indicator-color-dynamic { color: var(--indicator-color); }
```
No changes needed here — these use their own CSS vars already.

- [ ] **Step 6: Add slide-in animation**

When panel opens, add `animate-slide-right` class to the panel container for smooth entrance.

- [ ] **Step 7: Verify all side panels**

Open each panel (watchlist, alerts, order, data window) and verify colors, hover states, animations.

- [ ] **Step 8: Commit**

```bash
git add src/components/market-chart/SidePanels.tsx src/components/market-chart/SidePanels.css
git commit -m "feat(market): polish SidePanels with design tokens, hover states, slide animation"
```

---

### Task 11: Main CandlestickChart Component Polish

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx` (6168 lines)
- Modify: `src/components/market-chart/ActiveIndicatorsDisplay.css` (6 lines)

- [ ] **Step 1: Update default candle colors**

Find the default color constants (near top of file) and replace:
- `bodyUpColor: '#10B981'` → `'#08CFAC'`
- `bodyDownColor: '#EF4444'` → `'#CF082B'`
- Update all wick/border up/down colors accordingly

- [ ] **Step 2: Update canvas background**

Find where the canvas background is set (likely in a draw/render function) and change from `#000000` or gray to `#161616` (var --bg-primary equivalent for canvas).

- [ ] **Step 3: Update chart container backgrounds**

In the JSX return section (last ~200 lines):
- Replace `bg-gray-900` → inline `style={{ background: 'var(--bg-primary)' }}`
- Replace `border-gray-800` → inline `style={{ borderColor: 'var(--border)' }}`
- Replace `border-t border-gray-800` on x-axis container
- Replace `border-l border-gray-800` on y-axis container

- [ ] **Step 4: Update modal z-index and backdrop styles**

For all modal overlays rendered in CandlestickChart (IndicatorPanels, ChartSettings, AlertMarkers, ContextMenu, TemplateManager):
- Add `animate-backdrop-in` to backdrop divs
- Add `animate-modal-in` to modal content divs

- [ ] **Step 5: Update ActiveIndicatorsDisplay.css**

```css
.indicator-label {
  font-family: var(--font-family);
  font-weight: 600;
  font-size: var(--font-xs);
  cursor: pointer;
  transition: color 150ms ease, opacity 150ms ease;
}

.indicator-label:hover {
  opacity: 0.8;
}
```

- [ ] **Step 6: Verify chart rendering**

Check: canvas background color, candle colors (#08CFAC up, #CF082B down), axis borders, indicator labels.

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx src/components/market-chart/ActiveIndicatorsDisplay.css
git commit -m "feat(market): polish CandlestickChart canvas colors and indicator display"
```

---

### Task 12: Loader & Mobile Components Polish

**Files:**
- Modify: `src/components/Loader.tsx` (25 lines)
- Modify: `src/components/market-chart/mobile/MobileDrawingToolsModal.tsx` (74 lines)
- Modify: `src/components/market-chart/mobile/MobileMoreMenu.tsx` (45 lines)

- [ ] **Step 1: Update Loader**

Replace bouncing dots colors:
- `bg-blue-400` → `style={{ background: 'var(--accent)' }}`
- `text-gray-400` → `style={{ color: 'var(--text-secondary)' }}`

- [ ] **Step 2: Update MobileDrawingToolsModal**

- Modal background: `var(--bg-secondary)`
- Tool buttons: `var(--bg-tertiary)` background
- Active tool: `var(--accent)` background
- Headers: `var(--text-primary)`
- Category labels: `var(--text-secondary)`
- Remove `bg-gray-900`, `bg-gray-800`, `bg-gray-700`, `bg-blue-600`

- [ ] **Step 3: Update MobileMoreMenu**

- Menu background: `var(--bg-tertiary)`, `border: 1px solid var(--border)`
- Button text: `var(--text-primary)`
- Hover: `var(--bg-hover)`
- Add shadow: `boxShadow: '0 4px 16px rgba(0,0,0,0.5)'`

- [ ] **Step 4: Verify on mobile viewport**

In browser DevTools, switch to mobile viewport (375px width). Check loader, drawing tools modal, more menu.

- [ ] **Step 5: Commit**

```bash
git add src/components/Loader.tsx src/components/market-chart/mobile/MobileDrawingToolsModal.tsx src/components/market-chart/mobile/MobileMoreMenu.tsx
git commit -m "feat(market): polish Loader and mobile components with design tokens"
```

---

### Task 13: Final Integration Verification

- [ ] **Step 1: Full visual review**

Open `http://localhost:3000`, navigate to Market page. Check every component:
- Header: colors, spacing, timeframe buttons, OHLC display
- Chart: canvas background, candle colors, grid
- Right toolbar: icon states, hover
- Bottom panel: resize handle, tabs, table
- Side panels: open each, check colors
- Modals: symbol search, indicator selector, context menu
- Mobile: resize to 375px width

- [ ] **Step 2: Fix any remaining hardcoded colors**

Search codebase for any remaining `bg-gray-` or `text-gray-` or hardcoded hex values in market-chart components. Replace with tokens.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(market): Phase 1 visual polish complete — TradingView-style design tokens"
```
