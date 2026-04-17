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

    const update = (patch: Partial<IndicatorModel>) => setModel((prev) => ({ ...prev, ...patch }));

    const generatedCode = useMemo(() => generateKuri(model), [model]);

    useEffect(() => {
        onSourceChange(generatedCode);
    }, [generatedCode, onSourceChange]);

    return (
        <div className="flex flex-col h-full bg-[#09090b] text-white">
            {/* Steps bar */}
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
                <div className={`border-l border-white/[0.06] bg-[#0b0b0f] flex flex-col transition-all ${codeCollapsed ? 'w-10' : 'w-[380px]'}`}>
                    {/* Header */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
                        {!codeCollapsed && (
                            <>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Live Preview</span>
                            <button type="button"
                                onClick={() => { navigator.clipboard.writeText(generatedCode); }}
                                title="Copy code to clipboard"
                                className="text-[10px] text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded transition-colors">
                                Copy
                            </button>
                            </>
                        )}
                        <button type="button" onClick={() => setCodeCollapsed((c) => !c)}
                            title={codeCollapsed ? 'Show code preview' : 'Hide code preview'}
                            className="text-gray-500 hover:text-white transition-colors ml-auto">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                {codeCollapsed
                                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                }
                            </svg>
                        </button>
                    </div>

                    {/* Code */}
                    {!codeCollapsed && (
                        <div className="flex-1 overflow-y-auto p-3">
                            <pre className="text-[11px] font-mono text-gray-300 leading-relaxed whitespace-pre-wrap break-all">
                                {generatedCode}
                            </pre>
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

            {/* Navigation */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 bg-[#0a0a0f] flex-shrink-0">
                <button type="button" onClick={() => setStep((s) => Math.max(s - 1, 1))}
                    disabled={step === 1}
                    className="px-4 py-1.5 text-xs text-gray-400 hover:text-white rounded-md hover:bg-white/5 transition-colors disabled:opacity-30">
                    &larr; Back
                </button>
                <span className="text-[10px] text-gray-600">Step {step} of 6</span>
                {step < 6 ? (
                    <button type="button" onClick={() => setStep((s) => Math.min(s + 1, 6))}
                        className="px-4 py-1.5 text-xs text-white bg-[#2962FF] hover:bg-[#2962FF]/90 rounded-md transition-colors font-medium">
                        Next &rarr;
                    </button>
                ) : (
                    <div className="w-[60px]" />
                )}
            </div>
        </div>
    );
};

export default IndicatorVisualBuilder;
