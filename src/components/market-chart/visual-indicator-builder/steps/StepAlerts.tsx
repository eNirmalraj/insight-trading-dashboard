import React, { useCallback } from 'react';
import type { IndicatorModel, AlertRow, FormulaToken } from '../types';
import ExpressionComposer from '../ExpressionComposer';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const StepAlerts: React.FC<Props> = ({ model, update }) => {
    const { alerts, indicators, formulas } = model;

    const setAlerts = useCallback((fn: (prev: AlertRow[]) => AlertRow[]) => {
        update({ alerts: fn(model.alerts) });
    }, [model.alerts, update]);

    const addAlert = () => {
        const newAlert: AlertRow = {
            id: String(Date.now()),
            title: `Alert ${alerts.length + 1}`,
            message: 'Alert triggered on {symbol} at {price}',
            condition: [{ kind: 'operand', value: 'price:close' }],
        };
        setAlerts((prev) => [...prev, newAlert]);
    };

    const updateAlert = (id: string, patch: Partial<AlertRow>) => {
        setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    };

    const removeAlert = (id: string) => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
    };

    const updateCondition = (id: string, tokens: FormulaToken[]) => {
        updateAlert(id, { condition: tokens });
    };

    return (
        <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-white mb-1">Alerts</h2>
            <p className="text-xs text-gray-500 mb-4">
                Define alert conditions using your indicators and formulas. Supports {'{symbol}'} and {'{price}'} placeholders in messages.
            </p>

            <div className="space-y-3 mb-4">
                {alerts.map((a) => (
                    <div key={a.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={a.title}
                                title="Alert title"
                                onChange={(e) => updateAlert(a.id, { title: e.target.value })}
                                placeholder="Alert title"
                                className="flex-1 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#2962FF] outline-none"
                            />
                            <button type="button" onClick={() => removeAlert(a.id)} title="Remove alert"
                                className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">When:</span>
                            <ExpressionComposer
                                tokens={a.condition}
                                onChange={(tokens) => updateCondition(a.id, tokens)}
                                indicators={indicators}
                                priorFormulas={formulas}
                                parameters={model.parameters}
                            />
                        </div>

                        <div>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Message:</span>
                            <input
                                type="text"
                                value={a.message}
                                title="Alert message"
                                onChange={(e) => updateAlert(a.id, { message: e.target.value })}
                                placeholder="Alert message (use {symbol}, {price} placeholders)"
                                className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#2962FF] outline-none"
                            />
                            <div className="text-[9px] text-gray-600 mt-1">
                                Placeholders: {'{symbol}'}, {'{price}'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {alerts.length === 0 && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-6 text-center mb-4">
                    <p className="text-sm text-gray-500">No alerts defined yet.</p>
                    <p className="text-xs text-gray-600 mt-1">Add an alert to get notified when conditions are met.</p>
                </div>
            )}

            <button type="button" onClick={addAlert}
                className="w-full py-2.5 border border-dashed border-orange-500/30 rounded-lg text-xs text-orange-400 hover:bg-orange-500/5 transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                + Add Alert
            </button>
        </div>
    );
};

export default StepAlerts;
