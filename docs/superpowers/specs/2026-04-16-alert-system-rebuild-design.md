# Alert System Rebuild — Design Spec

**Date:** 2026-04-16  
**Status:** Approved  
**Mockup:** `docs/mockups/alert-ux-v5-combined.html`

---

## Overview

Full rewrite of the Market page alert system for drawings and indicators. Replaces the old TradingView-style modal with a Quick Create + Inline Panel UX.

## UX Flow

### Drawing Alerts
1. User right-clicks a drawing (Trend Line, Horizontal Line, Ray, Rectangle, Parallel Channel, Fibonacci Retracement)
2. Context menu shows **"Add alert on [DrawingType]"**
3. One click → alert is **instantly created** with smart defaults (Crossing, notify on, current price)
4. A **toast** appears at bottom: "Alert created — Crossing 0.168" with **Customize** and **Dismiss** buttons
5. Clicking **Customize** (or clicking the bell icon on the drawing later) → **inline panel slides from right** next to the toolbar
6. Panel shows: Condition, Trigger frequency, Actions, Message — all editable, chart stays visible
7. Save/Delete buttons at panel footer

### Indicator Alerts
1. User clicks bell icon on an active indicator (in ActiveIndicatorsDisplay)
2. Alert is **instantly created** with the first predefined condition and smart defaults
3. Same toast → panel flow as above
4. Panel condition section shows two modes:
   - **Predefined**: dropdown of curated conditions per indicator (e.g., "RSI crosses above level")
   - **Advanced**: pick output line + operator + value/line
5. Parameter inputs appear dynamically based on selected condition

### Editing Existing Alerts
- Click bell icon on chart (AlertMarker) → opens the inline panel with that alert's settings pre-filled
- Panel footer has Save + Delete

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Alert Slide Panel (UI)                             │
│  - Drawing alerts: condition + value from drawing   │
│  - Indicator alerts: predefined + custom builder    │
│  - Shared: trigger, actions, message                │
└──────────────────────┬──────────────────────────────┘
                       │ save/create/delete
┌──────────────────────▼──────────────────────────────┐
│  AlertService (persistence)                         │
│  - CRUD → Supabase price_alerts table               │
│  - Pub/sub for UI reactivity                        │
└──────────────┬───────────────────┬──────────────────┘
               │                   │
