# Alert System Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old TradingView-style alert modal with a Quick Create + Inline Panel UX, rewrite the alert engine to fix bugs, and add a backend price alert monitor.

**Architecture:** One-click alert creation with smart defaults → toast confirmation → optional inline slide panel for customization. Frontend engine evaluates drawing alerts in real-time. Backend monitor evaluates price-level alerts even when browser is closed. Both persist to the same Supabase `price_alerts` table.

**Tech Stack:** React + TypeScript, Tailwind CSS, Supabase, Node.js backend, Binance WebSocket streams

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| CREATE | `src/data/indicatorAlertConditions.ts` | Registry of predefined alert conditions per indicator type |
| CREATE | `src/components/market-chart/AlertToast.tsx` | Toast notification for alert creation confirmation |
| CREATE | `src/components/market-chart/AlertSlidePanel.tsx` | Inline side panel for alert customization |
| CREATE | `backend/server/src/services/priceAlertMonitor.ts` | Backend price alert polling service |
| REWRITE | `src/engine/alertEngine.ts` | Clean single-class engine with fixed frequency logic |
| MODIFY | `src/services/alertService.ts` | Add `createAlertWithDefaults()`, remove dead code |
| MODIFY | `src/components/market-chart/CandlestickChart.tsx` | Replace modal with toast+panel, rewire handlers |
| MODIFY | `src/components/market-chart/ContextMenu.tsx` | Update drawing alert action for one-click create |
| MODIFY | `backend/server/src/worker.ts` | Start priceAlertMonitor |
| DELETE | `src/components/CreateAlertModal.tsx` | Replaced by AlertSlidePanel |
| DELETE | `src/components/alerts/AlertConditionSelector.tsx` | Stub, never worked |

---

### Task 1: Indicator Alert Conditions Registry

**Files:**
- Create: `src/data/indicatorAlertConditions.ts`

- [ ] **Step 1: Create the alert conditions registry**

```typescript
// src/data/indicatorAlertConditions.ts

export interface AlertConditionParameter {
    name: string;
    default: number;
    min?: number;
    max?: number;
}

export interface AlertConditionDef {
    id: string;
    name: string;
    expression: string;
    parameters: AlertConditionParameter[];
}

export const indicatorAlertConditions: Record<string, AlertConditionDef[]> = {
    RSI: [
        {
            id: 'rsi-crosses-above',
            name: 'RSI crosses above level',
            expression: 'crossover(rsi_line, {level})',
            parameters: [{ name: 'level', default: 70, min: 0, max: 100 }],
        },
        {
            id: 'rsi-crosses-below',
            name: 'RSI crosses below level',
            expression: 'crossunder(rsi_line, {level})',
            parameters: [{ name: 'level', default: 30, min: 0, max: 100 }],
        },
        {
            id: 'rsi-above',
            name: 'RSI above level',
            expression: 'rsi_line > {level}',
            parameters: [{ name: 'level', default: 70, min: 0, max: 100 }],
        },
        {
            id: 'rsi-below',
            name: 'RSI below level',
            expression: 'rsi_line < {level}',
            parameters: [{ name: 'level', default: 30, min: 0, max: 100 }],
        },
    ],
    MA: [
        {
            id: 'ma-cross-above-price',
            name: 'Price crosses above MA',
            expression: 'crossover(close, ma_line)',
            parameters: [],
        },
        {
            id: 'ma-cross-below-price',
            name: 'Price crosses below MA',
            expression: 'crossunder(close, ma_line)',
            parameters: [],
        },
    ],
    EMA: [
        {
            id: 'ema-cross-above-price',
            name: 'Price crosses above EMA',
            expression: 'crossover(close, ema_line)',
            parameters: [],
        },
        {
            id: 'ema-cross-below-price',
            name: 'Price crosses below EMA',
            expression: 'crossunder(close, ema_line)',
            parameters: [],
        },
    ],
    MACD: [
        {
            id: 'macd-cross-signal',
            name: 'MACD crosses above Signal',
            expression: 'crossover(macd_line, signal_line)',
            parameters: [],
        },
        {
            id: 'macd-cross-below-signal',
            name: 'MACD crosses below Signal',
            expression: 'crossunder(macd_line, signal_line)',
            parameters: [],
        },
        {
            id: 'macd-hist-above-zero',
            name: 'Histogram crosses above zero',
            expression: 'crossover(histogram, 0)',
            parameters: [],
        },
        {
            id: 'macd-hist-below-zero',
            name: 'Histogram crosses below zero',
            expression: 'crossunder(histogram, 0)',
            parameters: [],
        },
    ],
    BB: [
        {
            id: 'bb-price-above-upper',
            name: 'Price crosses above upper band',
            expression: 'crossover(close, upper_band)',
            parameters: [],
        },
        {
            id: 'bb-price-below-lower',
            name: 'Price crosses below lower band',
            expression: 'crossunder(close, lower_band)',
            parameters: [],
        },
    ],
    STOCH: [
        {
            id: 'stoch-k-above',
            name: '%K crosses above level',
            expression: 'crossover(k_line, {level})',
            parameters: [{ name: 'level', default: 80, min: 0, max: 100 }],
        },
        {
            id: 'stoch-k-below',
            name: '%K crosses below level',
            expression: 'crossunder(k_line, {level})',
            parameters: [{ name: 'level', default: 20, min: 0, max: 100 }],
        },
    ],
    ATR: [
        {
            id: 'atr-above',
            name: 'ATR above level',
            expression: 'atr_line > {level}',
            parameters: [{ name: 'level', default: 1.0 }],
        },
        {
            id: 'atr-below',
            name: 'ATR below level',
            expression: 'atr_line < {level}',
            parameters: [{ name: 'level', default: 0.5 }],
        },
    ],
};

/** Get conditions for an indicator type, with fallback. */
export function getAlertConditions(indicatorType: string): AlertConditionDef[] {
    return indicatorAlertConditions[indicatorType] || [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/indicatorAlertConditions.ts
git commit -m "feat(alerts): add indicator alert conditions registry"
```

---

### Task 2: AlertService — Add Smart Defaults & Cleanup

**Files:**
- Modify: `src/services/alertService.ts`

- [ ] **Step 1: Add createAlertWithDefaults function and remove dead code**

At the top of the file, add the import:
```typescript
import { Drawing, HorizontalLineDrawing, TrendLineDrawing, RayDrawing, FibonacciRetracementDrawing, AlertConditionType } from '../components/market-chart/types';
```

