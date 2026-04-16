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
    indicatorOutputs?: string[];
    onSave: (updated: PriceAlert) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

const CONDITION_OPTIONS: AlertConditionType[] = [
    'Crossing', 'Crossing Up', 'Crossing Down', 'Greater Than', 'Less Than',
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
    const isChannelDrawing = drawing?.type === 'Rectangle' || drawing?.type === 'Parallel Channel';

    const [condition, setCondition] = useState<AlertConditionType>(initialAlert.condition);
    const [value, setValue] = useState(initialAlert.value ?? 0);
    const [fibLevel, setFibLevel] = useState(initialAlert.fibLevel);
    const [trigger, setTrigger] = useState<TriggerFreq>(initialAlert.triggerFrequency);
    const [notifyApp, setNotifyApp] = useState(initialAlert.notifyApp);
    const [playSound, setPlaySound] = useState(initialAlert.playSound);
    const [message, setMessage] = useState(initialAlert.message);

    const [indicatorMode, setIndicatorMode] = useState<'predefined' | 'advanced'>('predefined');
    const [selectedConditionId, setSelectedConditionId] = useState(initialAlert.alertConditionId || '');
    const [condParams, setCondParams] = useState<Record<string, any>>(initialAlert.conditionParameters || {});
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
                updated.indicatorId = indicatorId;
                updated.alertConditionId = `custom-${Date.now()}`;
                updated.conditionParameters = {
                    _expression: `${advOutput} ${advOperator === 'Greater Than' ? '>' : advOperator === 'Less Than' ? '<' : '=='} ${advValue}`,
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
                background: 'linear-gradient(180deg, rgba(30,28,40,0.95), rgba(16,14,24,0.98))',
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
                borderColor: 'rgba(167,139,250,0.1)',
                boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.03), -8px 0 40px -10px rgba(167,139,250,0.06)',
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3.5 border-b"
                style={{ borderColor: 'rgba(167,139,250,0.08)' }}
            >
                <div className="flex items-center gap-2">
                    <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(139,92,246,0.1))',
                            boxShadow: '0 0 12px -4px rgba(167,139,250,0.2)',
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </div>
                    <span className="text-sm font-semibold text-white">{symbol}</span>
                    <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-md"
                        style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.1)' }}
                    >
                        {isIndicatorAlert ? indicatorType : drawing?.type || 'Price'}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-[#555] hover:text-white hover:bg-[rgba(255,255,255,0.06)] text-sm transition-all"
                >
                    &times;
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3.5" style={{ scrollbarWidth: 'none' }}>
                {/* Condition */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[1.5px] mb-1.5" style={{ color: 'rgba(167,139,250,0.5)' }}>Condition</div>

                    {isIndicatorAlert ? (
                        <>
                            <div className="flex gap-0 mb-2">
                                {(['predefined', 'advanced'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setIndicatorMode(mode)}
                                        className={`flex-1 py-1.5 text-[11px] font-medium border transition-colors ${
                                            mode === 'predefined' ? 'rounded-l-md' : 'rounded-r-md'
                                        } ${
                                            indicatorMode === mode
                                                ? 'bg-[rgba(167,139,250,0.12)] text-[#a78bfa] border-[rgba(167,139,250,0.2)]'
                                                : 'bg-[rgba(255,255,255,0.03)] text-[#555] border-[rgba(255,255,255,0.06)]'
                                        }`}
                                    >
                                        {mode === 'predefined' ? 'Predefined' : 'Advanced'}
                                    </button>
                                ))}
                            </div>

                            {indicatorMode === 'predefined' ? (
                                <div className="rounded-lg p-2.5 flex flex-col gap-2 border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <select
                                        className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[11.5px] text-[#ccc] appearance-none cursor-pointer"
                                        value={selectedConditionId}
                                        onChange={(e) => {
                                            setSelectedConditionId(e.target.value);
                                            const def = conditions.find((c) => c.id === e.target.value);
                                            if (def) {
                                                const p: Record<string, any> = {};
                                                def.parameters.forEach((param) => (p[param.name] = param.default));
                                                setCondParams(p);
                                            }
                                        }}
                                    >
                                        {conditions.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    {selectedCondDef?.parameters.map((p) => (
                                        <div key={p.name} className="flex items-center gap-2">
                                            <span className="text-[10.5px] text-[#555] font-medium min-w-[36px]">{p.name}</span>
                                            <input
                                                type="number"
                                                className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-[11.5px] text-white font-mono w-16 text-center"
                                                value={condParams[p.name] ?? p.default}
                                                min={p.min}
                                                max={p.max}
                                                onChange={(e) => setCondParams((prev) => ({ ...prev, [p.name]: parseFloat(e.target.value) }))}
                                            />
                                        </div>
                                    ))}
                                    {selectedCondDef && <div className="text-[10px] text-[#444] mt-1">{selectedCondDef.name}</div>}
                                </div>
                            ) : (
                                <div className="rounded-lg p-2.5 flex flex-col gap-2 border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <div className="flex gap-1.5">
                                        <select className="flex-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[11.5px] text-[#ccc] appearance-none" value={advOutput} onChange={(e) => setAdvOutput(e.target.value)}>
                                            {indicatorOutputs.map((o) => (<option key={o} value={o}>{o}</option>))}
                                        </select>
                                        <select className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[11.5px] text-[#ccc] appearance-none" value={advOperator} onChange={(e) => setAdvOperator(e.target.value as AlertConditionType)}>
                                            {CONDITION_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
                                        </select>
                                    </div>
                                    <input type="number" className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[11.5px] text-white font-mono w-full" value={advValue} onChange={(e) => setAdvValue(parseFloat(e.target.value))} />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <select className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg px-2.5 py-2 text-[11.5px] text-[#ccc] appearance-none cursor-pointer" value={condition} onChange={(e) => setCondition(e.target.value as AlertConditionType)}>
                                {conditionOptions.map((o) => (<option key={o} value={o}>{o}</option>))}
                            </select>
                            {!isChannelDrawing && (
                                <input type="number" step="0.00001" className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg px-2.5 py-2 text-xs text-white font-mono" value={value} onChange={(e) => setValue(parseFloat(e.target.value))} />
                            )}
                            {drawing?.type === 'Fibonacci Retracement' && (
                                <select className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg px-2.5 py-2 text-[11.5px] text-[#ccc] appearance-none" value={fibLevel} onChange={(e) => {
                                    const lvl = parseFloat(e.target.value);
                                    setFibLevel(lvl);
                                    const fib = drawing as FibonacciRetracementDrawing;
                                    setValue(fib.start.price + (fib.end.price - fib.start.price) * lvl);
                                }}>
                                    {FIB_LEVELS.map((l) => (<option key={l} value={l}>Fib {l}</option>))}
                                </select>
                            )}
                        </div>
                    )}
                </div>

                {/* Trigger */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[rgba(167,139,250,0.5)] mb-1.5">Trigger</div>
                    <div className="flex flex-col gap-0.5">
                        {TRIGGERS.map((t) => (
                            <button
                                key={t.value}
                                onClick={() => setTrigger(t.value)}
                                className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                                    trigger === t.value
                                        ? 'bg-[rgba(167,139,250,0.1)] text-[#a78bfa]'
                                        : 'text-[#3e3e42] hover:text-[#888] hover:bg-[rgba(255,255,255,0.015)]'
                                }`}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                    trigger === t.value ? 'bg-[#a78bfa] shadow-[0_0_8px_rgba(167,139,250,0.5)]' : 'bg-[#2a2a2e]'
                                }`} />
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[rgba(167,139,250,0.5)] mb-1.5">Actions</div>
                    <div className="flex gap-1.5">
                        <button onClick={() => setNotifyApp((v) => !v)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10.5px] font-medium border transition-colors ${
                            notifyApp ? 'bg-[rgba(167,139,250,0.1)] text-[#a78bfa] border-[rgba(167,139,250,0.2)]' : 'bg-[rgba(255,255,255,0.015)] text-[#3e3e42] border-[rgba(255,255,255,0.03)]'
                        }`}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                            Notify
                        </button>
                        <button onClick={() => setPlaySound((v) => !v)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10.5px] font-medium border transition-colors ${
                            playSound ? 'bg-[rgba(167,139,250,0.1)] text-[#a78bfa] border-[rgba(167,139,250,0.2)]' : 'bg-[rgba(255,255,255,0.015)] text-[#3e3e42] border-[rgba(255,255,255,0.03)]'
                        }`}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                            Sound
                        </button>
                    </div>
                </div>

                {/* Message */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[rgba(167,139,250,0.5)] mb-1.5">Message</div>
                    <textarea rows={2} className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] rounded-lg px-2.5 py-2 text-[10.5px] text-[#555] resize-none focus:border-[rgba(167,139,250,0.2)] focus:text-[#aaa] focus:outline-none" style={{ fontFamily: 'Inter, sans-serif' }} value={message} onChange={(e) => setMessage(e.target.value)} />
                </div>
            </div>

            {/* Footer */}
            <div className="flex gap-1.5 px-4 py-3 border-t" style={{ borderColor: 'rgba(167,139,250,0.08)' }}>
                <button onClick={() => onDelete(initialAlert.id)} className="px-3 py-2 rounded-xl text-[#555] hover:text-[#ef4444] transition-colors" title="Delete alert">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
                <button
                    onClick={handleSave}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white transition-all"
                    style={{
                        background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                        boxShadow: '0 4px 16px -4px rgba(139,92,246,0.4)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 20px -4px rgba(139,92,246,0.6)')}
                    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px -4px rgba(139,92,246,0.4)')}
                >
                    Save Changes
                </button>
            </div>
        </div>
    );
};

export default AlertSlidePanel;
