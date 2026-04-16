import React, { useState, useEffect } from 'react';
import { IndicatorModel, createEmptyModel } from './types';
import StepInfo from './steps/StepInfo';
import StepIndicators from './steps/StepIndicators';
import StepLogic from './steps/StepLogic';
import StepPlotting from './steps/StepPlotting';
import StepAlerts from './steps/StepAlerts';
import StepReview from './steps/StepReview';
import { generateKuri } from './codegen';

interface Props {
    initialSource?: string;
    onSourceChange: (source: string) => void;
}

const STEPS = [
    { num: 1, label: 'Info' },
    { num: 2, label: 'Indicators' },
    { num: 3, label: 'Logic & Math' },
    { num: 4, label: 'Plotting' },
    { num: 5, label: 'Alerts' },
    { num: 6, label: 'Review' },
];

const IndicatorVisualBuilder: React.FC<Props> = ({ onSourceChange }) => {
    const [step, setStep] = useState(1);
    const [model, setModel] = useState<IndicatorModel>(createEmptyModel());

    const update = (patch: Partial<IndicatorModel>) => setModel((prev) => ({ ...prev, ...patch }));

    useEffect(() => {
        onSourceChange(generateKuri(model));
    }, [model, onSourceChange]);

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

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {step === 1 && <StepInfo model={model} update={update} />}
                {step === 2 && <StepIndicators model={model} update={update} />}
                {step === 3 && <StepLogic model={model} update={update} />}
                {step === 4 && <StepPlotting model={model} update={update} />}
                {step === 5 && <StepAlerts model={model} update={update} />}
                {step === 6 && <StepReview model={model} />}
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