Add this function before the `checkAlertCondition` function (around line 230):

```typescript
/**
 * One-click alert creation with smart defaults.
 * Extracts price from drawing, sets sensible defaults.
 */
export const createAlertWithDefaults = async (
    symbol: string,
    drawing?: Drawing,
    indicatorId?: string,
    indicatorType?: string,
    alertConditionId?: string,
    conditionParameters?: Record<string, any>,
): Promise<PriceAlert | null> => {
    let condition: AlertConditionType = 'Crossing';
    let price = 0;
    let drawingId: string | undefined;
    let fibLevel: number | undefined;

    if (drawing) {
        drawingId = drawing.id;
        switch (drawing.type) {
            case 'Horizontal Line':
                price = (drawing as HorizontalLineDrawing).price;
                break;
            case 'Trend Line':
            case 'Ray':
                price = (drawing as TrendLineDrawing | RayDrawing).end.price;
                break;
            case 'Fibonacci Retracement': {
                const fib = drawing as FibonacciRetracementDrawing;
                fibLevel = 0.618;
                price = fib.start.price + (fib.end.price - fib.start.price) * fibLevel;
                break;
            }
            case 'Rectangle':
            case 'Parallel Channel':
                condition = 'Entering Channel';
                break;
        }
    }

    const priceStr = price ? price.toFixed(5) : '';
    let message = '';
    if (indicatorType && alertConditionId) {
        message = `${symbol} ${indicatorType} alert`;
    } else if (drawing?.type === 'Rectangle' || drawing?.type === 'Parallel Channel') {
        message = `${symbol} ${condition} ${drawing.type}`;
    } else {
        message = `${symbol} Price ${condition} ${priceStr}`;
    }

    return createAlert({
        symbol,
        condition,
        value: price || undefined,
        drawingId,
        fibLevel,
        message,
        notifyApp: true,
        playSound: false,
        triggerFrequency: 'Only Once',
        indicatorId,
        alertConditionId,
        conditionParameters,
    });
};
```

- [ ] **Step 2: Remove dead checkAlertCondition function**

Delete lines 235-250 (the `checkAlertCondition` function and its export).

- [ ] **Step 3: Commit**

```bash
git add src/services/alertService.ts
git commit -m "feat(alerts): add createAlertWithDefaults, remove dead code"
```

---

### Task 3: AlertToast Component

**Files:**
- Create: `src/components/market-chart/AlertToast.tsx`

- [ ] **Step 1: Create the toast component**

```typescript
// src/components/market-chart/AlertToast.tsx
import React, { useEffect } from 'react';
import { PriceAlert } from './types';

interface AlertToastProps {
    alert: PriceAlert;
    onCustomize: () => void;
    onDismiss: () => void;
}

const AlertToast: React.FC<AlertToastProps> = ({ alert, onCustomize, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    const conditionText = alert.value
        ? `${alert.condition} ${alert.value.toFixed(5)}`
        : alert.condition;

    return (
        <div
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-3 py-2.5 rounded-xl border shadow-lg"
            style={{
                background: '#131315',
                borderColor: 'rgba(196,181,240,0.12)',
                boxShadow: '0 12px 40px -8px rgba(0,0,0,0.7)',
                animation: 'alertToastIn 0.35s ease',
            }}
        >
            {/* Check icon */}
            <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(52,211,153,0.1)' }}
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>

            {/* Text */}
            <div>
                <div className="text-xs font-semibold text-[#e8e8e8]">Alert created</div>
                <div className="text-[10px] text-[#555] mt-0.5">
                    {alert.symbol} — {conditionText}
                </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-1 ml-2">
                <button
                    onClick={onCustomize}
                    className="px-3 py-1 rounded-md text-[10px] font-semibold transition-colors"
                    style={{
                        background: 'rgba(196,181,240,0.1)',
                        color: '#c4b5f0',
                    }}
                    onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'rgba(196,181,240,0.18)')
                    }
                    onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'rgba(196,181,240,0.1)')
                    }
                >
                    Customize
                </button>
                <button
                    onClick={onDismiss}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold text-[#444] hover:text-[#888] transition-colors"
                >
                    Dismiss
                </button>
            </div>

            <style>{`
                @keyframes alertToastIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default AlertToast;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/market-chart/AlertToast.tsx
git commit -m "feat(alerts): add AlertToast component"
```

---

### Task 4: AlertSlidePanel Component

**Files:**
- Create: `src/components/market-chart/AlertSlidePanel.tsx`

- [ ] **Step 1: Create the slide panel component**

```typescript
// src/components/market-chart/AlertSlidePanel.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    PriceAlert,
    AlertConditionType,
    Drawing,
    FibonacciRetracementDrawing,
} from './types';
import { FIB_LEVELS } from './constants';
import {
    getAlertConditions,
    AlertConditionDef,
} from '../../data/indicatorAlertConditions';

type TriggerFreq = PriceAlert['triggerFrequency'];

