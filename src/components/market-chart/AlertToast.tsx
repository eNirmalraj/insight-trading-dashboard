// src/components/market-chart/AlertToast.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { PriceAlert, AlertConditionType, Drawing, FibonacciRetracementDrawing } from './types';
import { FIB_LEVELS } from './constants';
import { getAlertConditions } from '../../data/indicatorAlertConditions';

type TriggerFreq = PriceAlert['triggerFrequency'];

interface AlertToastProps {
    alert: PriceAlert;
    onCustomize: () => void;
    onDismiss: () => void;
    /** Expanded editor mode */
    expanded?: boolean;
    drawing?: Drawing | null;
    indicatorId?: string;
    indicatorType?: string;
    indicatorOutputs?: string[];
    onSave?: (updated: PriceAlert) => void;
    onDelete?: (id: string) => void;
}

const COND_OPTIONS: AlertConditionType[] = ['Crossing', 'Crossing Up', 'Crossing Down', 'Greater Than', 'Less Than'];
const CHANNEL_OPTIONS: AlertConditionType[] = ['Entering Channel', 'Exiting Channel'];
const TRIGS: { label: string; value: TriggerFreq }[] = [
    { label: 'Once', value: 'Only Once' },
    { label: 'Bar', value: 'Once Per Bar' },
    { label: 'Close', value: 'Once Per Bar Close' },
    { label: '1min', value: 'Once Per Minute' },
];

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
    // Auto-dismiss only in toast mode
    useEffect(() => {
        if (expanded) return;
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss, expanded]);

    const conditionText = alert.value
        ? `${alert.condition} ${alert.value.toFixed(5)}`
        : alert.condition;

    // ── Expanded editor state ──
    const isIndicatorAlert = !!indicatorId && !!indicatorType;
    const isChannel = drawing?.type === 'Rectangle' || drawing?.type === 'Parallel Channel';
    const condOptions = isChannel ? CHANNEL_OPTIONS : COND_OPTIONS;

    const [condition, setCondition] = useState<AlertConditionType>(alert.condition);
    const [value, setValue] = useState(alert.value ?? 0);
    const [fibLevel, setFibLevel] = useState(alert.fibLevel);
    const [trigger, setTrigger] = useState<TriggerFreq>(alert.triggerFrequency);
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
            fibLevel,
            triggerFrequency: trigger,
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
                className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                    background: 'linear-gradient(135deg, rgba(30,28,40,0.92), rgba(18,16,26,0.96))',
                    backdropFilter: 'blur(40px)',
                    WebkitBackdropFilter: 'blur(40px)',
                    border: '1px solid rgba(167,139,250,0.15)',
                    boxShadow: '0 0 60px -15px rgba(167,139,250,0.15), 0 20px 50px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
                    animation: 'alertToastIn 0.35s ease',
                }}
            >
                <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                        background: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(139,92,246,0.1))',
                        boxShadow: '0 0 12px -4px rgba(167,139,250,0.2)',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
                <div>
                    <div className="text-xs font-semibold text-white">Alert created</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'rgba(167,139,250,0.6)' }}>
                        {alert.symbol} — {conditionText}
                    </div>
                </div>
                <div className="flex gap-1.5 ml-3">
                    <button
                        onClick={onCustomize}
                        className="px-4 py-1.5 rounded-xl text-[10px] font-semibold text-white transition-all"
                        style={{
                            background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                            boxShadow: '0 4px 16px -4px rgba(139,92,246,0.4)',
                        }}
                    >
                        Customize
                    </button>
                    <button
                        onClick={onDismiss}
                        className="px-3 py-1.5 rounded-xl text-[10px] font-semibold text-[#555] hover:text-[#a78bfa] transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
                <style>{`
                    @keyframes alertToastIn {
                        from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
                        to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                    }
                `}</style>
            </div>
        );
    }

    // ── Expanded editor mode ──
    return (
        <div
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col rounded-2xl overflow-hidden"
            style={{
                width: 340,
                background: 'linear-gradient(135deg, rgba(30,28,40,0.95), rgba(18,16,26,0.98))',
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
                border: '1px solid rgba(167,139,250,0.12)',
                boxShadow: '0 0 80px -20px rgba(167,139,250,0.12), 0 30px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
                animation: 'alertToastIn 0.25s ease',
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.015)' }}>
                <div className="flex items-center gap-2">
                    <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(139,92,246,0.1))' }}
                    >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </div>
                    <span className="text-xs font-semibold text-white">{alert.symbol}</span>
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md" style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.1)' }}>
                        {isIndicatorAlert ? indicatorType : drawing?.type || 'Price'}
                    </span>
                </div>
                <button onClick={onDismiss} className="w-6 h-6 flex items-center justify-center rounded-full text-[#555] hover:text-white hover:bg-[rgba(255,255,255,0.06)] text-sm transition-all">
                    &times;
                </button>
            </div>

            {/* Editor body */}
            <div className="px-4 py-3 flex flex-col gap-3">
                {/* Condition row */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-[1.5px] w-14 flex-shrink-0" style={{ color: 'rgba(167,139,250,0.5)' }}>Cond</span>
                    {isIndicatorAlert ? (
                        <select
                            title="Alert condition"
                            className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg px-2 py-1.5 text-[11px] text-[#ccc] appearance-none cursor-pointer"
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
                                <option key={c.id} value={c.id} style={{ background: '#1e1c28' }}>{c.name}</option>
                            ))}
                        </select>
                    ) : (
                        <>
                            <select
                                title="Condition type"
                                className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg px-2 py-1.5 text-[11px] text-[#a78bfa] font-medium appearance-none cursor-pointer"
                                value={condition}
                                onChange={(e) => setCondition(e.target.value as AlertConditionType)}
                            >
                                {condOptions.map((o) => (
                                    <option key={o} value={o} style={{ background: '#1e1c28' }}>{o}</option>
                                ))}
                            </select>
                            {!isChannel && (
                                <input
                                    title="Alert price"
                                    type="number"
                                    step="0.00001"
                                    className="w-24 bg-transparent border border-[rgba(255,255,255,0.06)] rounded-lg px-2 py-1.5 text-[12px] text-white font-mono text-right focus:border-[rgba(167,139,250,0.3)] focus:outline-none"
                                    value={value}
                                    onChange={(e) => setValue(parseFloat(e.target.value))}
                                />
                            )}
                        </>
                    )}
                </div>

                {/* Indicator params */}
                {isIndicatorAlert && selectedDef?.parameters.map((p) => (
                    <div key={p.name} className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold uppercase tracking-[1.5px] w-14 flex-shrink-0" style={{ color: 'rgba(167,139,250,0.5)' }}>{p.name}</span>
                        <input
                            title={p.name}
                            type="number"
                            className="w-20 bg-transparent border border-[rgba(255,255,255,0.06)] rounded-lg px-2 py-1.5 text-[11.5px] text-white font-mono text-center focus:border-[rgba(167,139,250,0.3)] focus:outline-none"
                            value={condParams[p.name] ?? p.default}
                            min={p.min}
                            max={p.max}
                            onChange={(e) => setCondParams((prev) => ({ ...prev, [p.name]: parseFloat(e.target.value) }))}
                        />
                    </div>
                ))}

                {/* Fib level */}
                {!isIndicatorAlert && drawing?.type === 'Fibonacci Retracement' && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold uppercase tracking-[1.5px] w-14 flex-shrink-0" style={{ color: 'rgba(167,139,250,0.5)' }}>Fib</span>
                        <select
                            title="Fibonacci level"
                            className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg px-2 py-1.5 text-[11px] text-[#ccc] appearance-none"
                            value={fibLevel}
                            onChange={(e) => {
                                const lvl = parseFloat(e.target.value);
                                setFibLevel(lvl);
                                const fib = drawing as FibonacciRetracementDrawing;
                                setValue(fib.start.price + (fib.end.price - fib.start.price) * lvl);
                            }}
                        >
                            {FIB_LEVELS.map((l) => (<option key={l} value={l} style={{ background: '#1e1c28' }}>Fib {l}</option>))}
                        </select>
                    </div>
                )}

                {/* Trigger row */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-[1.5px] w-14 flex-shrink-0" style={{ color: 'rgba(167,139,250,0.5)' }}>Trigger</span>
                    <div className="flex gap-1 flex-1">
                        {TRIGS.map((t) => (
                            <button
                                key={t.value}
                                onClick={() => setTrigger(t.value)}
                                className={`flex-1 py-1.5 rounded-lg text-[9.5px] font-medium transition-all ${
                                    trigger === t.value
                                        ? 'text-[#a78bfa]'
                                        : 'text-[#444] hover:text-[#888]'
                                }`}
                                style={trigger === t.value ? {
                                    background: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(139,92,246,0.1))',
                                    boxShadow: '0 0 12px -4px rgba(167,139,250,0.2)',
                                } : { background: 'transparent' }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-[1.5px] w-14 flex-shrink-0" style={{ color: 'rgba(167,139,250,0.5)' }}>Actions</span>
                    <div className="flex gap-1.5 flex-1">
                        <button
                            onClick={() => setNotifyApp((v) => !v)}
                            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                                notifyApp ? 'text-[#a78bfa]' : 'text-[#444]'
                            }`}
                            style={notifyApp ? {
                                background: 'rgba(167,139,250,0.08)',
                                border: '1px solid rgba(167,139,250,0.18)',
                            } : {
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.05)',
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                            Notify
                        </button>
                        <button
                            onClick={() => setPlaySound((v) => !v)}
                            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                                playSound ? 'text-[#a78bfa]' : 'text-[#444]'
                            }`}
                            style={playSound ? {
                                background: 'rgba(167,139,250,0.08)',
                                border: '1px solid rgba(167,139,250,0.18)',
                            } : {
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.05)',
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                            Sound
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-4 py-2.5" style={{ borderTop: '1px solid rgba(167,139,250,0.08)' }}>
                <button
                    onClick={() => onDelete?.(alert.id)}
                    className="px-3 py-2 rounded-xl text-[#555] hover:text-[#ef4444] transition-colors"
                    title="Delete alert"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
                <button
                    onClick={handleSave}
                    className="flex-1 py-2 rounded-xl text-[11px] font-semibold text-white transition-all"
                    style={{
                        background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                        boxShadow: '0 4px 16px -4px rgba(139,92,246,0.4)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 20px -4px rgba(139,92,246,0.6)')}
                    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px -4px rgba(139,92,246,0.4)')}
                >
                    Save
                </button>
            </div>

            <style>{`
                @keyframes alertToastIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
};

export default AlertToast;
