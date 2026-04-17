import React, { useState, useCallback, useEffect } from 'react';
import { DEFAULT_INDICATORS } from '../../../../indicators';
import { parseKuriSource, type ParsedParam } from '../../../strategy-studio/visual-builder/kuriSourceParser';
import type { IndicatorModel, IndicatorInstance } from '../types';
import type { Strategy } from '../../../../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'];

const SHORTNAME_MAP: Record<string, string> = {
    'SMA': 'sma', 'EMA': 'ema', 'WMA': 'wma', 'HMA': 'hma', 'VWMA': 'vwma',
    'RSI': 'rsi', 'MACD': 'macd', 'Stoch': 'stochastic', 'CCI': 'cci',
    'MFI': 'mfi', 'ADX': 'adx', 'ATR': 'atr', 'BB': 'bb',
    'Supertrend': 'supertrend', 'OBV': 'obv', 'VWAP': 'vwap', 'Vol': 'volume',
    'DC': 'donchian', 'KC': 'keltner', 'Ichimoku': 'ichimoku',
    'MA Ribbon': 'ma-ribbon', 'ADR': 'adr', 'MFL': 'money-flow-levels',
};

const CATEGORIES = [
    { key: 'trend', label: 'Trend' },
    { key: 'volatility', label: 'Volatility' },
    { key: 'oscillator', label: 'Oscillator' },
    { key: 'volume', label: 'Volume' },
] as const;

