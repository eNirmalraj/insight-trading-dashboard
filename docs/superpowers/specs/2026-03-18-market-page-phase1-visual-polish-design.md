# Phase 1: Market Page Visual Polish — TradingView Style

## Overview
Upgrade Market page UI from basic to professional TradingView-level quality using a CSS-first approach with design tokens.

## Design Tokens

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#161616` | Main background |
| `--bg-secondary` | `#1E1E1E` | Panels, headers |
| `--bg-tertiary` | `#262626` | Modals, dropdowns |
| `--bg-hover` | `#2C2C2C` | Hover states |
| `--bg-active` | `#363636` | Active/pressed |
| `--border` | `#2A2A2A` | Borders |
| `--text-primary` | `#D1D4DC` | Primary text |
| `--text-secondary` | `#787B86` | Labels |
| `--text-tertiary` | `#4C525E` | Disabled |
| `--accent` | `#2962FF` | Active items |
| `--accent-hover` | `#1E53E5` | Accent hover |
| `--accent-subtle` | `rgba(41,98,255,0.12)` | Accent tints |
| `--up` | `#08CFAC` | Bullish |
| `--down` | `#CF082B` | Bearish |
| `--up-subtle` | `rgba(8,207,172,0.12)` | Up tint |
| `--down-subtle` | `rgba(207,8,43,0.12)` | Down tint |

### Typography
- Font: `Trebuchet MS, -apple-system, sans-serif`
- Sizes: 11px (small), 13px (body), 15px (headings), 20px (symbol)

### Spacing & Radius
- Padding: 8px (compact), 12px (default), 16px (spacious)
- Radius: 4px (buttons), 6px (panels), 8px (modals)

## Component Changes

### ChartHeader
- bg-secondary background, border-bottom
- Symbol: 15px, text-primary, hover bg-hover
- OHLC: 11px, up/down colored, labels text-secondary
- Timeframes: 11px, accent when active with accent-subtle bg
- 1px separator lines between button groups

### RightToolbar
- bg-secondary, left border
- Icons: text-secondary → text-primary hover → accent when active
- 10px padding buttons, tooltips with 400ms delay

### BottomPanel
- Visible 4px resize handle bar
- Tabs: text-secondary, accent underline when active
- Table: text-tertiary headers, bg-hover row hover
- Smooth 200ms expand/collapse

### SidePanels
- bg-secondary headers, skeleton loaders
- Watchlist: bg-hover on hover, up/down price colors
- Thin 4px scrollbars

### FloatingDrawingToolbar
- bg-tertiary, border, box-shadow
- All colors aligned to tokens

### ContextMenu
- 200px width, bg-tertiary, shadow
- Keyboard shortcuts right-aligned

### SymbolSearchModal
- bg-secondary, 8px radius
- Input: bg-primary, accent border on focus
- Recent symbols section

### Modals/Panels
- Fade+scale animation 200ms
- Slide-in for side/bottom panels

### Loading/Error
- Skeleton loaders (pulsing bg-hover → bg-active)
- React Error Boundary with retry

## Animations
- All interactives: transition all 150ms ease
- Modals: opacity+scale 200ms ease-out
- Tooltips: 400ms delay, 100ms fade-in
- Scrollbars: 4px, fade on idle
- Buttons: hover → active state chain

## Candle Colors
- Up: #08CFAC
- Down: #CF082B
