// src/components/market-chart/AlertToast.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { PriceAlert, AlertConditionType, Drawing } from './types';
import { getAlertConditions } from '../../data/indicatorAlertConditions';

type TriggerFreq = PriceAlert['triggerFrequency'];

interface AlertToastProps {
    alert: PriceAlert;
    onCustomize: () => void;
    onDismiss: () => void;
    expanded?: boolean;
    drawing?: Drawing | null;
    indicatorId?: string;
    indicatorType?: string;
    onSave?: (updated: PriceAlert) => void;
    onDelete?: (id: string) => void;
}

const COND_OPTIONS: AlertConditionType[] = ['Crossing', 'Crossing Up', 'Crossing Down', 'Greater Than', 'Less Than'];
const CHANNEL_OPTIONS: AlertConditionType[] = ['Entering Channel', 'Exiting Channel'];
const TIME_OPTIONS: AlertConditionType[] = ['Time Reached'];

const FIB_LEVELS = [
    { value: 0, label: '0%' },
    { value: 0.236, label: '23.6%' },
    { value: 0.382, label: '38.2%' },
    { value: 0.5, label: '50%' },
    { value: 0.618, label: '61.8%' },
    { value: 0.786, label: '78.6%' },
    { value: 1, label: '100%' },
];

const GANN_LEVELS = [
    { value: 0, label: '0% (1/1 low)' },
    { value: 0.125, label: '12.5% (1/8)' },
    { value: 0.25, label: '25% (1/4)' },
    { value: 0.333, label: '33.3% (1/3)' },
    { value: 0.5, label: '50% (1/2)' },
    { value: 0.667, label: '66.7% (2/3)' },
    { value: 0.75, label: '75% (3/4)' },
    { value: 0.875, label: '87.5% (7/8)' },
    { value: 1, label: '100% (1/1 high)' },
];

const TRIGS: { label: string; value: TriggerFreq }[] = [
    { label: 'Once', value: 'Only Once' },
    { label: 'Bar', value: 'Once Per Bar' },
    { label: 'Close', value: 'Once Per Bar Close' },
    { label: '1min', value: 'Once Per Minute' },
];

/** Per-drawing-type conditions */
const conditionsForDrawing = (type?: string): AlertConditionType[] => {
    if (type === 'Parallel Channel') return CHANNEL_OPTIONS;
    if (type === 'Vertical Line') return TIME_OPTIONS;
    return COND_OPTIONS;
};