interface AlertSlidePanelProps {
    alert: PriceAlert;
    drawing?: Drawing | null;
    symbol: string;
    indicatorId?: string;
    indicatorType?: string;
    /** Output line names from indicator.data keys */
    indicatorOutputs?: string[];
    onSave: (updated: PriceAlert) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

const CONDITION_OPTIONS: AlertConditionType[] = [
    'Crossing',
    'Crossing Up',
    'Crossing Down',
    'Greater Than',
    'Less Than',
];
const CHANNEL_OPTIONS: AlertConditionType[] = ['Entering Channel', 'Exiting Channel'];
const TRIGGERS: { label: string; value: TriggerFreq }[] = [
    { label: 'Only once', value: 'Only Once' },
    { label: 'Once per bar', value: 'Once Per Bar' },
    { label: 'On bar close', value: 'Once Per Bar Close' },
    { label: 'Once per minute', value: 'Once Per Minute' },
];

const AlertSlidePanel: React.FC<AlertSlidePanelProps> = ({
    alert: initialAlert,
    drawing,
    symbol,
    indicatorId,
    indicatorType,
    indicatorOutputs = [],
    onSave,
    onDelete,
    onClose,
}) => {
    const isIndicatorAlert = !!indicatorId && !!indicatorType;
    const isChannelDrawing =
        drawing?.type === 'Rectangle' || drawing?.type === 'Parallel Channel';

    // Local state from alert
    const [condition, setCondition] = useState<AlertConditionType>(initialAlert.condition);
    const [value, setValue] = useState(initialAlert.value ?? 0);
    const [fibLevel, setFibLevel] = useState(initialAlert.fibLevel);
    const [trigger, setTrigger] = useState<TriggerFreq>(initialAlert.triggerFrequency);
    const [notifyApp, setNotifyApp] = useState(initialAlert.notifyApp);
    const [playSound, setPlaySound] = useState(initialAlert.playSound);
    const [message, setMessage] = useState(initialAlert.message);

    // Indicator alert state
    const [indicatorMode, setIndicatorMode] = useState<'predefined' | 'advanced'>('predefined');
    const [selectedConditionId, setSelectedConditionId] = useState(
        initialAlert.alertConditionId || ''
    );
    const [condParams, setCondParams] = useState<Record<string, any>>(
        initialAlert.conditionParameters || {}
    );
    // Advanced mode state
    const [advOutput, setAdvOutput] = useState(indicatorOutputs[0] || '');
    const [advOperator, setAdvOperator] = useState<AlertConditionType>('Crossing');
    const [advValue, setAdvValue] = useState(0);

    const conditions = useMemo(
        () => (isIndicatorAlert ? getAlertConditions(indicatorType!) : []),
        [isIndicatorAlert, indicatorType]
    );

    const selectedCondDef = useMemo(
        () => conditions.find((c) => c.id === selectedConditionId),
        [conditions, selectedConditionId]
    );

    // Init predefined condition
    useEffect(() => {
        if (isIndicatorAlert && conditions.length > 0 && !selectedConditionId) {
            const first = conditions[0];
            setSelectedConditionId(first.id);
            const params: Record<string, any> = {};
            first.parameters.forEach((p) => (params[p.name] = p.default));
            setCondParams(params);
        }
    }, [isIndicatorAlert, conditions, selectedConditionId]);

    const handleSave = () => {
        const updated: PriceAlert = {
            ...initialAlert,
            condition,
            value: isChannelDrawing ? undefined : value,
            fibLevel,
            triggerFrequency: trigger,
            notifyApp,
            playSound,
            message,
        };

        if (isIndicatorAlert) {
            if (indicatorMode === 'predefined') {
                updated.indicatorId = indicatorId;
                updated.alertConditionId = selectedConditionId;
                updated.conditionParameters = condParams;
            } else {
                // Advanced: build expression from selections
                const expr = `${advOutput} ${advOperator === 'Crossing' ? '==' : advOperator === 'Greater Than' ? '>' : '<'} ${advValue}`;
                updated.indicatorId = indicatorId;
                updated.alertConditionId = `custom-${Date.now()}`;
                updated.conditionParameters = {
                    _expression: expr,
                    output: advOutput,
                    operator: advOperator,
                    value: advValue,
                };
            }
        }

        onSave(updated);
    };

    const conditionOptions = isChannelDrawing ? CHANNEL_OPTIONS : CONDITION_OPTIONS;

    return (
        <div
            className="flex flex-col h-full border-l"
            style={{
                width: 280,
                minWidth: 280,
                background: '#0d0d0f',
                borderColor: 'rgba(255,255,255,0.04)',
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{
                    background: 'rgba(255,255,255,0.01)',
                    borderColor: 'rgba(255,255,255,0.04)',
                }}
            >
                <div className="flex items-center gap-2">
                    <div
                        className="w-6 h-6 rounded-md flex items-center justify-center"
                        style={{ background: 'rgba(196,181,240,0.08)' }}
                    >
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#c4b5f0"
                            strokeWidth="2"
                        >
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </div>
                    <span className="text-xs font-semibold text-[#e8e8e8]">{symbol}</span>
                    <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                        style={{
                            color: '#888',
                            background: 'rgba(255,255,255,0.04)',
                        }}
                    >
                        {isIndicatorAlert ? indicatorType : drawing?.type || 'Price'}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="w-5 h-5 flex items-center justify-center rounded text-[#444] hover:text-[#aaa] text-sm"
                >
                    &times;
                </button>
            </div>

            {/* Body */}
            <div
                className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3.5"
                style={{ scrollbarWidth: 'none' }}
            >
                {/* Condition Section */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[#2e2e32] mb-1.5">
                        Condition
                    </div>

                    {isIndicatorAlert ? (
                        <>
                            {/* Mode switch */}
                            <div className="flex gap-0 mb-2">
                                {(['predefined', 'advanced'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setIndicatorMode(mode)}
                                        className={`flex-1 py-1.5 text-[11px] font-medium border transition-colors ${
                                            mode === 'predefined'
                                                ? 'rounded-l-md'
                                                : 'rounded-r-md'
                                        } ${
                                            indicatorMode === mode
                                                ? 'bg-[rgba(196,181,240,0.08)] text-[#c4b5f0] border-[rgba(196,181,240,0.15)]'
                                                : 'bg-[rgba(255,255,255,0.03)] text-[#555] border-[rgba(255,255,255,0.06)]'
                                        }`}
                                    >
                                        {mode === 'predefined' ? 'Predefined' : 'Advanced'}
                                    </button>
                                ))}
                            </div>

                            {indicatorMode === 'predefined' ? (
                                <div
                                    className="rounded-lg p-2.5 flex flex-col gap-2 border"
                                    style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        borderColor: 'rgba(255,255,255,0.05)',
                                    }}
                                >
                                    <select
                                        className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[11.5px] text-[#ccc] appearance-none cursor-pointer"
                                        value={selectedConditionId}
                                        onChange={(e) => {
                                            setSelectedConditionId(e.target.value);
                                            const def = conditions.find(
                                                (c) => c.id === e.target.value
                                            );
                                            if (def) {
                                                const p: Record<string, any> = {};
                                                def.parameters.forEach(
                                                    (param) =>
                                                        (p[param.name] = param.default)
                                                );
                                                setCondParams(p);
                                            }
                                        }}
                                    >
                                        {conditions.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedCondDef?.parameters.map((p) => (
                                        <div
                                            key={p.name}
                                            className="flex items-center gap-2"
                                        >
                                            <span className="text-[10.5px] text-[#555] font-medium min-w-[36px]">
                                                {p.name}
                                            </span>
                                            <input
                                                type="number"
                                                className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-[11.5px] text-white font-mono w-16 text-center"
                                                value={condParams[p.name] ?? p.default}
                                                min={p.min}
                                                max={p.max}
                                                onChange={(e) =>
                                                    setCondParams((prev) => ({
                                                        ...prev,
                                                        [p.name]: parseFloat(
                                                            e.target.value
                                                        ),
                                                    }))
                                                }
                                            />
                                        </div>
                                    ))}
                                    {selectedCondDef && (
                                        <div className="text-[10px] text-[#444] mt-1">
                                            {selectedCondDef.name}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div
                                    className="rounded-lg p-2.5 flex flex-col gap-2 border"
                                    style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        borderColor: 'rgba(255,255,255,0.05)',
                                    }}
                                >
                                    <div className="flex gap-1.5">
                                        <select
                                            className="flex-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[11.5px] text-[#ccc] appearance-none"
                                            value={advOutput}
                                            onChange={(e) => setAdvOutput(e.target.value)}
                                        >
                                            {indicatorOutputs.map((o) => (
                                                <option key={o} value={o}>
                                                    {o}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[11.5px] text-[#ccc] appearance-none"
                                            value={advOperator}
                                            onChange={(e) =>
                                                setAdvOperator(
                                                    e.target.value as AlertConditionType
                                                )
                                            }
                                        >
                                            {CONDITION_OPTIONS.map((o) => (
                                                <option key={o} value={o}>
                                                    {o}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <input
                                        type="number"
                                        className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[11.5px] text-white font-mono w-full"
                                        value={advValue}
                                        onChange={(e) =>
                                            setAdvValue(parseFloat(e.target.value))
                                        }
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <select
                                className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg px-2.5 py-2 text-[11.5px] text-[#ccc] appearance-none cursor-pointer"
                                value={condition}
                                onChange={(e) =>
                                    setCondition(e.target.value as AlertConditionType)
                                }
                            >
                                {conditionOptions.map((o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ))}
                            </select>
                            {!isChannelDrawing && (
                                <input
                                    type="number"
                                    step="0.00001"
                                    className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg px-2.5 py-2 text-xs text-white font-mono"
                                    value={value}
                                    onChange={(e) => setValue(parseFloat(e.target.value))}
                                />
                            )}
                            {drawing?.type === 'Fibonacci Retracement' && (
                                <select
                                    className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg px-2.5 py-2 text-[11.5px] text-[#ccc] appearance-none"
                                    value={fibLevel}
                                    onChange={(e) => {
                                        const lvl = parseFloat(e.target.value);
                                        setFibLevel(lvl);
                                        const fib = drawing as FibonacciRetracementDrawing;
                                        setValue(
                                            fib.start.price +
                                                (fib.end.price - fib.start.price) * lvl
                                        );
                                    }}
                                >
                                    {FIB_LEVELS.map((l) => (
                                        <option key={l} value={l}>
                                            Fib {l}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}
                </div>

                {/* Trigger Section */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[#2e2e32] mb-1.5">
                        Trigger
                    </div>
                    <div className="flex flex-col gap-0.5">
                        {TRIGGERS.map((t) => (
                            <button
                                key={t.value}
                                onClick={() => setTrigger(t.value)}
                                className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                                    trigger === t.value
                                        ? 'bg-[rgba(196,181,240,0.06)] text-[#c4b5f0]'
                                        : 'text-[#3e3e42] hover:text-[#888] hover:bg-[rgba(255,255,255,0.015)]'
                                }`}
                            >
                                <div
                                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                        trigger === t.value
                                            ? 'bg-[#c4b5f0] shadow-[0_0_6px_rgba(196,181,240,0.4)]'
                                            : 'bg-[#2a2a2e]'
                                    }`}
                                />
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions Section */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[#2e2e32] mb-1.5">
                        Actions
                    </div>
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => setNotifyApp((v) => !v)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10.5px] font-medium border transition-colors ${
                                notifyApp
                                    ? 'bg-[rgba(196,181,240,0.06)] text-[#c4b5f0] border-[rgba(196,181,240,0.12)]'
                                    : 'bg-[rgba(255,255,255,0.015)] text-[#3e3e42] border-[rgba(255,255,255,0.03)]'
                            }`}
                        >
                            <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                            Notify
                        </button>
                        <button
                            onClick={() => setPlaySound((v) => !v)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10.5px] font-medium border transition-colors ${
                                playSound
                                    ? 'bg-[rgba(196,181,240,0.06)] text-[#c4b5f0] border-[rgba(196,181,240,0.12)]'
                                    : 'bg-[rgba(255,255,255,0.015)] text-[#3e3e42] border-[rgba(255,255,255,0.03)]'
                            }`}
                        >
                            <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                            Sound
                        </button>
                    </div>
                </div>

                {/* Message Section */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[#2e2e32] mb-1.5">
                        Message
                    </div>
                    <textarea
                        rows={2}
                        className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] rounded-lg px-2.5 py-2 text-[10.5px] text-[#555] resize-none focus:border-[rgba(196,181,240,0.15)] focus:text-[#aaa] focus:outline-none"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                    />
                </div>
            </div>

            {/* Footer */}
            <div
                className="flex gap-1.5 px-4 py-3 border-t"
                style={{ borderColor: 'rgba(255,255,255,0.04)' }}
            >
                <button
                    onClick={() => onDelete(initialAlert.id)}
                    className="px-3 py-2 rounded-lg text-[#444] hover:text-[#ef4444] transition-colors"
                    title="Delete alert"
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
                <button
                    onClick={handleSave}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                    style={{ background: '#c4b5f0', color: '#111' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#d4c8f5')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#c4b5f0')}
                >
                    Save Changes
                </button>
            </div>
        </div>
    );
};

export default AlertSlidePanel;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/market-chart/AlertSlidePanel.tsx
git commit -m "feat(alerts): add AlertSlidePanel inline side panel"
```

---

### Task 5: Rewrite AlertEngine

**Files:**
- Rewrite: `src/engine/alertEngine.ts`

- [ ] **Step 1: Rewrite the entire file with a single clean class**

The key fixes:
1. Remove the dead first `AlertEngine` class (lines 22-104)
2. Move the trigger frequency logic OUTSIDE the `if (!alert.indicatorId)` block so indicator alerts also get frequency-gated
3. Use `updateAlert` instead of `saveAlert` for trigger state
4. Add event emitter for toast notifications

```typescript
// src/engine/alertEngine.ts
import {
    PriceAlert,
    Drawing,
    TrendLineDrawing,
    RayDrawing,
    HorizontalLineDrawing,
    HorizontalRayDrawing,
    ParallelChannelDrawing,
    RectangleDrawing,
} from '../components/market-chart/types';
import { marketRealtimeService } from '../services/marketRealtimeService';
import {
    getAlerts,
    updateAlert,
    subscribe as subscribeToAlerts,
} from '../services/alertService';
import { evaluateExpression, EvaluationContext } from './expressionEvaluator';

type AlertTriggerListener = (alert: PriceAlert) => void;

class AlertEngine {
    private activeAlerts: PriceAlert[] = [];
    private drawings: Drawing[] = [];
    private activeSubscriptions: Map<string, (data: any) => void> = new Map();
    private isRunning = false;
    private processingAlerts: Set<string> = new Set();
    private unsubscribeAlerts: (() => void) | null = null;

    // Indicator support
    private indicatorValues: Map<string, Record<string, number | null>> = new Map();
    private previousIndicatorValues: Map<string, Record<string, number | null>> = new Map();
    private indicatorDefinitions: Map<string, any> = new Map();

    // Price tracking
    private lastPrices: Map<string, number> = new Map();
    private lastBarMinutes: Map<string, number> = new Map();
    private lastBarClosePrices: Map<string, number> = new Map();

    // Trigger notification listeners
    private triggerListeners: Set<AlertTriggerListener> = new Set();

    public onTrigger(listener: AlertTriggerListener): () => void {
        this.triggerListeners.add(listener);
        return () => this.triggerListeners.delete(listener);
    }

    private notifyTrigger(alert: PriceAlert) {
        this.triggerListeners.forEach((l) => l(alert));
    }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.unsubscribeAlerts = subscribeToAlerts(() => this.reloadAlerts());
        await this.reloadAlerts();
    }

    public stop() {
        this.isRunning = false;
        this.activeAlerts = [];
        this.unsubscribeAll();
        if (this.unsubscribeAlerts) {
            this.unsubscribeAlerts();
            this.unsubscribeAlerts = null;
        }
    }

    public setDrawings(drawings: Drawing[]) {
        this.drawings = drawings;
    }

    public setIndicatorValues(indicatorId: string, values: Record<string, number | null>) {
        const current = this.indicatorValues.get(indicatorId);
        if (current) {
            this.previousIndicatorValues.set(indicatorId, { ...current });
        }
        this.indicatorValues.set(indicatorId, values);
    }

    public setIndicatorDefinition(indicatorId: string, definition: any) {
        this.indicatorDefinitions.set(indicatorId, definition);
    }

    public async reloadAlerts() {
        if (!this.isRunning) return;
        try {
            const alerts = await getAlerts();
            this.activeAlerts = alerts.filter((a) => !a.triggered);
            this.updateSubscriptions();
        } catch (error) {
            console.error('[AlertEngine] Failed to reload:', error);
        }
    }

    private updateSubscriptions() {
        const needed = new Set(this.activeAlerts.map((a) => a.symbol.toUpperCase()));

        for (const [sym, cb] of this.activeSubscriptions) {
            if (!needed.has(sym)) {
                marketRealtimeService.unsubscribeFromTicker(sym, cb);
                this.activeSubscriptions.delete(sym);
            }
        }

        for (const sym of needed) {
            if (!this.activeSubscriptions.has(sym)) {
                const cb = (data: { price: number }) => this.evaluate(sym, data.price);
                this.activeSubscriptions.set(sym, cb);
                marketRealtimeService.subscribeToTicker(sym, cb);
            }
        }
    }

    private unsubscribeAll() {
        for (const [sym, cb] of this.activeSubscriptions) {
            marketRealtimeService.unsubscribeFromTicker(sym, cb);
        }
        this.activeSubscriptions.clear();
    }

    // ── Price extraction for drawings ──

    private getPriceAtTime(drawing: Drawing, time: number): number | null {
        if (drawing.type === 'Horizontal Line') {
            return (drawing as HorizontalLineDrawing).price;
        }
        if (drawing.type === 'Horizontal Ray') {
            const d = drawing as HorizontalRayDrawing;
            return d.start && time >= d.start.time ? d.start.price : null;
        }
        if (drawing.type === 'Trend Line' || drawing.type === 'Ray') {
            const d = drawing as TrendLineDrawing | RayDrawing;
            if (!d.start || !d.end) return null;
            const dt = d.end.time - d.start.time;
            if (dt === 0) return null;
            if (drawing.type === 'Trend Line') {
                const minT = Math.min(d.start.time, d.end.time);
                const maxT = Math.max(d.start.time, d.end.time);
                if (time < minT || time > maxT) return null;
            } else if (time < d.start.time) {
                return null;
            }
            return d.start.price + ((d.end.price - d.start.price) / dt) * (time - d.start.time);
        }
        return null;
    }

    private getPriceRangeAtTime(
        drawing: Drawing,
        time: number
    ): { min: number; max: number } | null {
        if (drawing.type === 'Rectangle') {
            const d = drawing as RectangleDrawing;
            const minT = Math.min(d.start.time, d.end.time);
            const maxT = Math.max(d.start.time, d.end.time);
            if (time < minT || time > maxT) return null;
            return {
                min: Math.min(d.start.price, d.end.price),
                max: Math.max(d.start.price, d.end.price),
            };
        }
        if (drawing.type === 'Parallel Channel') {
            const d = drawing as ParallelChannelDrawing;
            const dt = d.end.time - d.start.time;
            if (dt === 0) return null;
            const slope = (d.end.price - d.start.price) / dt;
            const tDelta = time - d.start.time;
            const p1 = d.start.price + slope * tDelta;
            const p2 = d.p2.price + slope * (time - d.p2.time);
            return { min: Math.min(p1, p2), max: Math.max(p1, p2) };
        }
        return null;
    }

    // ── Main evaluation ──

    private async evaluate(symbol: string, currentPrice: number) {
        if (!this.isRunning) return;

        const prevPrice = this.lastPrices.get(symbol);
        this.lastPrices.set(symbol, currentPrice);

        // Bar close detection
        const nowMinute = Math.floor(Date.now() / 60000);
        const lastMinute = this.lastBarMinutes.get(symbol);

        if (lastMinute === undefined) {
            this.lastBarMinutes.set(symbol, nowMinute);
            this.lastBarClosePrices.set(symbol, currentPrice);
        }

        if (lastMinute !== undefined && nowMinute > lastMinute) {
            const closedPrice = prevPrice ?? currentPrice;
            const prevClosedPrice = this.lastBarClosePrices.get(symbol);
            const barCloseAlerts = this.activeAlerts.filter(
                (a) =>
                    a.symbol.toUpperCase() === symbol &&
                    !a.triggered &&
                    a.triggerFrequency === 'Once Per Bar Close'
            );
            for (const alert of barCloseAlerts) {
                this.evaluateAlert(alert, symbol, closedPrice, prevClosedPrice);
            }
            this.lastBarClosePrices.set(symbol, closedPrice);
            this.lastBarMinutes.set(symbol, nowMinute);
        }

        // Standard alerts (non bar-close)
        const standardAlerts = this.activeAlerts.filter(
            (a) =>
                a.symbol.toUpperCase() === symbol &&
                !a.triggered &&
                a.triggerFrequency !== 'Once Per Bar Close'
        );
        for (const alert of standardAlerts) {
            this.evaluateAlert(alert, symbol, currentPrice, prevPrice);
        }
    }

    private async evaluateAlert(
        alert: PriceAlert,
        symbol: string,
        currentPrice: number,
        prevPrice: number | undefined
    ) {
        if (this.processingAlerts.has(alert.id)) return;

        let shouldTrigger = false;

        // ── Indicator alert ──
        if (alert.indicatorId && alert.alertConditionId) {
            const def = this.indicatorDefinitions.get(alert.indicatorId);
            const currentVals = this.indicatorValues.get(alert.indicatorId);
            if (!def || !currentVals) return;

            const alertCond = def.alertConditions?.find(
                (ac: any) => ac.id === alert.alertConditionId
            );
            if (!alertCond) return;

            const context: EvaluationContext = {
                indicatorValues: currentVals,
                priceData: { open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice },
                previousIndicatorValues: this.previousIndicatorValues.get(alert.indicatorId),
                previousPriceData: prevPrice
                    ? { open: prevPrice, high: prevPrice, low: prevPrice, close: prevPrice }
                    : undefined,
                parameters: alert.conditionParameters,
            };

            try {
                shouldTrigger = evaluateExpression(alertCond.expression, context);
            } catch {
                return;
            }
        }
        // ── Price / Drawing alert ──
        else {
            shouldTrigger = this.evaluatePriceCondition(alert, currentPrice, prevPrice);
        }

        // ── Frequency gate (applies to ALL alert types) ──
        if (shouldTrigger) {
            const now = Date.now();
            const lastTrigger = alert.lastTriggeredAt || 0;
            let actualTrigger = false;
            let shouldDisable = false;

            switch (alert.triggerFrequency) {
                case 'Only Once':
                    actualTrigger = true;
                    shouldDisable = true;
                    break;
                case 'Once Per Minute':
                case 'Once Per Bar':
                    actualTrigger = now - lastTrigger >= 60000;
                    break;
                case 'Once Per Bar Close':
                    actualTrigger = true;
                    break;
            }

            if (actualTrigger) {
                this.processingAlerts.add(alert.id);

                if (shouldDisable) alert.triggered = true;
                alert.lastTriggeredAt = now;

                if (alert.playSound) this.playAlertSound();

                this.notifyTrigger(alert);

                try {
                    await updateAlert(alert.id, {
                        triggered: alert.triggered,
                        lastTriggeredAt: now,
                    });
                } catch (e) {
                    console.error('[AlertEngine] Failed to save trigger state:', e);
                }

                this.processingAlerts.delete(alert.id);

                if (shouldDisable) {
                    this.activeAlerts = this.activeAlerts.filter((a) => a.id !== alert.id);
                }
            }
        }
    }

    private evaluatePriceCondition(
        alert: PriceAlert,
        currentPrice: number,
        prevPrice: number | undefined
    ): boolean {
        // Static price alerts
        if (!alert.drawingId) {
            return this.checkCondition(alert.condition, currentPrice, prevPrice, alert.value);
        }

        // Drawing-linked alerts
        const drawing = this.drawings.find((d) => d.id === alert.drawingId);
        if (!drawing) return false;

        const evalTime = Math.floor(Date.now() / 1000);

        // Channel conditions
        if (alert.condition === 'Entering Channel' || alert.condition === 'Exiting Channel') {
            const range = this.getPriceRangeAtTime(drawing, evalTime);
            if (!range || prevPrice === undefined) return false;
            const isInside = currentPrice >= range.min && currentPrice <= range.max;
            const wasInside = prevPrice >= range.min && prevPrice <= range.max;
            return alert.condition === 'Entering Channel'
                ? !wasInside && isInside
                : wasInside && !isInside;
        }

        // Line-based conditions
        const targetPrice = this.getPriceAtTime(drawing, evalTime);
        if (targetPrice === null) return false;
        return this.checkCondition(alert.condition, currentPrice, prevPrice, targetPrice);
    }

    private checkCondition(
        condition: AlertConditionType,
        current: number,
        prev: number | undefined,
        target: number | undefined
    ): boolean {
        if (target === undefined) return false;
        switch (condition) {
            case 'Greater Than':
                return current > target;
            case 'Less Than':
                return current < target;
            case 'Crossing':
                return prev !== undefined &&
                    ((prev < target && current >= target) ||
                     (prev > target && current <= target));
            case 'Crossing Up':
                return prev !== undefined && prev < target && current >= target;
            case 'Crossing Down':
                return prev !== undefined && prev > target && current <= target;
            default:
                return false;
        }
    }

    private playAlertSound() {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch {}
    }
}

export const alertEngine = new AlertEngine();
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/alertEngine.ts
git commit -m "refactor(alerts): rewrite AlertEngine as single clean class with fixed frequency logic"
```

---

### Task 6: CandlestickChart Integration

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

This is the wiring task — connect the new components.

- [ ] **Step 1: Update imports**

Replace the CreateAlertModal import (line 4) with the new components:

```typescript
import AlertToast from './AlertToast';
import AlertSlidePanel from './AlertSlidePanel';
```

Add the alertService import if not already present:
```typescript
import { createAlertWithDefaults, updateAlert, deleteAlert } from '../../services/alertService';
```

- [ ] **Step 2: Replace alertModalInfo state with new state**

Replace the `alertModalInfo` state (lines 463-469) with:

```typescript
const [toastAlert, setToastAlert] = useState<PriceAlert | null>(null);
const [panelAlert, setPanelAlert] = useState<{
    alert: PriceAlert;
    drawing?: Drawing | null;
    indicatorId?: string;
    indicatorType?: string;
    indicatorOutputs?: string[];
} | null>(null);
```

- [ ] **Step 3: Rewrite handleCreateDrawingAlert**

Replace the function at lines 3936-3948 with:

```typescript
const handleCreateDrawingAlert = async (drawing: Drawing) => {
    // Check for existing alert on this drawing
    const existing = alerts.find((a) => a.drawingId === drawing.id);
    if (existing) {
        // Open panel to edit
        setPanelAlert({ alert: existing, drawing });
        return;
    }
    const newAlert = await createAlertWithDefaults(symbol, drawing);
    if (newAlert) {
        setAlerts((prev) => [...prev, newAlert]);
        setToastAlert(newAlert);
    }
};
```

- [ ] **Step 4: Rewrite handleCreateIndicatorAlert**

Replace the function at lines 1624-1631 with:

```typescript
const handleCreateIndicatorAlert = async (indicator: any) => {
    const conditions = (await import('../../data/indicatorAlertConditions')).getAlertConditions(indicator.type);
    const firstCond = conditions[0];
    const params: Record<string, any> = {};
    firstCond?.parameters.forEach((p: any) => (params[p.name] = p.default));

    const newAlert = await createAlertWithDefaults(
        symbol,
        undefined,
        indicator.id,
        indicator.type,
        firstCond?.id,
        params
    );
    if (newAlert) {
        setAlerts((prev) => [...prev, newAlert]);
        setToastAlert(newAlert);
    }
};
```

- [ ] **Step 5: Rewrite handleCreateAlertFromModal → handleSaveAlert**

Replace the function at lines 3950-4006 with:

```typescript
const handleSaveAlert = async (updated: PriceAlert) => {
    const result = await updateAlert(updated.id, updated);
    if (result) {
        setAlerts((prev) => prev.map((a) => (a.id === result.id ? result : a)));
    }
    setPanelAlert(null);
};

const handleDeleteAlert = async (id: string) => {
    await deleteAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setPanelAlert(null);
};
```

- [ ] **Step 6: Rewrite handleEditAlert**

Replace the function at lines 4008-4013 with:

```typescript
const handleEditAlert = (alert: PriceAlert) => {
    const drawing = alert.drawingId
        ? drawings.find((d) => d.id === alert.drawingId) || null
        : null;

    // Get indicator outputs if this is an indicator alert
    let indicatorOutputs: string[] | undefined;
    if (alert.indicatorId) {
        const ind = allActiveIndicators.find((i: any) => i.id === alert.indicatorId);
        if (ind?.data) indicatorOutputs = Object.keys(ind.data);
    }

    setPanelAlert({
        alert,
        drawing,
        indicatorId: alert.indicatorId,
        indicatorType: alert.indicatorId
            ? allActiveIndicators.find((i: any) => i.id === alert.indicatorId)?.type
            : undefined,
        indicatorOutputs,
    });
};
```

- [ ] **Step 7: Update the context menu handler for price alerts**

Find `onAddAlert` in the ContextMenu props (the `handleAddAlertFromContext` or similar). Update it to use `createAlertWithDefaults`:

```typescript
const handleAddAlertAtPrice = async (price: number) => {
    const fakeDrawing: any = {
        id: `price-${Date.now()}`,
        type: 'Horizontal Line',
        price,
        style: { color: '#FFD700', width: 1, dash: [] },
        isVisible: true,
    };
    const newAlert = await createAlertWithDefaults(symbol, fakeDrawing);
    if (newAlert) {
        setAlerts((prev) => [...prev, newAlert]);
        setToastAlert(newAlert);
    }
};
```

- [ ] **Step 8: Replace CreateAlertModal rendering with AlertToast and AlertSlidePanel**

Remove the CreateAlertModal JSX block (lines 9927-9946).

Add AlertToast inside the chart container (before the closing div):

```typescript
{toastAlert && (
    <AlertToast
        alert={toastAlert}
        onCustomize={() => {
            handleEditAlert(toastAlert);
            setToastAlert(null);
        }}
        onDismiss={() => setToastAlert(null)}
    />
)}
```

For the AlertSlidePanel, modify the main layout so it sits between the chart area and the RightToolbar. Find where RightToolbar is rendered (around line 9881) and wrap the chart + panel in a flex row:

The chart's existing main area and the slide panel should be siblings in a flex container. When the panel is open, it takes 280px and the chart area shrinks:

```typescript
{panelAlert && (
    <AlertSlidePanel
        alert={panelAlert.alert}
        drawing={panelAlert.drawing}
        symbol={symbol}
        indicatorId={panelAlert.indicatorId}
        indicatorType={panelAlert.indicatorType}
        indicatorOutputs={panelAlert.indicatorOutputs}
        onSave={handleSaveAlert}
        onDelete={handleDeleteAlert}
        onClose={() => setPanelAlert(null)}
    />
)}
```

Place this JSX right before the RightToolbar component in the layout.

- [ ] **Step 9: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(alerts): integrate AlertToast and AlertSlidePanel, remove CreateAlertModal"
```

---

### Task 7: Delete Old Files

**Files:**
- Delete: `src/components/CreateAlertModal.tsx`
- Delete: `src/components/alerts/AlertConditionSelector.tsx`

- [ ] **Step 1: Delete old files**

```bash
rm "My Project/src/components/CreateAlertModal.tsx"
rm -f "My Project/src/components/alerts/AlertConditionSelector.tsx"
```

- [ ] **Step 2: Remove any remaining imports of deleted files**

Search for imports of `CreateAlertModal` or `AlertConditionSelector` across the codebase and remove them.

```bash
grep -rn "CreateAlertModal\|AlertConditionSelector" "My Project/src/" --include="*.tsx" --include="*.ts"
```

Fix any files that still import these.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(alerts): delete old CreateAlertModal and AlertConditionSelector"
```

---

### Task 8: Backend PriceAlertMonitor

**Files:**
- Create: `backend/server/src/services/priceAlertMonitor.ts`
- Modify: `backend/server/src/worker.ts`

- [ ] **Step 1: Create the backend price alert monitor**

```typescript
// backend/server/src/services/priceAlertMonitor.ts
import { supabaseAdmin } from './supabaseAdmin';
import { eventBus, EngineEvents, PriceTickPayload } from '../utils/eventBus';
import { subscribeBookTicker } from './binanceStream';

const POLL_INTERVAL = 5000; // 5 seconds

interface ActiveAlert {
    id: string;
    symbol: string;
    condition: string;
    price: number | null;
    trigger_frequency: string;
    triggered_at: string | null;
    indicator_id: string | null;
    alert_condition_id: string | null;
    condition_parameters: any;
}

// In-memory price cache
const latestPrices: Map<string, number> = new Map();
const previousPrices: Map<string, number> = new Map();

let pollTimer: NodeJS.Timeout | null = null;
let isRunning = false;

function checkCondition(
    condition: string,
    currentPrice: number,
    prevPrice: number | undefined,
    targetPrice: number
): boolean {
    switch (condition) {
        case 'Greater Than':
            return currentPrice > targetPrice;
        case 'Less Than':
            return currentPrice < targetPrice;
        case 'Crossing':
            return prevPrice !== undefined &&
                ((prevPrice < targetPrice && currentPrice >= targetPrice) ||
                 (prevPrice > targetPrice && currentPrice <= targetPrice));
        case 'Crossing Up':
            return prevPrice !== undefined && prevPrice < targetPrice && currentPrice >= targetPrice;
        case 'Crossing Down':
            return prevPrice !== undefined && prevPrice > targetPrice && currentPrice <= targetPrice;
        default:
            return false;
    }
}

async function evaluateAlerts() {
    if (!isRunning) return;

    try {
        // Fetch active, non-drawing, non-indicator price-level alerts
        const { data: alerts, error } = await supabaseAdmin
            .from('price_alerts')
            .select('id, symbol, condition, price, trigger_frequency, triggered_at, indicator_id, alert_condition_id, condition_parameters')
            .eq('triggered', false)
            .is('drawing_id', null)
            .is('indicator_id', null);

        if (error || !alerts) return;

        for (const alert of alerts as ActiveAlert[]) {
            const sym = alert.symbol.toUpperCase();
            const current = latestPrices.get(sym);
            const prev = previousPrices.get(sym);

            if (current === undefined || alert.price === null) continue;

            // Subscribe to price feed if not already
            subscribeBookTicker(sym);

            const triggered = checkCondition(alert.condition, current, prev, alert.price);
            if (!triggered) continue;

            // Frequency gate
            const now = Date.now();
            const lastTriggered = alert.triggered_at ? new Date(alert.triggered_at).getTime() : 0;
            let shouldFire = false;
            let shouldDisable = false;

            switch (alert.trigger_frequency) {
                case 'Only Once':
                    shouldFire = true;
                    shouldDisable = true;
                    break;
                case 'Once Per Minute':
                case 'Once Per Bar':
                    shouldFire = now - lastTriggered >= 60000;
                    break;
                case 'Once Per Bar Close':
                    // Backend can approximate with 60s check
                    shouldFire = now - lastTriggered >= 60000;
                    break;
            }

            if (shouldFire) {
                console.log(`[PriceAlertMonitor] Triggered: ${alert.id} ${sym} ${alert.condition} ${alert.price}`);

                await supabaseAdmin
                    .from('price_alerts')
                    .update({
                        triggered: shouldDisable,
                        triggered_at: new Date().toISOString(),
                    })
                    .eq('id', alert.id);
            }
        }
    } catch (err) {
        console.error('[PriceAlertMonitor] Evaluation error:', err);
    }
}

function handlePriceTick(payload: PriceTickPayload) {
    const sym = payload.symbol.toUpperCase();
    const current = latestPrices.get(sym);
    if (current !== undefined) {
        previousPrices.set(sym, current);
    }
    // Use mid-price
    latestPrices.set(sym, (payload.bid + payload.ask) / 2);
}

export function startPriceAlertMonitor() {
    if (isRunning) return;
    isRunning = true;

    // Listen for price ticks
    eventBus.on(EngineEvents.PRICE_TICK, handlePriceTick);

    // Poll for alerts
    pollTimer = setInterval(evaluateAlerts, POLL_INTERVAL);

    console.log('[PriceAlertMonitor] Started (poll every 5s)');
}

export function stopPriceAlertMonitor() {
    isRunning = false;
    eventBus.off(EngineEvents.PRICE_TICK, handlePriceTick);
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    console.log('[PriceAlertMonitor] Stopped');
}
```

- [ ] **Step 2: Add priceAlertMonitor to worker.ts**

Add the import at the top of `worker.ts`:

```typescript
import { startPriceAlertMonitor, stopPriceAlertMonitor } from './services/priceAlertMonitor';
```

After `await startExecutionEngine();` (line 51), add:

```typescript
    // 4b. Start Price Alert Monitor (evaluates price-level alerts server-side)
    startPriceAlertMonitor();
```

In the `shutdown` function, add before `stopSignalEngine()`:

```typescript
        stopPriceAlertMonitor();
```

- [ ] **Step 3: Commit**

```bash
git add backend/server/src/services/priceAlertMonitor.ts backend/server/src/worker.ts
git commit -m "feat(alerts): add backend PriceAlertMonitor service"
```

---

### Task 9: Verify & Test

- [ ] **Step 1: Run the frontend dev server**

```bash
cd "My Project" && pnpm dev
```

Expected: No TypeScript compilation errors. App loads.

- [ ] **Step 2: Test drawing alert flow**

1. Open Market page in browser
2. Draw a Trend Line on the chart
3. Right-click the trend line → click "Add alert on Trend Line"
4. Verify: toast appears at bottom saying "Alert created"
5. Click "Customize" on toast → verify slide panel opens from right
6. Change condition to "Crossing Up", click Save
7. Verify bell icon appears on the trend line

- [ ] **Step 3: Test indicator alert flow**

1. Add RSI indicator to chart
2. Click bell icon on the RSI indicator display
3. Verify: toast appears
4. Click "Customize" → verify panel shows Predefined/Advanced tabs
5. Select "RSI crosses above level", set level to 80, save

- [ ] **Step 4: Test editing existing alert**

1. Click bell icon on chart (AlertMarker)
2. Verify panel opens with existing alert settings
3. Change trigger to "Once Per Bar", save
4. Delete the alert using the delete button

- [ ] **Step 5: Build check**

```bash
cd "My Project" && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(alerts): address issues found during testing"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-04-16-alert-system-rebuild.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?