// src/components/strategy-studio/ParamEditorModal.tsx
// Renders a form from a strategy's ParamDef[] schema.
// Used when assigning a strategy to a watchlist, and for editing params
// anytime afterward.

import React, { useState } from 'react';
import type { ParamDef } from '../../strategies';

interface ParamEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    strategyName: string;
    paramSchema: ParamDef[];
    initialValues: Record<string, any>;
    onSave: (values: Record<string, any>) => void;
}

export const ParamEditorModal: React.FC<ParamEditorModalProps> = ({
    isOpen,
    onClose,
    strategyName,
    paramSchema,
    initialValues,
    onSave,
}) => {
    const [values, setValues] = useState<Record<string, any>>(() => {
        const seeded: Record<string, any> = {};
        for (const p of paramSchema) {
            seeded[p.id] = initialValues[p.id] ?? p.default;
        }
        return seeded;
    });

    if (!isOpen) return null;

    const setValue = (id: string, v: any) =>
        setValues((prev) => ({ ...prev, [id]: v }));

    const handleSave = () => {
        onSave(values);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#18181b] border border-white/10 rounded-lg w-[500px] max-h-[80vh] overflow-y-auto p-6 shadow-2xl">
                <h3 className="text-lg font-medium text-white mb-1">Edit Parameters</h3>
                <p className="text-sm text-gray-400 mb-5">{strategyName}</p>

                {paramSchema.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">This strategy has no editable parameters.</p>
                ) : (
                    <div className="space-y-4">
                        {paramSchema.map((p) => (
                            <div key={p.id} className="flex flex-col gap-1">
                                <label
                                    htmlFor={`param-${p.id}`}
                                    className="text-xs text-gray-300 uppercase tracking-wide"
                                >
                                    {p.title || p.id}
                                    {p.min !== undefined || p.max !== undefined ? (
                                        <span className="ml-2 text-gray-500 normal-case tracking-normal">
                                            ({p.min !== undefined ? p.min : '-∞'} →{' '}
                                            {p.max !== undefined ? p.max : '∞'})
                                        </span>
                                    ) : null}
                                </label>
                                {p.type === 'bool' ? (
                                    <input
                                        id={`param-${p.id}`}
                                        type="checkbox"
                                        checked={!!values[p.id]}
                                        onChange={(e) => setValue(p.id, e.target.checked)}
                                        className="h-5 w-5"
                                    />
                                ) : (
                                    <input
                                        id={`param-${p.id}`}
                                        type={p.type === 'int' || p.type === 'float' ? 'number' : 'text'}
                                        value={values[p.id] ?? ''}
                                        min={p.min}
                                        max={p.max}
                                        step={p.type === 'int' ? 1 : p.step || 0.01}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            if (p.type === 'int' || p.type === 'float') {
                                                setValue(p.id, raw === '' ? '' : Number(raw));
                                            } else {
                                                setValue(p.id, raw);
                                            }
                                        }}
                                        className="px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-md bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