┌──────────────▼──────┐ ┌─────────▼──────────────────┐
│  Frontend Engine    │ │  Backend Monitor            │
│  (browser)          │ │  (Node.js server)           │
│  - WebSocket ticks  │ │  - Polls price_alerts/5s    │
│  - Instant feedback │ │  - Binance stream prices    │
│  - Sound playback   │ │  - Fires when tab closed    │
│  - Toast notifs     │ │  - Writes trigger to DB     │
│  - Drawing-aware    │ │  - Frontend picks up via    │
│                     │ │    Supabase realtime         │
└─────────────────────┘ └────────────────────────────┘
```

## Components to Build/Rewrite

### 1. AlertSlidePanel (NEW)
- **File:** `src/components/market-chart/AlertSlidePanel.tsx`
- Replaces `CreateAlertModal.tsx`
- Slides from right side, adjacent to RightToolbar
- Props: `alert`, `drawing`, `indicator`, `symbol`, `onSave`, `onDelete`, `onClose`
- Two modes: drawing/price alert vs indicator alert
- Indicator mode has Predefined/Advanced toggle
- Renders inside CandlestickChart's layout (not portaled)
- Width: ~280px, pushes chart area narrower when open

### 2. AlertToast (NEW)
- **File:** `src/components/market-chart/AlertToast.tsx`
- Fixed bottom-center, auto-dismisses after 5s
- Shows: check icon + "Alert created" + condition summary
- Two buttons: Customize (opens panel), Dismiss
- Props: `alert`, `onCustomize`, `onDismiss`

### 3. AlertEngine (REWRITE)
- **File:** `src/engine/alertEngine.ts`
- Single clean class (remove dead first `AlertEngine` class)
- Fix: indicator alerts now go through frequency/trigger logic (currently skipped)
- Fix: proper `saveTriggerState` using `updateAlert` instead of `saveAlert`
- Add toast notification dispatch (event emitter pattern)
- Keep: drawing price calculation, channel detection, bar close logic

### 4. AlertService (CLEANUP)
- **File:** `src/services/alertService.ts`
- Remove dead `checkAlertCondition` export
- Remove verbose comments
- Add `createAlertWithDefaults(symbol, drawing)` — auto-generates smart defaults
- Keep: existing CRUD, pub/sub, mock mode, Supabase integration

### 5. Indicator Alert Conditions (NEW)
- **File:** `src/data/indicatorAlertConditions.ts`
- Registry mapping indicator types to predefined alert conditions
- Example:
  ```ts
  RSI: [
    { id: 'rsi-above', name: 'RSI crosses above level', expression: 'crossover(rsi_line, {level})', parameters: [{ name: 'level', default: 70, min: 0, max: 100 }] },
    { id: 'rsi-below', name: 'RSI crosses below level', expression: 'crossunder(rsi_line, {level})', parameters: [{ name: 'level', default: 30 }] },
  ]
  ```
- Covers: RSI, SMA/EMA (cross price), MACD (histogram cross zero, signal cross), Bollinger Bands (price exits bands), Stochastic, ATR

### 6. Backend PriceAlertMonitor (NEW)
- **File:** `backend/server/src/services/priceAlertMonitor.ts`
- Standalone service started in `worker.ts` after signal/execution engines
- Polls `price_alerts` table every 5 seconds for active alerts
- Uses existing `binanceStream` for latest prices
- Evaluation logic mirrors frontend engine (reuse `alertEvaluator.ts`)
- On trigger: updates DB row (triggered, triggered_at, last_triggered_at)
- Frontend picks up changes via Supabase realtime subscription
- Does NOT evaluate drawing alerts (drawings are frontend-only state) — only price-level and indicator alerts

### 7. CandlestickChart Integration (MODIFY)
- Remove `CreateAlertModal` usage
- Add `AlertSlidePanel` to layout (right side, between chart and RightToolbar)
- Add `AlertToast` overlay
- `handleCreateDrawingAlert` → call `createAlertWithDefaults()` → show toast
- `handleCreateIndicatorAlert` → call `createAlertWithDefaults()` → show toast
- `handleEditAlert` → open slide panel with existing alert
- Keep: `feedIndicatorToAlertEngine`, `AlertMarkers`, drawings sync

## Smart Defaults

When one-click creating an alert:
- **Condition:** `Crossing` (or `Entering Channel` for Rectangle/Parallel Channel)
- **Value:** extracted from drawing (horizontal line price, trend line end price, fib level)
- **Trigger:** `Only Once`
- **Notify:** `true`
- **Sound:** `false`
- **Message:** auto-generated: `"{SYMBOL} {Condition} {Price}"`

## Data Model

No schema changes needed — existing `price_alerts` table covers all fields:
- `id`, `user_id`, `symbol`, `condition`, `price`, `drawing_id`, `fib_level`
- `indicator_id`, `alert_condition_id`, `condition_parameters`
- `message`, `notify_app`, `play_sound`, `trigger_frequency`
- `triggered`, `triggered_at`, `created_at`

## What Gets Deleted

- `src/components/CreateAlertModal.tsx` — replaced by AlertSlidePanel
- `src/components/alerts/AlertConditionSelector.tsx` — stub, never worked
- Dead first `AlertEngine` class in alertEngine.ts (lines 22-104)
- `checkAlertCondition` export from alertService.ts

## Out of Scope

- Email/webhook notifications (future)
- Alert history view (future)
- Backend evaluation of drawing-linked alerts (drawings are client-side state)
- Multi-timeframe alerts
