import React, { useCallback } from 'react';
import type { IndicatorModel, PlotDef, PlotKind } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const PLOT_KINDS: { value: PlotKind; label: string }[] = [
    { value: 'line', label: 'Line' },
    { value: 'level', label: 'Level' },
    { value: 'histogram', label: 'Histogram' },
    { value: 'area', label: 'Area' },
    { value: 'marker', label: 'Marker' },
];

const LINE_STYLES: { value: 'solid' | 'dashed' | 'dotted'; label: string }[] = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
];

const DEFAULT_COLORS = ['#2962FF', '#FF6D00', '#00E676', '#E040FB', '#FFEA00', '#FF1744', '#00E5FF', '#FF9100'];

const StepPlotting: React.FC<Props> = ({ model, update }) => {
    const { plots, formulas, parameters } = model;
    const boolParams = parameters.filter((p) => p.type === 'bool');
    const intParams = parameters.filter((p) => p.type === 'int');

    const setPlots = useCallback((fn: (prev: PlotDef[]) => PlotDef[]) => {
        update({ plots: fn(model.plots) });
    }, [model.plots, update]);

    const addPlot = () => {
        if (formulas.length === 0) return;
        const colorIdx = plots.length % DEFAULT_COLORS.length;
        const newPlot: PlotDef = {
            id: String(Date.now()),
            formulaId: formulas[0].id,
            title: `Plot ${plots.length + 1}`,
            kind: 'line',
            color: DEFAULT_COLORS[colorIdx],
            lineStyle: 'solid',
            width: 2,
        };
        setPlots((prev) => [...prev, newPlot]);
    };

    const updatePlot = (id: string, patch: Partial<PlotDef>) => {
        setPlots((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    };

    const removePlot = (id: string) => {
        setPlots((prev) => prev.filter((p) => p.id !== id));
    };

    return (
        <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-white mb-1">Plotting</h2>
            <p className="text-xs text-gray-500 mb-4">Define how each formula renders on the chart.</p>

            {formulas.length === 0 ? (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6 text-center">
                    <p className="text-sm text-gray-500">Create formulas in Step 3 first.</p>
                </div>
            ) : (
                <>
                    <div className="space-y-3 mb-4">
                        {plots.map((p) => (
                            <div key={p.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Formula select */}
                                    <select
                                        value={p.formulaId}
                                        title="Formula to plot"
                                        onChange={(e) => updatePlot(p.id, { formulaId: e.target.value })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-emerald-400 font-mono focus:border-[#2962FF] outline-none appearance-none"
                                    >
                                        {formulas.map((f) => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>

                                    {/* Title */}
                                    <input
                                        type="text"
                                        value={p.title}
                                        title="Plot title"
                                        onChange={(e) => updatePlot(p.id, { title: e.target.value })}
                                        placeholder="Title"
                                        className="w-28 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#2962FF] outline-none"
                                    />

                                    {/* Kind */}
                                    <select
                                        value={p.kind}
                                        title="Plot type"
                                        onChange={(e) => updatePlot(p.id, { kind: e.target.value as PlotKind })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none"
                                    >
                                        {PLOT_KINDS.map((k) => (
                                            <option key={k.value} value={k.value}>{k.label}</option>
                                        ))}
                                    </select>

                                    {/* Color */}
                                    <input
                                        type="color"
                                        value={p.color}
                                        title="Color"
                                        onChange={(e) => updatePlot(p.id, { color: e.target.value })}
                                        className="w-8 h-8 rounded border border-white/[0.08] cursor-pointer bg-transparent"
                                    />

                                    {/* Line style (for line, level) */}
                                    {(p.kind === 'line' || p.kind === 'level') && (
                                        <select
                                            value={p.lineStyle}
                                            title="Line style"
                                            onChange={(e) => updatePlot(p.id, { lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none"
                                        >
                                            {LINE_STYLES.map((s) => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                    )}

                                    {/* Width (for line, level) — with Link to User Input support */}
                                    {(p.kind === 'line' || p.kind === 'level') && (
                                        <div className="flex items-center gap-1">
                                            {p.widthParam ? (
                                                <span className="text-[10px] text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                    width: {parameters.find((pp) => pp.varName === p.widthParam)?.title || p.widthParam}
                                                </span>
                                            ) : (
                                                <input
                                                    type="number"
                                                    value={p.width}
                                                    title="Line width"
                                                    min={1}
                                                    max={4}
                                                    onChange={(e) => updatePlot(p.id, { width: parseInt(e.target.value) || 1 })}
                                                    className="w-12 bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1.5 text-xs text-gray-200 text-center focus:border-[#2962FF] outline-none"
                                                />
                                            )}
                                            {intParams.length > 0 && (
                                                <select value={p.widthParam || '__fixed__'} title="Link width to a User Input"
                                                    onChange={(e) => updatePlot(p.id, { widthParam: e.target.value === '__fixed__' ? undefined : e.target.value })}
                                                    className={`border rounded px-1 py-1 text-[10px] outline-none appearance-none ${
                                                        p.widthParam ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-[#1e222d] border-white/[0.08] text-gray-500'
                                                    }`}>
                                                    <option value="__fixed__">Fixed</option>
                                                    <optgroup label="Link width to">
                                                        {intParams.map((pp) => <option key={pp.id} value={pp.varName}>{pp.title || pp.varName}</option>)}
                                                    </optgroup>
                                                </select>
                                            )}
                                        </div>
                                    )}

                                    {/* Show-only-if (visibility linked to a bool User Input) */}
                                    {boolParams.length > 0 && (
                                        <select value={p.visibilityParam || '__always__'}
                                            title="Show only when a User Input toggle is ON"
                                            onChange={(e) => updatePlot(p.id, { visibilityParam: e.target.value === '__always__' ? undefined : e.target.value })}
                                            className={`border rounded px-1.5 py-1 text-[10px] outline-none appearance-none ${
                                                p.visibilityParam ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-[#1e222d] border-white/[0.08] text-gray-500'
                                            }`}>
                                            <option value="__always__">Always visible</option>
                                            <optgroup label="Show only when ON">
                                                {boolParams.map((pp) => <option key={pp.id} value={pp.varName}>{pp.title || pp.varName}</option>)}
                                            </optgroup>
                                        </select>
                                    )}

                                    {/* Marker location */}
                                    {p.kind === 'marker' && (
                                        <select
                                            value={p.markerLocation || 'below'}
                                            title="Marker location"
                                            onChange={(e) => updatePlot(p.id, { markerLocation: e.target.value as 'above' | 'below' })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none"
                                        >
                                            <option value="above">Above</option>
                                            <option value="below">Below</option>
                                        </select>
                                    )}

                                    {/* Remove */}
                                    <button type="button" onClick={() => removePlot(p.id)} title="Remove plot"
                                        className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 ml-auto">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button type="button" onClick={addPlot}
                        className="w-full py-2.5 border border-dashed border-[#2962FF]/30 rounded-lg text-xs text-[#2962FF] hover:bg-[#2962FF]/5 transition-colors flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        + Add Plot
                    </button>
                </>
            )}
        </div>
    );
};

export default StepPlotting;
