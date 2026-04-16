import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Indicator, IndicatorSettings } from './types';
import type { InputDef } from '../../lib/kuri/types';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface IndicatorSettingsModalProps {
    indicator: Indicator;
    onClose: () => void;
    onSave: (id: string, settings: IndicatorSettings) => void;
}

const SOURCE_OPTIONS = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'];
const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];
const LINESTYLE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
];
const PLOTSTYLE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'line', label: 'Line' },
    { value: 'stepline', label: 'Step Line' },
    { value: 'histogram', label: 'Histogram' },
    { value: 'columns', label: 'Columns' },
    { value: 'area', label: 'Area' },
    { value: 'circles', label: 'Circles' },
    { value: 'cross', label: 'Cross' },
];
const VISIBILITY_GROUPS = [
    { key: 'seconds', label: 'Seconds', values: ['1S', '5S', '15S', '30S'] },
    { key: 'minutes', label: 'Minutes', values: ['1', '3', '5', '15', '30', '45'] },
    { key: 'hours', label: 'Hours', values: ['1h', '2h', '3h', '4h'] },
    { key: 'days', label: 'Days', values: ['1D'] },
    { key: 'weeks', label: 'Weeks', values: ['1W'] },
    { key: 'months', label: 'Months', values: ['1M', '3M', '6M', '12M'] },
];

// ═══════════════════════════════════════════════════════
// CHEVRON ICON
// ═══════════════════════════════════════════════════════

const ChevronIcon: React.FC<{ expanded: boolean }> = ({ expanded }) => (
    <svg
        className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

// ═══════════════════════════════════════════════════════
// TOOLTIP ICON
// ═══════════════════════════════════════════════════════

const TooltipIcon: React.FC<{ text: string }> = ({ text }) => (
    <span className="relative group inline-flex flex-shrink-0">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-600 text-[9px] text-gray-500 cursor-help hover:text-gray-300 hover:border-gray-400">
            i
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 rounded bg-[#333] text-[10px] text-gray-200 whitespace-normal max-w-[200px] leading-tight shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
            {text}
            <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#333]" />
        </span>
    </span>
);

// ═══════════════════════════════════════════════════════
// COLOR WITH OPACITY PICKER
// ═══════════════════════════════════════════════════════

/** Parse color string to {hex, opacity}. Supports #rgb, #rrggbb, #rrggbbaa, rgba() */
function parseColorWithAlpha(color: string): { hex: string; opacity: number } {
    if (!color || typeof color !== 'string') return { hex: '#2962FF', opacity: 100 };
    // #rrggbbaa
    if (/^#[0-9a-f]{8}$/i.test(color)) {
        const hex = color.slice(0, 7);
        const alpha = parseInt(color.slice(7, 9), 16);
        return { hex, opacity: Math.round((alpha / 255) * 100) };
    }
    // rgba(r,g,b,a)
    const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
        const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
        const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
        const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
        return { hex: `#${r}${g}${b}`, opacity: Math.round(a * 100) };
    }
    // #rrggbb or #rgb
    if (color.startsWith('#'))
        return {
            hex:
                color.length === 4
                    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
                    : color,
            opacity: 100,
        };
    return { hex: '#2962FF', opacity: 100 };
}

/** Combine hex + opacity(0-100) back to #rrggbbaa */
function toHexWithAlpha(hex: string, opacity: number): string {
    const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');
    const base = hex.startsWith('#') ? hex.slice(0, 7) : `#${hex}`;
    return opacity >= 100 ? base : `${base}${alpha}`;
}

const ColorWithOpacity: React.FC<{
    value: string;
    onChange: (color: string) => void;
    title?: string;
}> = ({ value, onChange, title }) => {
    const { hex, opacity } = parseColorWithAlpha(value);
    return (
        <div className="flex items-center gap-1.5">
            <input
                type="color"
                title={title || 'Color'}
                value={hex}
                onChange={(e) => onChange(toHexWithAlpha(e.target.value, opacity))}
                className="w-6 h-6 rounded border border-[#333] cursor-pointer bg-transparent"
            />
            <input
                type="range"
                title="Opacity"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => onChange(toHexWithAlpha(hex, parseInt(e.target.value)))}
                className="w-14 h-1 accent-[#2962FF]"
            />
            <span className="text-[10px] text-gray-600 w-7 text-right">{opacity}%</span>
        </div>
    );
};

// ═══════════════════════════════════════════════════════
// INPUT WIDGET — renders one input from InputDef
// ═══════════════════════════════════════════════════════

