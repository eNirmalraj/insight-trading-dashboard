import React, { useCallback } from 'react';
import type { IndicatorModel, Formula, FormulaToken } from '../types';
import ExpressionComposer from '../ExpressionComposer';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

/** Sanitize name to valid identifier */
const sanitizeName = (name: string): string =>
    name.replace(/[^a-zA-Z0-9_]/g, '').replace(/^[0-9]+/, '');

const StepLogic: React.FC<Props> = ({ model, update }) => {
    const { formulas, indicators } = model;

    const setFormulas = useCallback((fn: (prev: Formula[]) => Formula[]) => {
        update({ formulas: fn(model.formulas) });
    }, [model.formulas, update]);

    const addFormula = () => {
        const id = String(Date.now());
        const baseName = `f${formulas.length + 1}`;
        const newFormula: Formula = {
            id,
            name: baseName,
            tokens: [{ kind: 'operand', value: 'price:close' }],
        };
        setFormulas((prev) => [...prev, newFormula]);
    };

    const updateFormulaName = (id: string, name: string) => {
        const sanitized = sanitizeName(name);
        if (!sanitized) return;
        setFormulas((prev) => prev.map((f) => (f.id === id ? { ...f, name: sanitized } : f)));
    };

    const updateFormulaTokens = (id: string, tokens: FormulaToken[]) => {
        setFormulas((prev) => prev.map((f) => (f.id === id ? { ...f, tokens } : f)));
    };

    const removeFormula = (id: string) => {
        setFormulas((prev) => prev.filter((f) => f.id !== id));
    };

    return (
        <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-white mb-1">Logic & Math</h2>
            <p className="text-xs text-gray-500 mb-4">
                Create named variables from your indicators and price data. Each formula becomes a value you can plot or use in alerts.
            </p>

            {indicators.length === 0 && formulas.length === 0 && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 text-center mb-4">
                    <p className="text-xs text-yellow-400">Tip: Add indicators in Step 2 first to reference them in formulas.</p>
                </div>
            )}

            <div className="space-y-3 mb-4">
                {formulas.map((f, idx) => {
                    // Prior formulas = only formulas before this one
                    const priorFormulas = formulas.slice(0, idx);
                    return (
                        <div key={f.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <input
                                    type="text"
                                    value={f.name}
                                    title="Formula name (identifier)"
                                    onChange={(e) => updateFormulaName(f.id, e.target.value)}
                                    className="w-24 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-emerald-400 font-mono focus:border-[#2962FF] outline-none"
                                />
                                <span className="text-xs text-gray-500">=</span>
                                <div className="flex-1">
                                    <ExpressionComposer
                                        tokens={f.tokens}
                                        onChange={(tokens) => updateFormulaTokens(f.id, tokens)}
                                        indicators={indicators}
                                        priorFormulas={priorFormulas}
                                        parameters={model.parameters}
                                    />
                                </div>
                                <button type="button" onClick={() => removeFormula(f.id)} title="Remove formula"
                                    className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <button type="button" onClick={addFormula}
                className="w-full py-2.5 border border-dashed border-emerald-500/30 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/5 transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                + Add Formula
            </button>
        </div>
    );
};

export default StepLogic;