const AlertToast: React.FC<AlertToastProps> = ({
    alert,
    onCustomize,
    onDismiss,
    expanded = false,
    drawing,
    indicatorId,
    indicatorType,
    onSave,
    onDelete,
}) => {
    useEffect(() => {
        if (expanded) return;
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss, expanded]);

    const drawingType = drawing?.type;
    const conditionText = (() => {
        if (!drawingType) return alert.value ? `${alert.condition} ${alert.value.toFixed(5)}` : alert.condition;
        if (drawing?.type === 'Fibonacci Retracement')
            return `${alert.condition} Fib ${((alert.fibLevel ?? 0.618) * 100).toFixed(1)}%`;
        if (drawing?.type === 'Gann Box')
            return `${alert.condition} Gann ${((alert.fibLevel ?? 0.5) * 100).toFixed(1)}%`;
        return `${alert.condition} ${drawingType}`;
    })();

    const isIndicatorAlert = !!indicatorId && !!indicatorType;
    const isChannel = drawing?.type === 'Parallel Channel';
    const isVerticalLine = drawing?.type === 'Vertical Line';
    const isFibonacci = drawing?.type === 'Fibonacci Retracement';
    const isGannBox = drawing?.type === 'Gann Box';
    const isLevelDrawing = isFibonacci || isGannBox;
    const isDrawingAlert = !!drawing && !isChannel && !isVerticalLine && !isLevelDrawing;
    const isPriceAlert = !drawing && !isIndicatorAlert;
    const condOptions = conditionsForDrawing(drawing?.type);

    const [condition, setCondition] = useState<AlertConditionType>(alert.condition);
    const [value, setValue] = useState(alert.value ?? 0);
    const [fibLevel, setFibLevel] = useState(alert.fibLevel ?? (isFibonacci ? 0.618 : isGannBox ? 0.5 : undefined));
    const [trigger, setTrigger] = useState<TriggerFreq>(alert.triggerFrequency);
    const [timeframe, setTimeframe] = useState(alert.timeframe || '1m');
    const [notifyApp, setNotifyApp] = useState(alert.notifyApp);
    const [playSound, setPlaySound] = useState(alert.playSound);
    const [selectedCondId, setSelectedCondId] = useState(alert.alertConditionId || '');
    const [condParams, setCondParams] = useState<Record<string, any>>(alert.conditionParameters || {});

    const conditions = useMemo(
        () => (isIndicatorAlert ? getAlertConditions(indicatorType!) : []),
        [isIndicatorAlert, indicatorType]
    );
    const selectedDef = useMemo(
        () => conditions.find((c) => c.id === selectedCondId),
        [conditions, selectedCondId]
    );

    useEffect(() => {
        if (isIndicatorAlert && conditions.length > 0 && !selectedCondId) {
            const first = conditions[0];
            setSelectedCondId(first.id);
            const p: Record<string, any> = {};
            first.parameters.forEach((param) => (p[param.name] = param.default));
            setCondParams(p);
        }
    }, [isIndicatorAlert, conditions, selectedCondId]);

    const handleSave = () => {
        const updated: PriceAlert = {
            ...alert,
            condition,
            value: isChannel ? undefined : value,
            fibLevel: isLevelDrawing ? fibLevel : alert.fibLevel,
            triggerFrequency: trigger,
            timeframe,
            notifyApp,
            playSound,
        };
        if (isIndicatorAlert) {
            updated.indicatorId = indicatorId;
            updated.alertConditionId = selectedCondId;
            updated.conditionParameters = condParams;
        }
        onSave?.(updated);
    };

    // ── Toast mode (compact) ──
    if (!expanded) {
        return (
            <div
                className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                    background: '#131315',
                    border: '1px solid rgba(196,181,240,0.12)',
                    boxShadow: '0 12px 40px -8px rgba(0,0,0,0.7)',
                    animation: 'alertToastIn 0.35s ease',
                }}
            >
                <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(52,211,153,0.1)' }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
                <div>
                    <div className="text-xs font-semibold text-[#e8e8e8]">
                        Alert created
                        {(drawing || isIndicatorAlert) && (
                            <span className="ml-1.5 text-[9px] font-medium px-1.5 py-0.5 rounded text-[#888]" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                {isIndicatorAlert ? indicatorType : drawing?.type}
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] text-[#555] mt-0.5">
                        {alert.symbol} — {conditionText}
                    </div>
                </div>
                <div className="flex gap-1 ml-2">
                    <button
                        type="button"
                        onClick={onCustomize}
                        className="px-3 py-1 rounded-md text-[10px] font-semibold transition-colors"
                        style={{ background: 'rgba(196,181,240,0.1)', color: '#c4b5f0' }}
                    >
                        Customize
                    </button>
                    <button
                        type="button"
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
    }

    // ── Expanded editor mode ──
    return (
        <div
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col rounded-xl overflow-hidden"
            style={{
                width: 340,
                background: '#131315',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 20px 60px -12px rgba(0,0,0,0.8)',
                animation: 'alertToastIn 0.25s ease',
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(196,181,240,0.08)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c4b5f0" strokeWidth="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </div>
                    <span className="text-[11px] font-semibold text-[#e8e8e8]">{alert.symbol}</span>
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ color: '#888', background: 'rgba(255,255,255,0.04)' }}>
                        {isIndicatorAlert ? indicatorType : drawing?.type || 'Price'}
                    </span>
                </div>
                <button type="button" onClick={onDismiss} className="w-5 h-5 flex items-center justify-center rounded text-[#444] hover:text-[#aaa] text-xs transition-colors">
                    &times;
                </button>
            </div>

            {/* Editor body */}
            <div className="px-3.5 py-2.5 flex flex-col gap-2.5">
                {/* Condition row */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[#4a4a52] w-12 flex-shrink-0">Cond</span>
                    {isIndicatorAlert ? (
                        <select
                            title="Alert condition"
                            className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-md px-2 py-1.5 text-[11px] text-[#ccc] appearance-none cursor-pointer"
                            value={selectedCondId}
                            onChange={(e) => {
                                setSelectedCondId(e.target.value);
                                const def = conditions.find((c) => c.id === e.target.value);
                                if (def) {
                                    const p: Record<string, any> = {};
                                    def.parameters.forEach((param) => (p[param.name] = param.default));
                                    setCondParams(p);
                                }
                            }}
                        >
                            {conditions.map((c) => (
                                <option key={c.id} value={c.id} style={{ background: '#1a1a1e' }}>{c.name}</option>
                            ))}
                        </select>
                    ) : (
                        <>
                            <select
                                title="Condition type"
                                className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-md px-2 py-1.5 text-[11px] text-[#c4b5f0] font-medium appearance-none cursor-pointer"
                                value={condition}
                                onChange={(e) => setCondition(e.target.value as AlertConditionType)}
                            >
                                {condOptions.map((o) => (
                                    <option key={o} value={o} style={{ background: '#1a1a1e' }}>{o}</option>
                                ))}
                            </select>
                            {isPriceAlert && (
                                <input
                                    title="Alert price"
                                    type="number"
                                    step="0.00001"
                                    className="w-24 bg-transparent border border-[rgba(255,255,255,0.06)] rounded-md px-2 py-1.5 text-[12px] text-white font-mono text-right focus:border-[rgba(196,181,240,0.25)] focus:outline-none"
                                    value={value}
                                    onChange={(e) => setValue(parseFloat(e.target.value))}
                                />
                            )}
                            {isDrawingAlert && (
                                <span className="text-[10px] text-[#555] italic">{drawing?.type}</span>
                            )}
                            {isVerticalLine && alert.value && (
                                <span className="text-[10px] text-[#c4b5f0] font-mono">
                                    {new Date(alert.value * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                            {isLevelDrawing && (
                                <select
                                    title="Level"
                                    className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-md px-2 py-1.5 text-[11px] text-[#c4b5f0] font-medium appearance-none cursor-pointer"
                                    value={fibLevel ?? (isFibonacci ? 0.618 : 0.5)}
                                    onChange={(e) => setFibLevel(parseFloat(e.target.value))}
                                >
                                    {(isFibonacci ? FIB_LEVELS : GANN_LEVELS).map((l) => (
                                        <option key={l.value} value={l.value} style={{ background: '#1a1a1e' }}>
                                            {l.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </>
                    )}
                </div>

                {/* Indicator params */}
                {isIndicatorAlert && selectedDef?.parameters.map((p) => (
                    <div key={p.name} className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#4a4a52] w-12 flex-shrink-0">{p.name}</span>
                        <input
                            title={p.name}
                            type="number"
                            className="w-20 bg-transparent border border-[rgba(255,255,255,0.06)] rounded-md px-2 py-1.5 text-[11.5px] text-white font-mono text-center focus:border-[rgba(196,181,240,0.25)] focus:outline-none"
                            value={condParams[p.name] ?? p.default}
                            min={p.min}
                            max={p.max}
                            onChange={(e) => setCondParams((prev) => ({ ...prev, [p.name]: parseFloat(e.target.value) }))}
                        />
                    </div>
                ))}

                {/* Trigger row */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[#4a4a52] w-12 flex-shrink-0">Trigger</span>
                    <div className="flex gap-0.5 flex-1 p-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        {TRIGS.map((t) => (
                            <button
                                type="button"
                                key={t.value}
                                onClick={() => setTrigger(t.value)}
                                className={`flex-1 py-1.5 rounded text-[9.5px] font-medium transition-colors ${
                                    trigger === t.value
                                        ? 'bg-[rgba(196,181,240,0.1)] text-[#c4b5f0]'
                                        : 'text-[#444] hover:text-[#888]'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Timeframe row — only relevant when trigger uses bars */}
                {(trigger === 'Once Per Bar' || trigger === 'Once Per Bar Close') && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#4a4a52] w-12 flex-shrink-0">Timeframe</span>
                        <select
                            title="Bar timeframe"
                            className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-md px-2 py-1.5 text-[11px] text-[#c4b5f0] font-medium appearance-none cursor-pointer"
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value)}
                        >
                            {['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'].map((tf) => (
                                <option key={tf} value={tf} style={{ background: '#1a1a1e' }}>{tf}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Actions row */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[#4a4a52] w-12 flex-shrink-0">Actions</span>
                    <div className="flex gap-1 flex-1">
                        <button
                            type="button"
                            onClick={() => setNotifyApp((v) => !v)}
                            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-medium border transition-colors ${
                                notifyApp
                                    ? 'bg-[rgba(196,181,240,0.06)] text-[#c4b5f0] border-[rgba(196,181,240,0.15)]'
                                    : 'bg-transparent text-[#444] border-[rgba(255,255,255,0.04)]'
                            }`}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                            Notify
                        </button>
                        <button
                            type="button"
                            onClick={() => setPlaySound((v) => !v)}
                            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-medium border transition-colors ${
                                playSound
                                    ? 'bg-[rgba(196,181,240,0.06)] text-[#c4b5f0] border-[rgba(196,181,240,0.15)]'
                                    : 'bg-transparent text-[#444] border-[rgba(255,255,255,0.04)]'
                            }`}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                            Sound
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex gap-1.5 px-3.5 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <button
                    type="button"
                    onClick={() => onDelete?.(alert.id)}
                    className="px-2.5 py-1.5 rounded-md text-[#444] hover:text-[#ef4444] transition-colors"
                    title="Delete alert"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    className="flex-1 py-1.5 rounded-md text-[11px] font-semibold bg-[#c4b5f0] text-[#111] hover:bg-[#d4c8f5] transition-colors"
                >
                    Save
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
