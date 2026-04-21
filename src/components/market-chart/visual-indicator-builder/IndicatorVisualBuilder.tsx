import React, { useState, useEffect, useMemo } from 'react';
import { IndicatorModel, createEmptyModel } from './types';
import StepInfo from './steps/StepInfo';
import StepParameters from './steps/StepParameters';
import StepIndicators from './steps/StepIndicators';
import StepLogic from './steps/StepLogic';
import StepPlotting from './steps/StepPlotting';
import StepAlerts from './steps/StepAlerts';
import { generateKuri } from './codegen';

interface Props {
    initialSource?: string;
    onSourceChange: (source: string) => void;
}

const STEPS = [
    { num: 1, label: 'Info' },
    { num: 2, label: 'User Inputs' },
    { num: 3, label: 'Indicators' },
    { num: 4, label: 'Logic & Math' },
    { num: 5, label: 'Plotting' },
    { num: 6, label: 'Alerts' },
];

const IndicatorVisualBuilder: React.FC<Props> = ({ onSourceChange }) => {
    const [step, setStep] = useState(1);
    const [model, setModel] = useState<IndicatorModel>(createEmptyModel());
    const [codeCollapsed, setCodeCollapsed] = useState(false);
    const [previewTab, setPreviewTab] = useState<'code' | 'inputs' | 'style'>('code');

    const update = (patch: Partial<IndicatorModel>) => setModel((prev) => ({ ...prev, ...patch }));

    const generatedCode = useMemo(() => generateKuri(model), [model]);

    useEffect(() => {
        onSourceChange(generatedCode);
    }, [generatedCode, onSourceChange]);

    return (
        <div className="flex flex-col h-full bg-[#09090b] text-white">
            {/* Steps bar — with Back/Next on the right */}
            <div className="flex items-center justify-center gap-0 py-3 px-6 border-b border-white/5 relative">
                <button type="button"
                    onClick={() => { if (confirm('Discard the current indicator and start fresh?')) { setModel(createEmptyModel()); setStep(1); } }}
                    title="Clear everything and start a brand-new indicator"
                    className="absolute left-6 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded">
                    + New Indicator
                </button>
                {STEPS.map((s, i) => (
                    <React.Fragment key={s.num}>
                        {i > 0 && <div className="w-8 h-px bg-white/10 mx-1.5" />}
                        <button type="button" onClick={() => setStep(s.num)} className="flex items-center gap-1.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                step === s.num ? 'bg-[#2962FF] text-white' : step > s.num ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-600'
                            }`}>{step > s.num ? '\u2713' : s.num}</div>
                            <span className={`text-[10px] font-medium hidden lg:inline ${step === s.num ? 'text-white' : step > s.num ? 'text-emerald-400' : 'text-gray-600'}`}>{s.label}</span>
                        </button>
                    </React.Fragment>
                ))}
                {/* Back / Next — top right */}
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className="text-[10px] text-gray-600 hidden md:inline">Step {step}/{STEPS.length}</span>
                    <button type="button" onClick={() => setStep((s) => Math.max(s - 1, 1))}
                        disabled={step === 1}
                        className="px-3 py-1 text-[11px] text-gray-400 hover:text-white rounded hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        &larr; Back
                    </button>
                    {step < STEPS.length ? (
                        <button type="button" onClick={() => setStep((s) => Math.min(s + 1, STEPS.length))}
                            className="px-3 py-1 text-[11px] text-white bg-[#2962FF] hover:bg-[#2962FF]/90 rounded transition-colors font-medium">
                            Next &rarr;
                        </button>
                    ) : (
                        <span className="px-3 py-1 text-[11px] text-emerald-400 font-medium">Done ✓</span>
                    )}
                </div>
            </div>

            {/* Main: step content (left) + live code preview (right) */}
            <div className="flex-1 flex min-h-0">
                {/* Left — Step content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {step === 1 && <StepInfo model={model} update={update} />}
                    {step === 2 && <StepParameters model={model} update={update} />}
                    {step === 3 && <StepIndicators model={model} update={update} />}
                    {step === 4 && <StepLogic model={model} update={update} />}
                    {step === 5 && <StepPlotting model={model} update={update} />}
                    {step === 6 && <StepAlerts model={model} update={update} />}
                </div>

                {/* Right — Live code preview */}
                <div className={`border-l border-white/[0.06] bg-[#0b0b0f] flex flex-col transition-all ${codeCollapsed ? 'w-10' : 'w-[400px]'}`}>
                    {/* Header */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
                        {!codeCollapsed && (
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Live Preview</span>
                        )}
                        <button type="button" onClick={() => setCodeCollapsed((c) => !c)}
                            title={codeCollapsed ? 'Show preview' : 'Hide preview'}
                            className="text-gray-500 hover:text-white transition-colors ml-auto">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                {codeCollapsed
                                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                }
                            </svg>
                        </button>
                    </div>

                    {/* Tabs */}
                    {!codeCollapsed && (
                        <div className="flex border-b border-white/[0.06] flex-shrink-0">
                            <button type="button" onClick={() => setPreviewTab('code')}
                                className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                                    previewTab === 'code' ? 'text-white border-b-2 border-[#2962FF]' : 'text-gray-500 hover:text-gray-300'
                                }`}>Code</button>
                            <button type="button" onClick={() => setPreviewTab('inputs')}
                                className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                                    previewTab === 'inputs' ? 'text-white border-b-2 border-[#2962FF]' : 'text-gray-500 hover:text-gray-300'
                                }`}>Inputs</button>
                            <button type="button" onClick={() => setPreviewTab('style')}
                                className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                                    previewTab === 'style' ? 'text-white border-b-2 border-[#2962FF]' : 'text-gray-500 hover:text-gray-300'
                                }`}>Style</button>
                        </div>
                    )}

                    {/* Body */}
                    {!codeCollapsed && (
                        <div className="flex-1 overflow-y-auto">
                            {/* CODE TAB */}
                            {previewTab === 'code' && (
                                <div className="p-3">
                                    <div className="flex items-center justify-end mb-2">
                                        <button type="button"
                                            onClick={() => { navigator.clipboard.writeText(generatedCode); }}
                                            title="Copy code to clipboard"
                                            className="text-[10px] text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded">
                                            Copy
                                        </button>
                                    </div>
                                    <pre className="text-[11px] font-mono text-gray-300 leading-relaxed whitespace-pre-wrap break-all">
                                        {generatedCode}
                                    </pre>
                                </div>
                            )}

                            {/* INPUTS TAB — mimics IndicatorSettingsPanel Inputs tab */}
                            {previewTab === 'inputs' && (
                                <div className="p-4 space-y-3">
                                    <p className="text-[9px] text-gray-600 italic mb-2">This is how the settings panel will look to end-users.</p>
                                    {model.parameters.length === 0 ? (
                                        <p className="text-[11px] text-gray-500 italic text-center py-6">
                                            No inputs yet — add some in Step 2.
                                        </p>
                                    ) : (
                                        model.parameters.map((p) => (
                                            <div key={p.id} className="flex items-center justify-between gap-3">
                                                <label className="text-[11px] text-gray-300 truncate" title={p.tooltip}>
                                                    {p.title || p.varName}
                                                    {p.tooltip && <span className="ml-1 text-gray-600 text-[9px]">ⓘ</span>}
                                                </label>
                                                <div className="flex-shrink-0">
                                                    {p.type === 'int' || p.type === 'float' ? (
                                                        p.options && p.options.length > 0 ? (
                                                            <select defaultValue={String(p.defaultValue)} title={p.title}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-gray-200 w-24 focus:border-[#2962FF] outline-none appearance-none">
                                                                {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                                            </select>
                                                        ) : (
                                                            <input type="number" defaultValue={p.defaultValue} title={p.title}
                                                                min={p.min} max={p.max}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-gray-200 w-24 text-center focus:border-[#2962FF] outline-none" />
                                                        )
                                                    ) : p.type === 'string' ? (
                                                        p.options && p.options.length > 0 ? (
                                                            <select defaultValue={String(p.defaultValue)} title={p.title}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-gray-200 min-w-[100px] focus:border-[#2962FF] outline-none appearance-none">
                                                                {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                                            </select>
                                                        ) : (
                                                            <input type="text" defaultValue={String(p.defaultValue || '')} title={p.title}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-gray-200 w-32 focus:border-[#2962FF] outline-none" />
                                                        )
                                                    ) : p.type === 'bool' ? (
                                                        <button type="button" title={p.title}
                                                            className={`w-8 h-4 rounded-full relative transition-colors ${p.defaultValue ? 'bg-[#2962FF]' : 'bg-gray-700'}`}>
                                                            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${p.defaultValue ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* STYLE TAB — mimics IndicatorSettingsPanel Style tab */}
                            {previewTab === 'style' && (
                                <div className="p-4 space-y-3">
                                    <p className="text-[9px] text-gray-600 italic mb-2">Colors and line styles users will see for each plot.</p>
                                    {model.plots.length === 0 ? (
                                        <p className="text-[11px] text-gray-500 italic text-center py-6">
                                            No plots yet — add some in Step 5.
                                        </p>
                                    ) : (
                                        model.plots.map((pl) => {
                                            const formula = model.formulas.find((f) => f.id === pl.formulaId);
                                            return (
                                                <div key={pl.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/[0.04]">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <button type="button" title="Visibility"
                                                            className="w-4 h-4 rounded border border-[#2962FF] bg-[#2962FF] flex items-center justify-center flex-shrink-0">
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </button>
                                                        <span className="text-[11px] text-gray-300 truncate" title={pl.title}>
                                                            {pl.title || formula?.name || 'Plot'}
                                                        </span>
                                                        <span className="text-[9px] text-gray-600 bg-white/5 px-1.5 py-0.5 rounded flex-shrink-0">{pl.kind}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <input type="color" defaultValue={pl.color} title="Plot color"
                                                            className="w-5 h-5 rounded cursor-pointer border border-white/10" />
                                                        <select defaultValue={String(pl.width || 1)} title="Line width"
                                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1 py-0.5 text-[10px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                                            {[1, 2, 3, 4].map((w) => <option key={w} value={w}>{w}px</option>)}
                                                        </select>
                                                        <select defaultValue={pl.lineStyle} title="Line style"
                                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1 py-0.5 text-[10px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                                            <option value="solid">solid</option>
                                                            <option value="dashed">dashed</option>
                                                            <option value="dotted">dotted</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Stats footer */}
                    {!codeCollapsed && (
                        <div className="flex items-center gap-3 px-3 py-2 border-t border-white/[0.06] text-[9px] text-gray-500 flex-shrink-0">
                            <span>{generatedCode.split('\n').length} lines</span>
                            <span>{model.indicators.length} indicators</span>
                            <span>{model.formulas.length} formulas</span>
                            <span>{model.plots.length} plots</span>
                            <span>{model.alerts.length} alerts</span>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default IndicatorVisualBuilder;
