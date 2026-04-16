import React from 'react';
import type { IndicatorModel } from '../types';
import { generateKuri } from '../codegen';

interface Props { model: IndicatorModel; }

const StepReview: React.FC<Props> = ({ model }) => {
    const source = generateKuri(model);
    return (
        <div className="max-w-4xl">
            <h2 className="text-sm font-semibold text-white mb-1">Review</h2>
            <p className="text-xs text-gray-500 mb-4">This is the Kuri source your builder will emit. Toggle to Code mode to edit freely.</p>

            <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-[#60a5fa]">{model.indicators.length}</div>
                    <div className="text-[9px] text-gray-500 uppercase">Indicators</div>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-emerald-400">{model.formulas.length}</div>
                    <div className="text-[9px] text-gray-500 uppercase">Formulas</div>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-purple-400">{model.plots.length}</div>
                    <div className="text-[9px] text-gray-500 uppercase">Plots</div>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-orange-400">{model.alerts.length}</div>
                    <div className="text-[9px] text-gray-500 uppercase">Alerts</div>
                </div>
            </div>

            <pre className="bg-[#0b0b0f] border border-white/[0.06] rounded-lg p-4 text-[11px] text-gray-200 font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap">
                {source}
            </pre>
        </div>
    );
};

export default StepReview;
