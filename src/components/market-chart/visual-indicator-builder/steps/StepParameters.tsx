import React from 'react';
import { IndicatorModel, ParameterDef, ParamType, PARAM_TYPE_LABELS, PARAM_TYPE_DESCRIPTIONS } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

/* ── Per-choice editor: list of individual inputs with add/remove ── */
interface ChoiceListProps {
    values: string[];
    onChange: (next: string[]) => void;
    kind: 'text' | 'number';
    placeholder?: string;
}

const ChoiceList: React.FC<ChoiceListProps> = ({ values, onChange, kind, placeholder }) => {
    const addChoice = () => onChange([...values, kind === 'number' ? '0' : '']);
    const updateChoice = (i: number, v: string) => onChange(values.map((x, idx) => (idx === i ? v : x)));
    const removeChoice = (i: number) => onChange(values.filter((_, idx) => idx !== i));
    const moveChoice = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= values.length) return;
        const next = [...values];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };

    return (
        <div className="flex flex-col gap-1">
            {values.length === 0 && (
                <span className="text-[10px] text-gray-600 italic">No choices yet. Click "+ Add Choice" below to let users pick from options.</span>
            )}
            {values.map((v, i) => (
                <div key={i} className="flex items-center gap-1.5">
                    <span className="text-[9px] text-gray-600 w-5 text-center">{i + 1}.</span>
                    <input
                        type={kind === 'number' ? 'number' : 'text'}
                        value={v}
                        placeholder={placeholder}
                        title={`Choice ${i + 1}`}
                        onChange={(e) => updateChoice(i, e.target.value)}
                        className="flex-1 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white focus:border-[#2962FF] outline-none"
                    />
                    <button type="button" title="Move up" disabled={i === 0}
                        onClick={() => moveChoice(i, -1)}
                        className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                    <button type="button" title="Move down" disabled={i === values.length - 1}
                        onClick={() => moveChoice(i, 1)}
                        className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <button type="button" title="Remove choice"
                        onClick={() => removeChoice(i)}
                        className="text-gray-600 hover:text-red-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
            <button type="button" onClick={addChoice}
                className="mt-0.5 py-1 border border-dashed border-white/[0.1] rounded text-[10px] text-gray-500 hover:bg-white/[0.03] hover:text-gray-300 transition-colors self-start px-2.5">
                + Add Choice
            </button>
        </div>
    );
};

const makeParam = (): ParameterDef => ({
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    varName: 'myParam',
    title: 'My Parameter',
    type: 'int',
    defaultValue: 14,
    min: 1,
    max: 500,
});

const StepParameters: React.FC<Props> = ({ model, update }) => {
    const params = model.parameters;
    const setParams = (next: ParameterDef[]) => update({ parameters: next });

    const add = () => setParams([...params, makeParam()]);
    const remove = (id: string) => setParams(params.filter((p) => p.id !== id));
    const patch = (id: string, p: Partial<ParameterDef>) =>
        setParams(params.map((x) => (x.id === id ? { ...x, ...p } : x)));

    // Count where each input is referenced across the model
    const usageFor = (varName: string) => {
        let inIndicators = 0, inFormulas = 0, inAlerts = 0;
        const needle = `$param:${varName}`;
        const tokenMatch = `param:${varName}`;
        for (const ind of model.indicators) {
            for (const v of Object.values(ind.paramValues || {})) {
                if (v === needle) inIndicators++;
            }
        }
        for (const f of model.formulas) {
            for (const t of f.tokens) if (t.value === tokenMatch) inFormulas++;
        }
        for (const a of model.alerts) {
            for (const t of a.condition) if (t.value === tokenMatch) inAlerts++;
        }
        return { inIndicators, inFormulas, inAlerts, total: inIndicators + inFormulas + inAlerts };
    };

    return (
        <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-white mb-1">User Inputs</h2>
            <p className="text-xs text-gray-500 mb-2">
                Create inputs that end-users can adjust when they use your indicator. Each input becomes a <code className="text-purple-400">param.*</code> line in the code.
            </p>

            {/* Where these inputs can be used */}
            <div className="bg-[#12121a] border border-white/[0.06] rounded-lg p-3 mb-4 text-[11px] text-gray-400">
                <div className="font-semibold text-gray-300 mb-1.5">Where User Inputs can be used:</div>
                <ul className="space-y-1 pl-3 list-disc marker:text-gray-600">
                    <li><span className="text-[#60a5fa]">Step 3 (Indicators)</span> — link an indicator's length/period/source to an input via the "Fixed / Link" dropdown</li>
                    <li><span className="text-[#60a5fa]">Step 4 (Logic & Math)</span> — inputs appear under <span className="text-amber-300">"User Inputs"</span> group in the operand dropdown</li>
                    <li><span className="text-[#60a5fa]">Step 6 (Alerts)</span> — inputs usable in alert conditions the same way</li>
                </ul>
                <div className="text-[10px] text-gray-600 mt-2 italic">Example: create a "Length" input with choices 20/35/50/100 → link it to SMA's length in Step 3 → end-user sees a dropdown to pick the length.</div>
            </div>

            <div className="space-y-2">
                {params.map((p) => (
                    <div key={p.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 space-y-2">
                        {/* Usage badge — shows where this input is referenced */}
                        {(() => {
                            const u = usageFor(p.varName);
                            if (u.total === 0) {
                                return <div className="text-[9px] text-gray-600 italic">Not used yet — link it from Step 3, 4, or 6</div>;
                            }
                            return (
                                <div className="flex flex-wrap gap-1.5 text-[9px]">
                                    <span className="text-gray-500">Used in:</span>
                                    {u.inIndicators > 0 && <span className="text-[#60a5fa] bg-[#60a5fa]/10 px-1.5 py-0.5 rounded">{u.inIndicators} indicator param{u.inIndicators > 1 ? 's' : ''}</span>}
                                    {u.inFormulas > 0 && <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{u.inFormulas} formula{u.inFormulas > 1 ? 's' : ''}</span>}
                                    {u.inAlerts > 0 && <span className="text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">{u.inAlerts} alert{u.inAlerts > 1 ? 's' : ''}</span>}
                                </div>
                            );
                        })()}

                        {/* Inline single-row editor — reads like a code statement */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <input value={p.varName} placeholder="name" title="Variable name (used in code)"
                                onChange={(e) => patch(p.id, { varName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                                className="bg-[#1e222d] border border-[#2962FF]/30 rounded px-2 py-1 text-white w-24 font-mono focus:border-[#2962FF] outline-none" />
                            <span className="text-gray-500">=</span>
                            <select value={p.type} title={PARAM_TYPE_DESCRIPTIONS[p.type]}
                                onChange={(e) => {
                                    const newType = e.target.value as ParamType;
                                    const defaults: Record<ParamType, any> = { int: 14, float: 0.5, bool: true, string: '' };
                                    patch(p.id, { type: newType, defaultValue: defaults[newType], options: newType === 'string' ? ['Option 1', 'Option 2'] : undefined, min: undefined, max: undefined });
                                }}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-purple-300 focus:border-[#2962FF] outline-none appearance-none">
                                {Object.entries(PARAM_TYPE_LABELS).map(([val, label]) => (
                                    <option key={val} value={val}>{label}</option>
                                ))}
                            </select>
                            <span className="text-gray-600">(</span>
                            {(p.type === 'int' || p.type === 'float') && (
                                p.options && p.options.length > 0 ? (
                                    <select value={String(p.defaultValue)} title="Default choice"
                                        onChange={(e) => patch(p.id, { defaultValue: p.type === 'int' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0 })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                        {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                ) : (
                                    <input type="number" title="Default value" value={p.defaultValue ?? 0}
                                        onChange={(e) => patch(p.id, { defaultValue: p.type === 'int' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0 })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-gray-200 w-16 text-center focus:border-[#2962FF] outline-none" />
                                )
                            )}
                            {p.type === 'string' && (
                                p.options && p.options.length > 0 ? (
                                    <select value={String(p.defaultValue || '')} title="Default choice"
                                        onChange={(e) => patch(p.id, { defaultValue: e.target.value })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                        {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                ) : (
                                    <input value={String(p.defaultValue || '')} title="Default value" placeholder="default"
                                        onChange={(e) => patch(p.id, { defaultValue: e.target.value })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-gray-200 w-24 focus:border-[#2962FF] outline-none" />
                                )
                            )}
                            {p.type === 'bool' && (
                                <button type="button" title="Toggle default" onClick={() => patch(p.id, { defaultValue: !p.defaultValue })}
                                    className={`px-2 py-1 rounded text-[10px] font-medium ${p.defaultValue ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                    {p.defaultValue ? 'Yes' : 'No'}
                                </button>
                            )}
                            <span className="text-purple-400">, title=</span>
                            <input value={p.title} placeholder="shown to user" title="Display name"
                                onChange={(e) => patch(p.id, { title: e.target.value })}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-gray-200 flex-1 min-w-[120px] focus:border-[#2962FF] outline-none" />

                            {/* Min/Max only shown when NO choices are set — they're mutually exclusive */}
                            {(p.type === 'int' || p.type === 'float') && !p.options && (p.min !== undefined ? (
                                <>
                                    <span className="text-purple-400">, min=</span>
                                    <input type="number" title="Minimum" value={p.min}
                                        onChange={(e) => patch(p.id, { min: e.target.value ? parseFloat(e.target.value) : undefined })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-gray-200 w-14 text-center focus:border-[#2962FF] outline-none" />
                                    <button type="button" onClick={() => patch(p.id, { min: undefined })} title="Remove min" className="text-gray-600 hover:text-red-400">×</button>
                                </>
                            ) : (
                                <button type="button" onClick={() => patch(p.id, { min: 0 })} className="text-[10px] text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded">+ min</button>
                            ))}

                            {(p.type === 'int' || p.type === 'float') && !p.options && (p.max !== undefined ? (
                                <>
                                    <span className="text-purple-400">, max=</span>
                                    <input type="number" title="Maximum" value={p.max}
                                        onChange={(e) => patch(p.id, { max: e.target.value ? parseFloat(e.target.value) : undefined })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-gray-200 w-14 text-center focus:border-[#2962FF] outline-none" />
                                    <button type="button" onClick={() => patch(p.id, { max: undefined })} title="Remove max" className="text-gray-600 hover:text-red-400">×</button>
                                </>
                            ) : (
                                <button type="button" onClick={() => patch(p.id, { max: 100 })} className="text-[10px] text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded">+ max</button>
                            ))}

                            {(p.type === 'int' || p.type === 'float' || p.type === 'string') && (p.options ? (
                                <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">choices ({p.options.length})</span>
                            ) : (
                                <button type="button" onClick={() => patch(p.id, { options: p.type === 'string' ? ['Option 1', 'Option 2'] : ['10', '20'] })}
                                    className="text-[10px] text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded">+ choices</button>
                            ))}

                            {p.tooltip !== undefined ? (
                                <span className="text-[10px] text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded">tooltip</span>
                            ) : (
                                <button type="button" onClick={() => patch(p.id, { tooltip: '' })}
                                    className="text-[10px] text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded">+ tooltip</button>
                            )}

                            <span className="text-gray-600">)</span>

                            <button type="button" onClick={() => remove(p.id)} title="Remove this input"
                                className="text-gray-600 hover:text-red-400 flex-shrink-0 ml-auto">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Type description hint */}
                        <p className="text-[10px] text-gray-500 italic pl-1">
                            💡 {PARAM_TYPE_DESCRIPTIONS[p.type]}
                        </p>

                        {/* Choices expansion — inline like Step 4's chain */}
                        {p.options && (p.type === 'string' || p.type === 'int' || p.type === 'float') && (
                            <div className="pl-4 pt-1 border-l-2 border-amber-500/20 ml-2">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[9px] text-gray-500 uppercase tracking-wide">Choices</span>
                                    <button type="button" onClick={() => patch(p.id, { options: undefined })}
                                        className="text-[9px] text-gray-600 hover:text-red-400">remove all</button>
                                </div>
                                <ChoiceList
                                    values={p.options}
                                    onChange={(next) => {
                                        // Auto-snap default to first choice if current default isn't in the list
                                        const patchObj: Partial<ParameterDef> = { options: next.length > 0 ? next : undefined };
                                        if (next.length > 0) {
                                            const currentStr = String(p.defaultValue);
                                            if (!next.includes(currentStr)) {
                                                patchObj.defaultValue = p.type === 'int' ? parseInt(next[0]) || 0
                                                    : p.type === 'float' ? parseFloat(next[0]) || 0
                                                    : next[0];
                                            }
                                            // Clear min/max since they conflict with choices
                                            patchObj.min = undefined;
                                            patchObj.max = undefined;
                                        }
                                        patch(p.id, patchObj);
                                    }}
                                    kind={p.type === 'string' ? 'text' : 'number'}
                                    placeholder={p.type === 'string' ? 'e.g. Auto' : 'e.g. 20'}
                                />
                            </div>
                        )}

                        {/* Tooltip expansion */}
                        {p.tooltip !== undefined && (
                            <div className="pl-4 pt-1 border-l-2 border-cyan-500/20 ml-2">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[9px] text-gray-500 uppercase tracking-wide">Help Tooltip (press Enter for new line)</span>
                                    <button type="button" onClick={() => patch(p.id, { tooltip: undefined })}
                                        className="text-[9px] text-gray-600 hover:text-red-400">remove</button>
                                </div>
                                <textarea value={p.tooltip} placeholder="Brief help shown when user hovers over this input"
                                    onChange={(e) => patch(p.id, { tooltip: e.target.value })}
                                    rows={2}
                                    className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none resize-y w-full" />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <button type="button" onClick={add}
                className="w-full mt-3 py-2 border border-dashed border-[#2962FF]/30 rounded-lg text-xs text-[#2962FF] hover:bg-[#2962FF]/5 transition-colors">
                + Add User Input
            </button>

            {params.length === 0 && (
                <p className="text-xs text-gray-600 text-center mt-4 italic">
                    No user inputs yet. Add inputs like sensitivity, period choice, or open type so users can customize your indicator.
                </p>
            )}
        </div>
    );
};

export default StepParameters;
