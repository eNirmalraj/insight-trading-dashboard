import React from 'react';
import { IndicatorModel, ParameterDef, ParamType, PARAM_TYPE_LABELS } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

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

                        {/* Row 1: varName, title, type */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] text-gray-500">Variable Name</span>
                                <input value={p.varName} placeholder="varName"
                                    onChange={(e) => patch(p.id, { varName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                                    className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-28 font-mono focus:border-[#2962FF] outline-none" />
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                                <span className="text-[9px] text-gray-500">Display Name</span>
                                <input value={p.title} placeholder="Title"
                                    onChange={(e) => patch(p.id, { title: e.target.value })}
                                    className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white focus:border-[#2962FF] outline-none" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] text-gray-500">Type</span>
                                <select value={p.type} title="Parameter type"
                                    onChange={(e) => {
                                        const newType = e.target.value as ParamType;
                                        const defaults: Record<ParamType, any> = { int: 14, float: 0.5, bool: true, string: '' };
                                        patch(p.id, { type: newType, defaultValue: defaults[newType], options: newType === 'string' ? ['Option 1', 'Option 2'] : undefined, min: undefined, max: undefined });
                                    }}
                                    className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white focus:border-[#2962FF] outline-none appearance-none">
                                    {Object.entries(PARAM_TYPE_LABELS).map(([val, label]) => (
                                        <option key={val} value={val}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="button" onClick={() => remove(p.id)} title="Remove"
                                className="text-gray-600 hover:text-red-400 transition-colors self-end pb-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Row 2: default, min, max, options — depends on type */}
                        <div className="flex flex-wrap items-center gap-2 pl-1">
                            {/* Default value */}
                            {(p.type === 'int' || p.type === 'float') && (
                                <>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] text-gray-500">Default</span>
                                        <input type="number" title="Default value" value={p.defaultValue ?? 0}
                                            onChange={(e) => patch(p.id, { defaultValue: p.type === 'int' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0 })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-20 focus:border-[#2962FF] outline-none" />
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] text-gray-500">Min</span>
                                        <input type="number" value={p.min ?? ''} placeholder="—"
                                            onChange={(e) => patch(p.id, { min: e.target.value ? parseFloat(e.target.value) : undefined })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-16 focus:border-[#2962FF] outline-none" />
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] text-gray-500">Max</span>
                                        <input type="number" value={p.max ?? ''} placeholder="—"
                                            onChange={(e) => patch(p.id, { max: e.target.value ? parseFloat(e.target.value) : undefined })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-16 focus:border-[#2962FF] outline-none" />
                                    </div>
                                </>
                            )}

                            {/* Number with choice options */}
                            {(p.type === 'int' || p.type === 'float') && (
                                <div className="flex flex-col gap-0.5 flex-1 min-w-[150px]">
                                    <span className="text-[9px] text-gray-500">Choice Options (comma-separated, leave empty for free input)</span>
                                    <input value={(p.options || []).join(', ')} placeholder="e.g. 10, 20, 50"
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            const opts = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
                                            patch(p.id, { options: opts && opts.length > 0 ? opts : undefined });
                                        }}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white focus:border-[#2962FF] outline-none" />
                                </div>
                            )}

                            {/* Bool default */}
                            {p.type === 'bool' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-500">Default:</span>
                                    <button type="button" onClick={() => patch(p.id, { defaultValue: !p.defaultValue })}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${p.defaultValue ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                        {p.defaultValue ? 'Yes (On)' : 'No (Off)'}
                                    </button>
                                </div>
                            )}

                            {/* String with choices */}
                            {p.type === 'string' && (
                                <>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] text-gray-500">Default</span>
                                        <input value={String(p.defaultValue || '')} placeholder="Default value"
                                            onChange={(e) => patch(p.id, { defaultValue: e.target.value })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-28 focus:border-[#2962FF] outline-none" />
                                    </div>
                                    <div className="flex flex-col gap-0.5 flex-1 min-w-[200px]">
                                        <span className="text-[9px] text-gray-500">Choices (comma-separated)</span>
                                        <input value={(p.options || []).join(', ')} placeholder='e.g. Auto, Gap, Flat'
                                            onChange={(e) => {
                                                const opts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                                                patch(p.id, { options: opts.length > 0 ? opts : undefined });
                                            }}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white focus:border-[#2962FF] outline-none" />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Tooltip (help text) */}
                        <div className="flex flex-col gap-0.5 pl-1">
                            <span className="text-[9px] text-gray-500">Help Tooltip (optional — shown when user hovers. Use \n for new lines.)</span>
                            <textarea value={p.tooltip || ''} placeholder={'e.g. "Auto rules: 5m→D/LTM; 15m→D/ETM;\\n1H→Weekly; 4H→Monthly..."'}
                                onChange={(e) => patch(p.id, { tooltip: e.target.value })}
                                rows={2}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none resize-y w-full" />
                        </div>

                        {/* Preview of generated code */}
                        <div className="text-[10px] text-gray-600 font-mono pl-1 whitespace-pre-wrap break-all">
                            → {p.varName} = param.{p.type}({String(p.type === 'string' ? `"${p.defaultValue}"` : p.defaultValue)}
                            {p.title && `, title="${p.title}"`}
                            {p.min !== undefined && `, minval=${p.min}`}
                            {p.max !== undefined && `, maxval=${p.max}`}
                            {p.options && p.options.length > 0 && `, options=[${p.options.map((o) => p.type === 'string' ? `"${o}"` : o).join(',')}]`}
                            {p.tooltip && `, tooltip="${p.tooltip.replace(/\n/g, '\\n')}"`})
                        </div>
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