const uniqueName = (base: string, existing: { name: string }[]): string => {
    const taken = new Set(existing.map((e) => e.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`.toLowerCase())) n++;
    return `${base} ${n}`;
};

const StepIndicators: React.FC<Props> = ({ model, update }) => {
    const [showPicker, setShowPicker] = useState(false);
    const [customScripts, setCustomScripts] = useState<Strategy[]>([]);

    useEffect(() => {
        import('../../../../services/strategyService').then(({ getStrategies }) =>
            getStrategies().then((all) => setCustomScripts(all.filter((s) => s.type === 'INDICATOR')))
        ).catch(() => {});
    }, []);

    const setIndicators = useCallback((fn: (prev: IndicatorInstance[]) => IndicatorInstance[]) => {
        update({ indicators: fn(model.indicators) });
    }, [model.indicators, update]);

    const handleAdd = useCallback((shortname: string) => {
        const indId = SHORTNAME_MAP[shortname] || shortname.toLowerCase();
        const meta = DEFAULT_INDICATORS.find((i) => i.id === indId || i.shortname === shortname);
        if (!meta) return;

        setIndicators((prev) => {
            const parsed = parseKuriSource(meta.kuriSource);
            const paramValues: Record<string, any> = {};
            for (const p of parsed.params) {
                paramValues[p.varName] = p.defaultValue;
            }
            return [...prev, {
                id: String(Date.now()),
                name: uniqueName(meta.name, prev),
                shortname: meta.shortname,
                kuriSource: meta.kuriSource,
                parsed,
                paramValues,
            }];
        });
        setShowPicker(false);
    }, [setIndicators]);

    const handleAddCustom = useCallback((script: Strategy) => {
        const source = script.scriptSource || script.kuriScript || '';
        setIndicators((prev) => {
            const parsed = parseKuriSource(source);
            const paramValues: Record<string, any> = {};
            for (const p of parsed.params) {
                paramValues[p.varName] = p.defaultValue;
            }
            return [...prev, {
                id: String(Date.now()),
                name: uniqueName(script.name, prev),
                shortname: 'Custom',
                kuriSource: source,
                parsed,
                paramValues,
            }];
        });
        setShowPicker(false);
    }, [setIndicators]);

    const renameIndicator = useCallback((id: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        setIndicators((prev) => {
            if (prev.some((i) => i.id !== id && i.name.toLowerCase() === trimmed.toLowerCase())) return prev;
            return prev.map((i) => (i.id === id ? { ...i, name: trimmed } : i));
        });
    }, [setIndicators]);

    const removeIndicator = useCallback((id: string) => {
        setIndicators((prev) => prev.filter((i) => i.id !== id));
    }, [setIndicators]);

    const updateParamValue = useCallback((indId: string, paramName: string, value: any) => {
        setIndicators((prev) => prev.map((ind) =>
            ind.id === indId ? { ...ind, paramValues: { ...ind.paramValues, [paramName]: value } } : ind
        ));
    }, [setIndicators]);

    // Check if a param value is linked to a User Input (starts with "$param:")
    const isLinked = (val: any): boolean => typeof val === 'string' && val.startsWith('$param:');
    const getLinkedVar = (val: any): string => isLinked(val) ? val.slice(7) : '';

    // Compatible user inputs for a given param type
    const compatibleUserInputs = (paramType: string) => {
        return model.parameters.filter((p) => {
            if (paramType === 'int' || paramType === 'float') return p.type === 'int' || p.type === 'float';
            if (paramType === 'string') return p.type === 'string';
            if (paramType === 'source') return p.type === 'source' || p.type === 'string';
            if (paramType === 'bool') return p.type === 'bool';
            return false;
        });
    };

    const renderParamInput = (ind: IndicatorInstance, param: ParsedParam) => {
        const val = ind.paramValues[param.varName];
        const linked = isLinked(val);
        const linkedVar = getLinkedVar(val);
        const compatible = compatibleUserInputs(param.type);

        return (
            <div key={param.varName} className="flex items-center gap-2 py-1">
                <span className="text-xs text-gray-400 w-28 flex-shrink-0 truncate">{param.title || param.varName}</span>
                <div className="flex-1 flex items-center gap-1.5">
                    {linked ? (
                        // Linked to a User Input — show badge
                        <div className="flex items-center gap-1.5 flex-1">
                            <span className="text-[10px] text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded font-medium">
                                {model.parameters.find((p) => p.varName === linkedVar)?.title || linkedVar}
                            </span>
                            <span className="text-[9px] text-gray-600 font-mono">{linkedVar}</span>
                        </div>
                    ) : (
                        // Fixed value input
                        <div className="flex-1">
                            {(param.type === 'int' || param.type === 'float') && (
                                <input type="number" value={val} title={param.title}
                                    min={param.min} max={param.max}
                                    step={param.type === 'float' ? 0.1 : 1}
                                    onChange={(e) => updateParamValue(ind.id, param.varName, param.type === 'int' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
                                    className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#2962FF] outline-none text-center" />
                            )}
                            {param.type === 'source' && (
                                <select value={val} title={param.title}
                                    onChange={(e) => updateParamValue(ind.id, param.varName, e.target.value)}
                                    className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            )}
                            {param.type === 'string' && param.options && (
                                <select value={val} title={param.title}
                                    onChange={(e) => updateParamValue(ind.id, param.varName, e.target.value)}
                                    className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                    {param.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                            )}
                            {param.type === 'string' && !param.options && (
                                <input type="text" value={val} title={param.title}
                                    onChange={(e) => updateParamValue(ind.id, param.varName, e.target.value)}
                                    className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#2962FF] outline-none" />
                            )}
                            {param.type === 'bool' && (
                                <button type="button" title={param.title}
                                    onClick={() => updateParamValue(ind.id, param.varName, !val)}
                                    className={`w-8 h-4 rounded-full relative transition-colors ${val ? 'bg-[#2962FF]' : 'bg-gray-700'}`}>
                                    <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Link / Unlink toggle */}
                    {compatible.length > 0 && (
                        <select
                            value={linked ? `$param:${linkedVar}` : '__fixed__'}
                            title="Link to User Input or use fixed value"
                            onChange={(e) => {
                                if (e.target.value === '__fixed__') {
                                    updateParamValue(ind.id, param.varName, param.defaultValue);
                                } else {
                                    updateParamValue(ind.id, param.varName, e.target.value);
                                }
                            }}
                            className={`bg-[#1e222d] border rounded px-1.5 py-1 text-[10px] outline-none appearance-none flex-shrink-0 ${
                                linked ? 'border-amber-500/30 text-amber-300' : 'border-white/[0.08] text-gray-500'
                            }`}>
                            <option value="__fixed__">Fixed</option>
                            <optgroup label="Link to User Input">
                                {compatible.map((p) => (
                                    <option key={p.id} value={`$param:${p.varName}`}>{p.title || p.varName}</option>
                                ))}
                            </optgroup>
                        </select>
                    )}
                </div>
                <span className="text-[9px] text-gray-600 flex-shrink-0 w-14 text-right truncate">
                    def: {String(param.defaultValue)}
                </span>
            </div>
        );
    };

    return (
        <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-white mb-1">Indicator Building Blocks</h2>
            <p className="text-xs text-gray-500 mb-4">Add existing indicators to use as building blocks in your formulas.</p>

            {/* Indicator cards */}
            {model.indicators.length > 0 && (
                <div className="space-y-3 mb-4">
                    {model.indicators.map((ind) => (
                        <div key={ind.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-[#60a5fa] bg-[#60a5fa]/10 px-2 py-0.5 rounded">{ind.shortname}</span>
                                    <input
                                        type="text"
                                        defaultValue={ind.name}
                                        title="Rename indicator"
                                        onBlur={(e) => { if (e.target.value !== ind.name) renameIndicator(ind.id, e.target.value); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                        className="text-xs font-medium text-white bg-transparent border border-transparent hover:border-white/10 focus:border-[#2962FF] rounded px-1.5 py-0.5 outline-none w-44"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    {ind.parsed.outputs.length > 0 && (
                                        <span className="text-[9px] text-gray-500">
                                            {ind.parsed.outputs.length} output{ind.parsed.outputs.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                    <button type="button" onClick={() => removeIndicator(ind.id)} title="Remove"
                                        className="text-gray-600 hover:text-red-400 transition-colors">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Non-visual params */}
                            {ind.parsed.params.filter((p) => !p.isVisual).length > 0 && (
                                <div className="px-4 py-2">
                                    {ind.parsed.params
                                        .filter((p) => !p.isVisual)
                                        .map((p) => renderParamInput(ind, p))}
                                </div>
                            )}

                            {/* Outputs preview */}
                            {ind.parsed.outputs.length > 0 && (
                                <div className="px-4 py-2 border-t border-white/[0.03] bg-white/[0.01]">
                                    <span className="text-[9px] text-gray-600 uppercase tracking-wide">Outputs: </span>
                                    {ind.parsed.outputs.map((o, i) => (
                                        <span key={o.varName} className="text-[10px] text-[#60a5fa]">
                                            {o.title}{i < ind.parsed.outputs.length - 1 ? ', ' : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {model.indicators.length === 0 && (
                <div className="text-center py-10 border border-dashed border-white/[0.08] rounded-lg mb-4">
                    <p className="text-sm text-gray-500">No indicators added yet</p>
                    <p className="text-xs text-gray-600 mt-1">Click below to add from the indicator registry</p>
                </div>
            )}

            <button type="button" onClick={() => setShowPicker(!showPicker)}
                className="w-full py-2.5 border border-dashed border-[#2962FF]/30 rounded-lg text-xs text-[#2962FF] hover:bg-[#2962FF]/5 transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {showPicker ? 'Close Picker' : '+ Add Indicator'}
            </button>

            {/* Inline picker */}
            {showPicker && (
                <div className="mt-3 bg-white/[0.03] border border-white/[0.08] rounded-lg p-4 space-y-3">
                    {CATEGORIES.map((cat) => {
                        const inds = DEFAULT_INDICATORS.filter((i) => i.category === cat.key);
                        if (inds.length === 0) return null;
                        return (
                            <div key={cat.key}>
                                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">{cat.label}</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {inds.map((ind) => (
                                        <button
                                            key={ind.id}
                                            type="button"
                                            onClick={() => handleAdd(ind.shortname)}
                                            className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-[#2962FF]/10 border border-white/[0.08] hover:border-[#2962FF]/30 rounded text-[11px] text-gray-300 hover:text-white transition-colors"
                                        >
                                            <span className="text-[9px] font-bold text-[#60a5fa] mr-1">{ind.shortname}</span>
                                            {ind.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {/* Custom / My Indicators */}
                    {customScripts.length > 0 && (
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Custom / My Indicators</div>
                            <div className="flex flex-wrap gap-1.5">
                                {customScripts.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => handleAddCustom(s)}
                                        className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-purple-500/10 border border-white/[0.08] hover:border-purple-500/30 rounded text-[11px] text-gray-300 hover:text-white transition-colors"
                                    >
                                        <span className="text-[9px] font-bold text-purple-400 mr-1">MY</span>
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default StepIndicators;