const inputClass =
    'bg-[#0f0f0f] border border-[#333] rounded px-2 py-1 text-sm text-white focus:border-[#2962FF] focus:outline-none';

const KuriInputWidget: React.FC<{
    def: InputDef;
    value: any;
    onChange: (value: any) => void;
}> = ({ def, value, onChange }) => {
    const current = value ?? def.defval;

    const stepperBtn =
        'flex items-center justify-center w-7 h-8 text-gray-400 hover:text-white hover:bg-[#333] rounded transition-colors text-sm select-none';

    switch (def.type) {
        case 'int': {
            const step = def.step ?? 1;
            const clamp = (v: number) => {
                let n = v;
                if (def.minval !== undefined && n < def.minval) n = def.minval;
                if (def.maxval !== undefined && n > def.maxval) n = def.maxval;
                return n;
            };
            const hasRange = def.minval !== undefined && def.maxval !== undefined;
            const rangeSize = hasRange ? def.maxval! - def.minval! : Infinity;
            const showSlider = hasRange && rangeSize <= 200 && rangeSize > 0;
            return (
                <div className="flex items-center gap-1.5">
                    {showSlider && (
                        <input
                            type="range"
                            title={def.title}
                            min={def.minval}
                            max={def.maxval}
                            step={step}
                            value={current}
                            onChange={(e) => onChange(clamp(parseInt(e.target.value)))}
                            className="w-16 h-1 accent-[#2962FF]"
                        />
                    )}
                    <div className="flex items-center gap-0 bg-[#0f0f0f] border border-[#333] rounded overflow-hidden">
                        <button
                            type="button"
                            className={stepperBtn}
                            onClick={() => onChange(clamp(current - step))}
                        >
                            -
                        </button>
                        <input
                            type="number"
                            title={def.title}
                            value={current}
                            onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v)) onChange(clamp(v));
                            }}
                            min={def.minval}
                            max={def.maxval}
                            step={step}
                            className="w-16 text-center bg-transparent text-sm text-white py-1 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                            type="button"
                            className={stepperBtn}
                            onClick={() => onChange(clamp(current + step))}
                        >
                            +
                        </button>
                    </div>
                </div>
            );
        }
        case 'float': {
            const step = def.step ?? 0.1;
            const clamp = (v: number) => {
                let n = v;
                if (def.minval !== undefined && n < def.minval) n = def.minval;
                if (def.maxval !== undefined && n > def.maxval) n = def.maxval;
                return parseFloat(n.toFixed(4));
            };
            return (
                <div className="flex items-center gap-0 bg-[#0f0f0f] border border-[#333] rounded overflow-hidden">
                    <button
                        type="button"
                        className={stepperBtn}
                        onClick={() => onChange(clamp(current - step))}
                    >
                        -
                    </button>
                    <input
                        type="number"
                        title={def.title}
                        value={current}
                        onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) onChange(clamp(v));
                        }}
                        min={def.minval}
                        max={def.maxval}
                        step={step}
                        className="w-16 text-center bg-transparent text-sm text-white py-1 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                        type="button"
                        className={stepperBtn}
                        onClick={() => onChange(clamp(current + step))}
                    >
                        +
                    </button>
                </div>
            );
        }
        case 'bool':
            return (
                <button
                    type="button"
                    title={`Toggle ${def.title}`}
                    onClick={() => onChange(!current)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${current ? 'bg-[#2962FF]' : 'bg-[#333]'}`}
                >
                    <div
                        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${current ? 'left-5' : 'left-0.5'}`}
                    />
                </button>
            );
        case 'string':
            if (def.options && def.options.length > 0) {
                return (
                    <select
                        value={current}
                        title={def.title}
                        onChange={(e) => onChange(e.target.value)}
                        className={inputClass}
                    >
                        {def.options.map((opt) => (
                            <option key={opt} value={opt}>
                                {opt}
                            </option>
                        ))}
                    </select>
                );
            }
            return (
                <input
                    type="text"
                    title={def.title}
                    value={current}
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-32 ${inputClass}`}
                />
            );
        case 'color':
            return (
                <ColorWithOpacity
                    value={current ?? '#2962FF'}
                    onChange={onChange}
                    title={def.title}
                />
            );
        case 'source':
            return (
                <select
                    value={current}
                    title={def.title}
                    onChange={(e) => onChange(e.target.value)}
                    className={inputClass}
                >
                    {SOURCE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
            );
        case 'timeframe':
            return (
                <select
                    title={def.title}
                    value={current}
                    onChange={(e) => onChange(e.target.value)}
                    className={inputClass}
                >
                    {TIMEFRAME_OPTIONS.map((tf) => (
                        <option key={tf} value={tf}>
                            {tf}
                        </option>
                    ))}
                </select>
            );
        case 'session':
            return (
                <div className="flex items-center gap-1">
                    <input
                        type="time"
                        title={`${def.title} start`}
                        value={(current || '0930-1600').split('-')[0] || '09:30'}
                        onChange={(e) => {
                            const end = (current || '0930-1600').split('-')[1] || '1600';
                            onChange(`${e.target.value.replace(':', '')}-${end}`);
                        }}
                        className={`w-[72px] ${inputClass}`}
                    />
                    <span className="text-gray-600 text-xs">-</span>
                    <input
                        type="time"
                        title={`${def.title} end`}
                        value={
                            (current || '0930-1600')
                                .split('-')[1]
                                ?.replace(/(\d{2})(\d{2})/, '$1:$2') || '16:00'
                        }
                        onChange={(e) => {
                            const start = (current || '0930-1600').split('-')[0] || '0930';
                            onChange(`${start}-${e.target.value.replace(':', '')}`);
                        }}
                        className={`w-[72px] ${inputClass}`}
                    />
                </div>
            );
        case 'symbol':
            return (
                <input
                    type="text"
                    title={def.title}
                    value={current || ''}
                    placeholder="BTCUSDT"
                    onChange={(e) => onChange(e.target.value.toUpperCase())}
                    className={`w-28 ${inputClass}`}
                />
            );
        case 'text_area':
            return (
                <textarea
                    title={def.title}
                    value={current || ''}
                    onChange={(e) => onChange(e.target.value)}
                    rows={3}
                    className={`w-full ${inputClass} resize-y`}
                />
            );
        default:
            return <span className="text-xs text-gray-500">{String(current)}</span>;
    }
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function resolveInputValue(def: InputDef, settings: IndicatorSettings): any {
    const s = settings as any;
    if (def.title in s) return s[def.title];
    return def.defval;
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

const IndicatorSettingsModal: React.FC<IndicatorSettingsModalProps> = ({
    indicator,
    onClose,
    onSave,
}) => {
    const hasKuriDefs = indicator.kuriInputDefs && indicator.kuriInputDefs.length > 0;
    const hasKuriPlots = indicator.kuriPlots && indicator.kuriPlots.length > 0;
    const hasKuriHlines = indicator.kuriHlines && indicator.kuriHlines.length > 0;
    const hasFills = indicator.kuriFills && indicator.kuriFills.length > 0;
    const hasBgcolors = indicator.kuriBgcolors && indicator.kuriBgcolors.length > 0;
    const hasStyleTab = hasKuriPlots || hasKuriHlines || hasFills || hasBgcolors;

    // Tab state — 3 tabs like TradingView
    const [activeTab, setActiveTab] = useState<'inputs' | 'style' | 'visibility'>(
        hasKuriDefs ? 'inputs' : 'style'
    );

    // Collapsible group state
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const toggleGroup = useCallback((group: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    }, []);

    // ── SINGLE SOURCE OF TRUTH ──
    const [localSettings, setLocalSettings] = useState<IndicatorSettings>(() => ({
        ...indicator.settings,
    }));
    const localSettingsRef = useRef(localSettings);
    localSettingsRef.current = localSettings;

    // ── LIVE UPDATE DEBOUNCE ──
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const emitLiveUpdate = useCallback(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onSave(indicator.id, localSettingsRef.current);
        }, 120);
    }, [indicator.id, onSave]);

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    // ── INPUT CHANGE (live) ──
    const handleInputChange = useCallback(
        (title: string, value: any) => {
            setLocalSettings((prev) => {
                const next = { ...prev } as any;
                next[title] = value;
                return next;
            });
            setTimeout(emitLiveUpdate, 0);
        },
        [emitLiveUpdate]
    );

    // ── STYLE CHANGE — PLOT (live) ──
    const handlePlotStyleChange = useCallback(
        (
            plotIndex: number,
            _plotTitle: string,
            changes: {
                color?: string;
                linewidth?: number;
                visible?: boolean;
                linestyle?: string;
                plotstyle?: string;
            }
        ) => {
            setLocalSettings((prev) => {
                const next = { ...prev } as any;
                if (changes.color !== undefined) next[`plot_${plotIndex}_color`] = changes.color;
                if (changes.linewidth !== undefined)
                    next[`plot_${plotIndex}_linewidth`] = changes.linewidth;
                if (changes.visible !== undefined)
                    next[`plot_${plotIndex}_visible`] = changes.visible;
                if (changes.linestyle !== undefined)
                    next[`plot_${plotIndex}_linestyle`] = changes.linestyle;
                if (changes.plotstyle !== undefined)
                    next[`plot_${plotIndex}_plotstyle`] = changes.plotstyle;
                return next;
            });
            setTimeout(emitLiveUpdate, 0);
        },
        [emitLiveUpdate]
    );

    // ── STYLE CHANGE — HLINE (live) ──
    const handleHlineStyleChange = useCallback(
        (
            hlineIndex: number,
            changes: { color?: string; linestyle?: string; visible?: boolean }
        ) => {
            setLocalSettings((prev) => {
                const next = { ...prev } as any;
                if (changes.color !== undefined) next[`hline_${hlineIndex}_color`] = changes.color;
                if (changes.linestyle !== undefined)
                    next[`hline_${hlineIndex}_linestyle`] = changes.linestyle;
                if (changes.visible !== undefined)
                    next[`hline_${hlineIndex}_visible`] = changes.visible;
                return next;
            });
            setTimeout(emitLiveUpdate, 0);
        },
        [emitLiveUpdate]
    );

    // ── STYLE CHANGE — FILL (live) ──
    const handleFillStyleChange = useCallback(
        (fillIndex: number, changes: { color?: string; visible?: boolean }) => {
            setLocalSettings((prev) => {
                const next = { ...prev } as any;
                if (changes.color !== undefined) next[`fill_${fillIndex}_color`] = changes.color;
                if (changes.visible !== undefined)
                    next[`fill_${fillIndex}_visible`] = changes.visible;
                return next;
            });
            setTimeout(emitLiveUpdate, 0);
        },
        [emitLiveUpdate]
    );

    // ── STYLE CHANGE — BGCOLOR (live) ──
    const handleBgcolorStyleChange = useCallback(
        (bgIndex: number, changes: { visible?: boolean }) => {
            setLocalSettings((prev) => {
                const next = { ...prev } as any;
                if (changes.visible !== undefined)
                    next[`bgcolor_${bgIndex}_visible`] = changes.visible;
                return next;
            });
            setTimeout(emitLiveUpdate, 0);
        },
        [emitLiveUpdate]
    );

    // ── VISIBILITY CHANGE ──
    const handleVisibilityChange = useCallback(
        (key: string, checked: boolean) => {
            setLocalSettings((prev) => {
                const next = { ...prev } as any;
                next[`vis_${key}`] = checked;
                return next;
            });
            setTimeout(emitLiveUpdate, 0);
        },
        [emitLiveUpdate]
    );

    // ── RESET ──
    const handleReset = useCallback(() => {
        setLocalSettings(() => {
            const reset = { ...indicator.settings } as any;
            if (indicator.kuriInputDefs) {
                indicator.kuriInputDefs.forEach((def) => {
                    reset[def.title] = def.type === 'source' ? 'close' : def.defval;
                });
            }
            if (indicator.kuriPlots) {
                indicator.kuriPlots.forEach((p: any, idx: number) => {
                    reset[`plot_${idx}_color`] = p.color;
                    reset[`plot_${idx}_linewidth`] = p.linewidth;
                    reset[`plot_${idx}_visible`] = true;
                    reset[`plot_${idx}_plotstyle`] = p.style || 'line';
                    reset[`plot_${idx}_linestyle`] = 'solid';
                    // Clear per-bar color overrides
                    if (Array.isArray(p.colors)) {
                        const seen = new Set<string>();
                        let ci = 0;
                        for (const c of p.colors) {
                            if (c && !seen.has(c)) {
                                seen.add(c);
                                delete reset[`plot_${idx}_barcolor_${ci}`];
                                ci++;
                            }
                        }
                    }
                });
            }
            if (indicator.kuriHlines) {
                indicator.kuriHlines.forEach((_h: any, idx: number) => {
                    reset[`hline_${idx}_color`] = _h.color;
                    reset[`hline_${idx}_linestyle`] = 'solid';
                    reset[`hline_${idx}_visible`] = true;
                });
            }
            // Reset fill/bgcolor visibility
            if (indicator.kuriFills) {
                indicator.kuriFills.forEach((_f: any, idx: number) => {
                    reset[`fill_${idx}_visible`] = true;
                    delete reset[`fill_${idx}_color`];
                });
            }
            if (indicator.kuriBgcolors) {
                indicator.kuriBgcolors.forEach((_b: any, idx: number) => {
                    reset[`bgcolor_${idx}_visible`] = true;
                });
            }
            return reset;
        });
        setTimeout(emitLiveUpdate, 0);
    }, [indicator, emitLiveUpdate]);

    // ── GROUP INPUTS with inline support ──
    const MA_FUNCTION_OPTIONS = useMemo(
        () =>
            new Set([
                'SMA',
                'EMA',
                'WMA',
                'SMMA (RMA)',
                'RMA',
                'VWMA',
                'DEMA',
                'TEMA',
                'SMA + Bollinger Bands',
                'None',
            ]),
        []
    );
    const isFunctionSelector = useCallback(
        (def: InputDef) => {
            if (def.type !== 'string' || !def.options || def.options.length === 0) return false;
            const matchCount = def.options.filter((o) => MA_FUNCTION_OPTIONS.has(o)).length;
            return matchCount >= def.options.length * 0.5;
        },
        [MA_FUNCTION_OPTIONS]
    );

    const groupedInputs = useMemo(() => {
        if (!hasKuriDefs) return {};
        return (indicator.kuriInputDefs || []).reduce(
            (acc, def) => {
                if (isFunctionSelector(def)) return acc;
                const group = def.group || 'Parameters';
                if (!acc[group]) acc[group] = [];
                acc[group].push(def);
                return acc;
            },
            {} as Record<string, InputDef[]>
        );
    }, [hasKuriDefs, indicator.kuriInputDefs, isFunctionSelector]);

    const displayTitle = indicator.kuriTitle || indicator.type;
    const groupKeys = Object.keys(groupedInputs);
    const showGroupHeaders = groupKeys.length > 1;

    // Filter plots by display !== 'none' for Style tab
    const visiblePlots = useMemo(
        () =>
            (indicator.kuriPlots || [])
                .map((p, i) => ({ ...p, _idx: i }))
                .filter((p: any) => p.display !== 'none'),
        [indicator.kuriPlots]
    );
    // Filter hlines by editable !== false
    const editableHlines = useMemo(
        () =>
            (indicator.kuriHlines || [])
                .map((h, i) => ({ ...h, _idx: i }))
                .filter((h: any) => h.editable !== false),
        [indicator.kuriHlines]
    );

    const ls = localSettings as any;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
        >
            <div
                className="bg-[#1a1a1a] border border-[#2A2A2A] rounded-lg w-[400px] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A2A]">
                    <h3 className="text-base font-semibold text-white">{displayTitle}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close Settings"
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                {/* 3-Tab bar like TradingView */}
                <div className="flex border-b border-[#2A2A2A]">
                    {hasKuriDefs && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('inputs')}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activeTab === 'inputs'
                                    ? 'text-white border-b-2 border-[#2962FF]'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            Inputs
                        </button>
                    )}
                    {hasStyleTab && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('style')}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activeTab === 'style'
                                    ? 'text-white border-b-2 border-[#2962FF]'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            Style
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setActiveTab('visibility')}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                            activeTab === 'visibility'
                                ? 'text-white border-b-2 border-[#2962FF]'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        Visibility
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-1 max-h-[400px] overflow-y-auto">
                    {/* ═══ INPUTS TAB ═══ */}
                    {hasKuriDefs && activeTab === 'inputs' && (
                        <>
                            {groupKeys.map((group) => {
                                const defs = groupedInputs[group];
                                const isCollapsed = collapsedGroups.has(group);

                                // Group inline inputs by their inline key
                                const rows: Array<InputDef | InputDef[]> = [];
                                let i = 0;
                                while (i < defs.length) {
                                    const def = defs[i];
                                    if (def.inline) {
                                        const inlineGroup: InputDef[] = [def];
                                        let j = i + 1;
                                        while (j < defs.length && defs[j].inline === def.inline) {
                                            inlineGroup.push(defs[j]);
                                            j++;
                                        }
                                        rows.push(inlineGroup);
                                        i = j;
                                    } else {
                                        rows.push(def);
                                        i++;
                                    }
                                }

                                return (
                                    <div key={group}>
                                        {showGroupHeaders && (
                                            <button
                                                type="button"
                                                onClick={() => toggleGroup(group)}
                                                className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium tracking-wider uppercase mt-4 mb-2 hover:text-gray-300 transition-colors w-full text-left"
                                            >
                                                <ChevronIcon expanded={!isCollapsed} />
                                                {group}
                                            </button>
                                        )}
                                        {!isCollapsed &&
                                            rows.map((row, rowIdx) => {
                                                if (Array.isArray(row)) {
                                                    // Inline row: multiple inputs side by side
                                                    return (
                                                        <div
                                                            key={`inline-${rowIdx}`}
                                                            className="flex items-center gap-2 py-1.5"
                                                        >
                                                            {row.map((def) => (
                                                                <div
                                                                    key={def.title}
                                                                    className="flex items-center gap-1.5"
                                                                >
                                                                    <label className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[80px]">
                                                                        {def.title}
                                                                    </label>
                                                                    {def.tooltip && (
                                                                        <TooltipIcon
                                                                            text={def.tooltip}
                                                                        />
                                                                    )}
                                                                    <KuriInputWidget
                                                                        def={def}
                                                                        value={resolveInputValue(
                                                                            def,
                                                                            localSettings
                                                                        )}
                                                                        onChange={(v) =>
                                                                            handleInputChange(
                                                                                def.title,
                                                                                v
                                                                            )
                                                                        }
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                }
                                                // Single input row
                                                return (
                                                    <div
                                                        key={row.title}
                                                        className="flex items-center justify-between gap-3 py-1.5"
                                                    >
                                                        <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
                                                            <label
                                                                className="text-xs text-gray-400 truncate max-w-[140px]"
                                                                title={row.title}
                                                            >
                                                                {row.title}
                                                            </label>
                                                            {row.tooltip && (
                                                                <TooltipIcon text={row.tooltip} />
                                                            )}
                                                        </div>
                                                        <KuriInputWidget
                                                            def={row}
                                                            value={resolveInputValue(
                                                                row,
                                                                localSettings
                                                            )}
                                                            onChange={(v) =>
                                                                handleInputChange(row.title, v)
                                                            }
                                                        />
                                                    </div>
                                                );
                                            })}
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* ═══ STYLE TAB ═══ */}
                    {hasStyleTab && activeTab === 'style' && (
                        <>
                            {/* Plot rows — filtered by display !== 'none' */}
                            {visiblePlots.length > 0 && (
                                <>
                                    <div className="text-xs text-gray-500 font-medium mb-2">
                                        Plots
                                    </div>
                                    {visiblePlots.map((plot: any) => {
                                        const plotIndex = plot._idx;
                                        const isVisible = ls[`plot_${plotIndex}_visible`] ?? true;
                                        const currentColor =
                                            ls[`plot_${plotIndex}_color`] ?? plot.color;
                                        const currentLinewidth =
                                            ls[`plot_${plotIndex}_linewidth`] ?? plot.linewidth;

                                        // Extract unique per-bar colors for multi-color plots (e.g. MACD histogram)
                                        const uniqueBarColors: string[] = [];
                                        if (Array.isArray(plot.colors)) {
                                            const seen = new Set<string>();
                                            for (const c of plot.colors) {
                                                if (c && typeof c === 'string' && !seen.has(c)) {
                                                    seen.add(c);
                                                    uniqueBarColors.push(c);
                                                }
                                            }
                                        }
                                        const hasMultiColors = uniqueBarColors.length > 1;

                                        return (
                                            <div key={plot.title}>
                                                <div
                                                    className={`flex items-center justify-between gap-2 py-1.5 ${!isVisible ? 'opacity-40' : ''}`}
                                                >
                                                    <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                                                        <button
                                                            type="button"
                                                            title={`Toggle ${plot.title} visibility`}
                                                            onClick={() =>
                                                                handlePlotStyleChange(
                                                                    plotIndex,
                                                                    plot.title,
                                                                    { visible: !isVisible }
                                                                )
                                                            }
                                                            className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 ${
                                                                isVisible
                                                                    ? 'bg-[#2962FF] border-[#2962FF]'
                                                                    : 'bg-transparent border-[#555]'
                                                            }`}
                                                        />
                                                        <span className="text-xs text-gray-400 truncate max-w-[80px]">
                                                            {plot.title}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        {!hasMultiColors && (
                                                            <ColorWithOpacity
                                                                value={currentColor}
                                                                title={`${plot.title} color`}
                                                                onChange={(c) =>
                                                                    handlePlotStyleChange(
                                                                        plotIndex,
                                                                        plot.title,
                                                                        { color: c }
                                                                    )
                                                                }
                                                            />
                                                        )}
                                                        <select
                                                            title={`${plot.title} plot style`}
                                                            value={
                                                                ls[`plot_${plotIndex}_plotstyle`] ??
                                                                plot.style ??
                                                                'line'
                                                            }
                                                            onChange={(e) =>
                                                                handlePlotStyleChange(
                                                                    plotIndex,
                                                                    plot.title,
                                                                    { plotstyle: e.target.value }
                                                                )
                                                            }
                                                            className="bg-[#0f0f0f] border border-[#333] rounded px-1 py-0.5 text-xs text-white w-[68px]"
                                                        >
                                                            {PLOTSTYLE_OPTIONS.map((o) => (
                                                                <option
                                                                    key={o.value}
                                                                    value={o.value}
                                                                >
                                                                    {o.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            title={`${plot.title} line style`}
                                                            value={
                                                                ls[`plot_${plotIndex}_linestyle`] ??
                                                                'solid'
                                                            }
                                                            onChange={(e) =>
                                                                handlePlotStyleChange(
                                                                    plotIndex,
                                                                    plot.title,
                                                                    { linestyle: e.target.value }
                                                                )
                                                            }
                                                            className="bg-[#0f0f0f] border border-[#333] rounded px-1 py-0.5 text-xs text-white w-[60px]"
                                                        >
                                                            {LINESTYLE_OPTIONS.map((o) => (
                                                                <option
                                                                    key={o.value}
                                                                    value={o.value}
                                                                >
                                                                    {o.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            title={`${plot.title} line width`}
                                                            value={currentLinewidth}
                                                            onChange={(e) =>
                                                                handlePlotStyleChange(
                                                                    plotIndex,
                                                                    plot.title,
                                                                    {
                                                                        linewidth: parseInt(
                                                                            e.target.value
                                                                        ),
                                                                    }
                                                                )
                                                            }
                                                            className="bg-[#0f0f0f] border border-[#333] rounded px-1 py-0.5 text-xs text-white w-[46px]"
                                                        >
                                                            {[1, 2, 3, 4].map((w) => (
                                                                <option key={w} value={w}>
                                                                    {w}px
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                                {/* Per-bar color swatches for multi-color plots (e.g. MACD histogram) */}
                                                {hasMultiColors && isVisible && (
                                                    <div className="flex items-center gap-1.5 pl-6 pb-1">
                                                        {uniqueBarColors.map((origColor, ci) => {
                                                            const overrideKey = `plot_${plotIndex}_barcolor_${ci}`;
                                                            const displayColor =
                                                                ls[overrideKey] ?? origColor;
                                                            return (
                                                                <ColorWithOpacity
                                                                    key={ci}
                                                                    value={displayColor}
                                                                    title={`${plot.title} color ${ci + 1}`}
                                                                    onChange={(c) => {
                                                                        setLocalSettings((prev) => {
                                                                            const next = {
                                                                                ...prev,
                                                                            } as any;
                                                                            next[overrideKey] = c;
                                                                            return next;
                                                                        });
                                                                        setTimeout(
                                                                            emitLiveUpdate,
                                                                            0
                                                                        );
                                                                    }}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </>
                            )}

                            {/* Fill rows */}
                            {hasFills && (
                                <>
                                    <div className="text-xs text-gray-500 font-medium mb-2 mt-3">
                                        Fills
                                    </div>
                                    {(indicator.kuriFills || []).map((fill, fillIndex) => {
                                        const isVisible = ls[`fill_${fillIndex}_visible`] ?? true;
                                        const currentColor =
                                            ls[`fill_${fillIndex}_color`] ?? fill.color;
                                        return (
                                            <div
                                                key={`fill-${fillIndex}`}
                                                className={`flex items-center justify-between gap-3 py-1.5 ${!isVisible ? 'opacity-40' : ''}`}
                                            >
                                                <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                                                    <button
                                                        type="button"
                                                        title="Toggle fill visibility"
                                                        onClick={() =>
                                                            handleFillStyleChange(fillIndex, {
                                                                visible: !isVisible,
                                                            })
                                                        }
                                                        className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 ${
                                                            isVisible
                                                                ? 'bg-[#2962FF] border-[#2962FF]'
                                                                : 'bg-transparent border-[#555]'
                                                        }`}
                                                    />
                                                    <span className="text-xs text-gray-400 truncate max-w-[120px]">
                                                        {fill.plot1} / {fill.plot2}
                                                    </span>
                                                </div>
                                                <ColorWithOpacity
                                                    value={currentColor ?? '#2196F3'}
                                                    title="Fill color"
                                                    onChange={(c) =>
                                                        handleFillStyleChange(fillIndex, {
                                                            color: c,
                                                        })
                                                    }
                                                />
                                            </div>
                                        );
                                    })}
                                </>
                            )}

                            {/* Hline rows — filtered by editable !== false */}
                            {editableHlines.length > 0 && (
                                <>
                                    <div className="text-xs text-gray-500 font-medium mb-2 mt-3">
                                        Levels
                                    </div>
                                    {editableHlines.map((hline: any) => {
                                        const hlineIndex = hline._idx;
                                        const key = hline.title || `Level ${hline.price}`;
                                        const isVisible = ls[`hline_${hlineIndex}_visible`] ?? true;
                                        const currentColor =
                                            ls[`hline_${hlineIndex}_color`] ?? hline.color;
                                        const currentLinestyle =
                                            ls[`hline_${hlineIndex}_linestyle`] ?? 'solid';
                                        return (
                                            <div
                                                key={key}
                                                className={`flex items-center justify-between gap-3 py-1.5 ${!isVisible ? 'opacity-40' : ''}`}
                                            >
                                                <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                                                    <button
                                                        type="button"
                                                        title={`Toggle ${key} visibility`}
                                                        onClick={() =>
                                                            handleHlineStyleChange(hlineIndex, {
                                                                visible: !isVisible,
                                                            })
                                                        }
                                                        className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 ${
                                                            isVisible
                                                                ? 'bg-[#2962FF] border-[#2962FF]'
                                                                : 'bg-transparent border-[#555]'
                                                        }`}
                                                    />
                                                    <span className="text-xs text-gray-400 truncate max-w-[80px]">
                                                        {hline.title || `${hline.price}`}
                                                    </span>
                                                    <span className="text-xs text-gray-600 font-mono">
                                                        {hline.price}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <ColorWithOpacity
                                                        value={currentColor}
                                                        title={`${key} color`}
                                                        onChange={(c) =>
                                                            handleHlineStyleChange(hlineIndex, {
                                                                color: c,
                                                            })
                                                        }
                                                    />
                                                    <select
                                                        title={`${key} line style`}
                                                        value={currentLinestyle}
                                                        onChange={(e) =>
                                                            handleHlineStyleChange(hlineIndex, {
                                                                linestyle: e.target.value,
                                                            })
                                                        }
                                                        className="bg-[#0f0f0f] border border-[#333] rounded px-1 py-0.5 text-xs text-white w-[72px]"
                                                    >
                                                        {LINESTYLE_OPTIONS.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}

                            {/* Bgcolor rows */}
                            {hasBgcolors && (
                                <>
                                    <div className="text-xs text-gray-500 font-medium mb-2 mt-3">
                                        Background
                                    </div>
                                    {(indicator.kuriBgcolors || []).map((_bg, bgIndex) => {
                                        const isVisible = ls[`bgcolor_${bgIndex}_visible`] ?? true;
                                        return (
                                            <div
                                                key={`bg-${bgIndex}`}
                                                className={`flex items-center gap-2 py-1.5 ${!isVisible ? 'opacity-40' : ''}`}
                                            >
                                                <button
                                                    type="button"
                                                    title="Toggle background color visibility"
                                                    onClick={() =>
                                                        handleBgcolorStyleChange(bgIndex, {
                                                            visible: !isVisible,
                                                        })
                                                    }
                                                    className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 ${
                                                        isVisible
                                                            ? 'bg-[#2962FF] border-[#2962FF]'
                                                            : 'bg-transparent border-[#555]'
                                                    }`}
                                                />
                                                <span className="text-xs text-gray-400">
                                                    Background {bgIndex + 1}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </>
                    )}

                    {/* ═══ VISIBILITY TAB ═══ */}
                    {activeTab === 'visibility' && (
                        <div className="space-y-2">
                            <div className="text-xs text-gray-500 mb-2">
                                Show indicator on these timeframes:
                            </div>
                            {VISIBILITY_GROUPS.map((group) => {
                                const checked = ls[`vis_${group.key}`] ?? true;
                                return (
                                    <div
                                        key={group.key}
                                        className="flex items-center justify-between py-1"
                                    >
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                title={`Toggle ${group.label} visibility`}
                                                onClick={() =>
                                                    handleVisibilityChange(group.key, !checked)
                                                }
                                                className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 ${
                                                    checked
                                                        ? 'bg-[#2962FF] border-[#2962FF]'
                                                        : 'bg-transparent border-[#555]'
                                                }`}
                                            />
                                            <span className="text-xs text-gray-300">
                                                {group.label}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-gray-600">
                                            {group.values.join(', ')}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Empty state */}
                    {!hasKuriDefs && !hasStyleTab && activeTab !== 'visibility' && (
                        <div className="text-xs text-gray-500 text-center py-6">
                            No configurable settings available for this indicator.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between px-4 py-3 border-t border-[#2A2A2A]">
                    {hasKuriDefs || hasStyleTab ? (
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-[#333] hover:border-[#555] rounded transition-colors"
                        >
                            Reset
                        </button>
                    ) : (
                        <div />
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 text-xs bg-[#2962FF] hover:bg-[#1e54e8] text-white rounded transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IndicatorSettingsModal;
