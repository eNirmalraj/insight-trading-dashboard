import React, { useMemo } from 'react';
import type { IndicatorInstance, Formula, FormulaToken } from './types';
import { OPERATOR_LIBRARY } from './types';

/* ── Option shape ── */
interface OperandOption {
    value: string;
    label: string;
    group: string;
}

/* ── Build grouped operand options ── */
export function buildOperandOptions(
    indicators: IndicatorInstance[],
    priorFormulas: Formula[],
): OperandOption[] {
    const opts: OperandOption[] = [];

    // Price
    opts.push({ value: 'price:close', label: 'Close', group: 'Price' });
    opts.push({ value: 'price:open', label: 'Open', group: 'Price' });
    opts.push({ value: 'price:high', label: 'High', group: 'Price' });
    opts.push({ value: 'price:low', label: 'Low', group: 'Price' });
    opts.push({ value: 'price:volume', label: 'Volume', group: 'Price' });

    // Custom Previous Bar (user picks field + bars ago)
    opts.push({ value: 'hist:close:1', label: 'Previous Bar...', group: 'Previous Bars' });

    // Custom Higher Timeframe (user picks timeframe + field)
    opts.push({ value: 'htf:D:close', label: 'Higher Timeframe...', group: 'Higher Timeframe' });

    // Built-in Functions (user picks function, configures source + period inline)
    opts.push({ value: 'fn:highest:14', label: 'Highest Value...', group: 'Functions' });
    opts.push({ value: 'fn:lowest:14', label: 'Lowest Value...', group: 'Functions' });
    opts.push({ value: 'fn:stdev:20', label: 'Std Dev...', group: 'Functions' });

    // Crossing detection
    opts.push({ value: 'cross:above', label: 'Crosses Above...', group: 'Crossover Detection' });
    opts.push({ value: 'cross:below', label: 'Crosses Below...', group: 'Crossover Detection' });

    // Math helpers
    opts.push({ value: 'math:abs', label: 'Absolute Value...', group: 'Math' });
    opts.push({ value: 'math:max', label: 'Larger Of Two...', group: 'Math' });
    opts.push({ value: 'math:min', label: 'Smaller Of Two...', group: 'Math' });

    // Condition (if-then-else)
    opts.push({ value: 'cond:ternary', label: 'If...Then...Else...', group: 'Condition' });

    // Missing value handling
    opts.push({ value: 'na:check', label: 'Is Missing? (na check)...', group: 'Missing Values' });
    opts.push({ value: 'na:replace', label: 'Replace Missing With...', group: 'Missing Values' });
    opts.push({ value: 'na:value', label: 'Empty / Missing (na)', group: 'Missing Values' });


    // Per indicator: outputs + levels
    for (const ind of indicators) {
        const multiOut = ind.parsed.outputs.length > 1;
        for (const out of ind.parsed.outputs) {
            opts.push({
                value: `ind:${ind.id}:${out.varName}`,
                label: multiOut ? `${ind.name} -- ${out.title}` : ind.name,
                group: ind.name,
            });
        }
        if (ind.parsed.outputs.length === 0) {
            opts.push({
                value: `ind:${ind.id}:value`,
                label: ind.name,
                group: ind.name,
            });
        }
        for (const lvl of ind.parsed.levels) {
            opts.push({
                value: `level:${ind.id}:${lvl.value}`,
                label: `${ind.name} -- Level ${lvl.value} (${lvl.title})`,
                group: `${ind.name} Levels`,
            });
        }
    }

    // Formulas
    for (const f of priorFormulas) {
        opts.push({ value: `formula:${f.name}`, label: f.name, group: 'Formulas' });
    }

    // Value
    opts.push({ value: 'value:0', label: 'Value...', group: 'Custom' });

    return opts;
}

/* ── Component Props ── */
interface ExpressionComposerProps {
    tokens: FormulaToken[];
    onChange: (tokens: FormulaToken[]) => void;
    indicators: IndicatorInstance[];
    priorFormulas: Formula[];
}

const ExpressionComposer: React.FC<ExpressionComposerProps> = ({
    tokens,
    onChange,
    indicators,
    priorFormulas,
}) => {
    const options = useMemo(
        () => buildOperandOptions(indicators, priorFormulas),
        [indicators, priorFormulas],
    );

    // Ensure at least one operand token
    const safeTokens = tokens.length === 0
        ? [{ kind: 'operand' as const, value: 'price:close' }]
        : tokens;

    const updateToken = (idx: number, patch: Partial<FormulaToken>) => {
        const next = safeTokens.map((t, i) => (i === idx ? { ...t, ...patch } : t));
        onChange(next);
    };

    const addOperatorPair = (op: string) => {
        const newTokens: FormulaToken[] = [
            ...safeTokens,
            { kind: 'operator', value: op },
            { kind: 'operand', value: 'price:close' },
        ];
        onChange(newTokens);
    };

    const removeOperatorAt = (opIdx: number) => {
        // Remove the operator and the following operand
        const next = safeTokens.filter((_, i) => i !== opIdx && i !== opIdx + 1);
        onChange(next.length > 0 ? next : [{ kind: 'operand', value: 'price:close' }]);
    };

    // Group options for rendering
    const renderOptionGroups = () => {
        const groups: Record<string, OperandOption[]> = {};
        for (const o of options) {
            if (!groups[o.group]) groups[o.group] = [];
            groups[o.group].push(o);
        }
        return Object.entries(groups).map(([group, items]) => (
            <optgroup key={group} label={group}>
                {items.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                ))}
            </optgroup>
        ));
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {safeTokens.map((token, idx) => {
                if (token.kind === 'operand') {
                    const isValue = token.value.startsWith('value:');
                    const isHist = token.value.startsWith('hist:');
                    const isHtf = token.value.startsWith('htf:');
                    const isFnWithPeriod = token.value.startsWith('fn:') && token.value !== 'fn:tr';
                    const isCross = token.value.startsWith('cross:');
                    const isMath = token.value.startsWith('math:');
                    const isCond = token.value.startsWith('cond:');
                    const isNa = token.value.startsWith('na:');

                    // Parse current parts for inline editors
                    const histParts = isHist ? token.value.split(':') : [];
                    const htfParts = isHtf ? token.value.split(':') : [];
                    const fnParts = isFnWithPeriod ? token.value.split(':') : [];

                    // Determine dropdown value for the main select
                    let selectValue = token.value;
                    if (isValue) selectValue = 'value:0';
                    else if (isHist) selectValue = 'hist:close:1';
                    else if (isHtf) selectValue = 'htf:D:close';
                    else if (isCross) selectValue = `cross:${token.value.split(':')[1]}`;
                    else if (isMath) selectValue = `math:${token.value.split(':')[1]}`;
                    else if (isCond) selectValue = 'cond:ternary';
                    else if (isNa && token.value !== 'na:value') selectValue = token.value.startsWith('na:check') ? 'na:check' : token.value.startsWith('na:replace') ? 'na:replace' : token.value;
                    else if (isFnWithPeriod) {
                        const fnKey = `fn:${fnParts[1]}:${fnParts[2] || '14'}`;
                        if (options.some((o) => o.value === fnKey)) selectValue = fnKey;
                        else selectValue = `fn:${fnParts[1]}:14`;
                    }

                    return (
                        <React.Fragment key={idx}>
                            <select
                                value={selectValue}
                                title="Operand"
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'value:0') {
                                        updateToken(idx, { value: 'value:0', valueNum: token.valueNum ?? 0 });
                                    } else {
                                        updateToken(idx, { value: val, valueNum: undefined });
                                    }
                                }}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none max-w-[180px]"
                            >
                                {renderOptionGroups()}
                            </select>

                            {/* Previous Bar: field/indicator picker + bars ago input */}
                            {isHist && (() => {
                                // hist:<field>:<n>  or  hist:ind:<indId>:<n>
                                const isIndHist = histParts[1] === 'ind';
                                const histField = isIndHist ? `ind:${histParts[2]}` : (histParts[1] || 'close');
                                const histN = isIndHist ? (histParts[3] || '1') : (histParts[2] || '1');
                                return (
                                    <>
                                        <select value={histField} title="Data"
                                            onChange={(e) => {
                                                const picked = e.target.value;
                                                if (picked.startsWith('ind:')) {
                                                    updateToken(idx, { value: `hist:${picked}:${histN}` });
                                                } else {
                                                    updateToken(idx, { value: `hist:${picked}:${histN}` });
                                                }
                                            }}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                            <optgroup label="Price">
                                                <option value="close">Close</option>
                                                <option value="open">Open</option>
                                                <option value="high">High</option>
                                                <option value="low">Low</option>
                                            </optgroup>
                                            {indicators.length > 0 && (
                                                <optgroup label="Indicators">
                                                    {indicators.map((ind) => (
                                                        <option key={ind.id} value={`ind:${ind.id}`}>{ind.name}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                        </select>
                                        <input type="number" min={1} value={parseInt(histN) || 1} title="Bars ago"
                                            onChange={(e) => {
                                                const n = e.target.value || '1';
                                                if (histField.startsWith('ind:')) {
                                                    updateToken(idx, { value: `hist:${histField}:${n}` });
                                                } else {
                                                    updateToken(idx, { value: `hist:${histField}:${n}` });
                                                }
                                            }}
                                            className="w-12 bg-[#1e222d] border border-white/[0.08] rounded px-1 py-1 text-[11px] text-gray-200 text-center focus:border-[#2962FF] outline-none" />
                                        <span className="text-[9px] text-gray-500">bars ago</span>
                                    </>
                                );
                            })()}

                            {/* Higher Timeframe: TF picker + field/indicator picker */}
                            {isHtf && (() => {
                                // htf:<tf>:<field>  or  htf:<tf>:ind:<indId>
                                const htfTf = htfParts[1] || 'D';
                                const htfField = htfParts.slice(2).join(':') || 'close';
                                const isIndField = htfField.startsWith('ind:');
                                return (
                                    <>
                                        <select value={htfTf} title="Timeframe"
                                            onChange={(e) => updateToken(idx, { value: `htf:${e.target.value}:${htfField}` })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                            <option value="5">5 min</option>
                                            <option value="15">15 min</option>
                                            <option value="30">30 min</option>
                                            <option value="60">1 Hour</option>
                                            <option value="240">4 Hour</option>
                                            <option value="D">Daily</option>
                                            <option value="W">Weekly</option>
                                            <option value="M">Monthly</option>
                                            <option value="3M">Quarterly</option>
                                            <option value="12M">Yearly</option>
                                        </select>
                                        <select value={isIndField ? htfField : htfField} title="Data"
                                            onChange={(e) => updateToken(idx, { value: `htf:${htfTf}:${e.target.value}` })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                            <optgroup label="Price">
                                                <option value="close">Close</option>
                                                <option value="open">Open</option>
                                                <option value="high">High</option>
                                                <option value="low">Low</option>
                                            </optgroup>
                                            {indicators.length > 0 && (
                                                <optgroup label="Indicators">
                                                    {indicators.map((ind) => (
                                                        <option key={ind.id} value={`ind:${ind.id}`}>{ind.name}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                        </select>
                                    </>
                                );
                            })()}

                            {/* Built-in function: source + period + timeframe */}
                            {isFnWithPeriod && (() => {
                                // Token: fn:<name>:<source>:<period>:<tf>
                                // Old formats migrated on the fly
                                const fnName = fnParts[1];
                                let fnSource: string;
                                let fnPeriod: string;
                                let fnTf: string; // '' or 'current' = current TF, else 'D','W','M', etc.

                                // Parse — detect format by part count and content
                                const allParts = fnParts.slice(2); // everything after fn:<name>
                                // Find where 'ind' appears to handle ind:<id> as source
                                if (allParts[0] === 'ind') {
                                    fnSource = `ind:${allParts[1]}`;
                                    fnPeriod = allParts[2] || '14';
                                    fnTf = allParts[3] || '';
                                } else if (allParts.length >= 3) {
                                    fnSource = allParts[0];
                                    fnPeriod = allParts[1];
                                    fnTf = allParts[2] || '';
                                } else if (allParts.length === 2) {
                                    fnSource = allParts[0];
                                    fnPeriod = allParts[1];
                                    fnTf = '';
                                } else {
                                    const defaultSrc: Record<string, string> = { highest: 'high', lowest: 'low', lastN: 'close', atr: 'close', stdev: 'close', change: 'close' };
                                    fnSource = defaultSrc[fnName] || 'close';
                                    fnPeriod = allParts[0] || '14';
                                    fnTf = '';
                                }

                                const rebuild = (src: string, per: string, tf: string) =>
                                    tf ? `fn:${fnName}:${src}:${per}:${tf}` : `fn:${fnName}:${src}:${per}`;

                                return (
                                    <>
                                        <span className="text-[9px] text-gray-500">of</span>
                                        <select value={fnSource} title="Source"
                                            onChange={(e) => updateToken(idx, { value: rebuild(e.target.value, fnPeriod, fnTf) })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                            <optgroup label="Price">
                                                <option value="close">Close</option>
                                                <option value="open">Open</option>
                                                <option value="high">High</option>
                                                <option value="low">Low</option>
                                            </optgroup>
                                            {indicators.length > 0 && (
                                                <optgroup label="Indicators">
                                                    {indicators.map((ind) => (
                                                        <option key={ind.id} value={`ind:${ind.id}`}>{ind.name}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                        </select>
                                        <span className="text-[9px] text-gray-500">over</span>
                                        <input type="number" min={1} value={parseInt(fnPeriod) || 14} title="Period (bars)"
                                            onChange={(e) => updateToken(idx, { value: rebuild(fnSource, e.target.value || '14', fnTf) })}
                                            className="w-12 bg-[#1e222d] border border-white/[0.08] rounded px-1 py-1 text-[11px] text-gray-200 text-center focus:border-[#2962FF] outline-none" />
                                        <span className="text-[9px] text-gray-500">bars</span>
                                        <span className="text-[9px] text-gray-500">from</span>
                                        <select value={fnTf || ''} title="Timeframe"
                                            onChange={(e) => updateToken(idx, { value: rebuild(fnSource, fnPeriod, e.target.value) })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                            <option value="">Current TF</option>
                                            <option value="5">5 min</option>
                                            <option value="15">15 min</option>
                                            <option value="30">30 min</option>
                                            <option value="60">1 Hour</option>
                                            <option value="240">4 Hour</option>
                                            <option value="D">Daily</option>
                                            <option value="W">Weekly</option>
                                            <option value="M">Monthly</option>
                                            <option value="3M">Quarterly</option>
                                            <option value="12M">Yearly</option>
                                        </select>
                                    </>
                                );
                            })()}

                            {/* Value: number input */}
                            {isValue && (
                                <input
                                    type="number"
                                    value={token.valueNum ?? 0}
                                    title="Numeric value"
                                    onChange={(e) => {
                                        const num = parseFloat(e.target.value) || 0;
                                        updateToken(idx, { value: `value:${num}`, valueNum: num });
                                    }}
                                    className="w-16 bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 text-center focus:border-[#2962FF] outline-none"
                                />
                            )}

                            {/* Crosses Above/Below: pick two operands */}
                            {isCross && (() => {
                                // cross:<dir>:<srcA>:<srcB>  (srcA/srcB can be ind:<id>)
                                const crossParts = token.value.split(':');
                                const dir = crossParts[1] || 'above';
                                let srcA = 'close', srcB = 'close';
                                const rest = crossParts.slice(2);
                                if (rest[0] === 'ind') { srcA = `ind:${rest[1]}`; const r2 = rest.slice(2); if (r2[0] === 'ind') { srcB = `ind:${r2[1]}`; } else { srcB = r2[0] || 'close'; } }
                                else { srcA = rest[0] || 'close'; const r2 = rest.slice(1); if (r2[0] === 'ind') { srcB = `ind:${r2[1]}`; } else { srcB = r2[0] || 'close'; } }
                                const rebuildCross = (d: string, a: string, b: string) => `cross:${d}:${a}:${b}`;
                                const sourceSelect = (val: string, title: string, onChange: (v: string) => void) => (
                                    <select value={val} title={title} onChange={(e) => onChange(e.target.value)}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                        <optgroup label="Price">
                                            <option value="close">Close</option><option value="open">Open</option>
                                            <option value="high">High</option><option value="low">Low</option>
                                        </optgroup>
                                        {indicators.length > 0 && (
                                            <optgroup label="Indicators">
                                                {indicators.map((ind) => <option key={ind.id} value={`ind:${ind.id}`}>{ind.name}</option>)}
                                            </optgroup>
                                        )}
                                        {priorFormulas.length > 0 && (
                                            <optgroup label="Formulas">
                                                {priorFormulas.map((f) => <option key={f.id} value={`formula:${f.name}`}>{f.name}</option>)}
                                            </optgroup>
                                        )}
                                    </select>
                                );
                                return (
                                    <>
                                        <span className="text-[9px] text-gray-500">(</span>
                                        {sourceSelect(srcA, 'Source A', (v) => updateToken(idx, { value: rebuildCross(dir, v, srcB) }))}
                                        <span className="text-[9px] text-purple-300 font-bold">{dir === 'above' ? '↗' : '↘'}</span>
                                        {sourceSelect(srcB, 'Source B', (v) => updateToken(idx, { value: rebuildCross(dir, srcA, v) }))}
                                        <span className="text-[9px] text-gray-500">)</span>
                                    </>
                                );
                            })()}

                            {/* Math functions: abs(x), max(a,b), min(a,b), round(x), sqrt(x) */}
                            {isMath && (() => {
                                const mathParts = token.value.split(':');
                                const mathFn = mathParts[1] || 'abs';
                                const needsTwo = mathFn === 'max' || mathFn === 'min';
                                let argA = mathParts[2] || 'close';
                                if (mathParts[2] === 'ind') argA = `ind:${mathParts[3]}`;
                                let argB = needsTwo ? (mathParts[argA.startsWith('ind:') ? 4 : 3] || 'close') : '';
                                if (needsTwo && mathParts[argA.startsWith('ind:') ? 4 : 3] === 'ind') argB = `ind:${mathParts[argA.startsWith('ind:') ? 5 : 4]}`;
                                const rebuildMath = (a: string, b?: string) => needsTwo ? `math:${mathFn}:${a}:${b || 'close'}` : `math:${mathFn}:${a}`;
                                const srcSelect = (val: string, title: string, onCh: (v: string) => void) => (
                                    <select value={val} title={title} onChange={(e) => onCh(e.target.value)}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                        <optgroup label="Price"><option value="close">Close</option><option value="open">Open</option><option value="high">High</option><option value="low">Low</option></optgroup>
                                        {indicators.length > 0 && <optgroup label="Indicators">{indicators.map((ind) => <option key={ind.id} value={`ind:${ind.id}`}>{ind.name}</option>)}</optgroup>}
                                        {priorFormulas.length > 0 && <optgroup label="Formulas">{priorFormulas.map((f) => <option key={f.id} value={`formula:${f.name}`}>{f.name}</option>)}</optgroup>}
                                    </select>
                                );
                                const fnLabel: Record<string, string> = { abs: 'Absolute of', max: 'Larger of', min: 'Smaller of', round: 'Round', sqrt: '√' };
                                return (
                                    <>
                                        <span className="text-[9px] text-amber-400 font-bold">{fnLabel[mathFn] || mathFn}</span>
                                        {srcSelect(argA, 'Source', (v) => updateToken(idx, { value: rebuildMath(v, argB) }))}
                                        {needsTwo && <><span className="text-[9px] text-gray-500">and</span>{srcSelect(argB, 'Source B', (v) => updateToken(idx, { value: rebuildMath(argA, v) }))}</>}
                                    </>
                                );
                            })()}

                            {/* Condition: If A > B then X else Y — stacked card layout */}
                            {isCond && (() => {
                                const cp = token.value.split(':');
                                const condA = cp[2] || 'close'; const condOp = cp[3] || '>'; const condB = cp[4] || 'open';
                                const thenV = cp[5] || 'value:1'; const elseV = cp[6] || 'value:0';
                                const rebuildCond = (a: string, op: string, b: string, t: string, e: string) => `cond:ternary:${a}:${op}:${b}:${t}:${e}`;
                                const condSelect = (val: string, title: string, onCh: (v: string) => void) => (
                                    <select value={val} title={title} onChange={(e) => onCh(e.target.value)}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none flex-1 min-w-[80px]">
                                        <optgroup label="Price"><option value="close">Close</option><option value="open">Open</option><option value="high">High</option><option value="low">Low</option></optgroup>
                                        {indicators.length > 0 && <optgroup label="Indicators">{indicators.map((ind) => <option key={ind.id} value={`ind:${ind.id}`}>{ind.name}</option>)}</optgroup>}
                                        {priorFormulas.length > 0 && <optgroup label="Formulas">{priorFormulas.map((f) => <option key={f.id} value={`formula:${f.name}`}>{f.name}</option>)}</optgroup>}
                                        <optgroup label="Fixed Values">
                                            <option value="value:1">1</option><option value="value:0">0</option><option value="value:-1">-1</option>
                                        </optgroup>
                                    </select>
                                );
                                return (
                                    <div className="bg-[#12121a] border border-white/[0.06] rounded-lg p-2.5 space-y-2 w-full mt-1">
                                        <p className="text-[9px] text-gray-500 italic">Choose a value based on a condition — returns THEN when true, ELSE when false.</p>

                                        {/* Row 1: WHEN condition */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-amber-400 w-12 flex-shrink-0">WHEN</span>
                                            {condSelect(condA, 'When this', (v) => updateToken(idx, { value: rebuildCond(v, condOp, condB, thenV, elseV) }))}
                                            <select value={condOp} title="Comparison" onChange={(e) => updateToken(idx, { value: rebuildCond(condA, e.target.value, condB, thenV, elseV) })}
                                                className="bg-[#1e222d] border border-purple-500/30 rounded px-2 py-1 text-[11px] text-purple-300 outline-none appearance-none">
                                                <option value=">">is above (&gt;)</option>
                                                <option value="<">is below (&lt;)</option>
                                                <option value=">=">is above or equal (&gt;=)</option>
                                                <option value="<=">is below or equal (&lt;=)</option>
                                                <option value="==">equals (==)</option>
                                                <option value="!=">not equals (!=)</option>
                                            </select>
                                            {condSelect(condB, 'Compared to this', (v) => updateToken(idx, { value: rebuildCond(condA, condOp, v, thenV, elseV) }))}
                                        </div>

                                        {/* Row 2: USE value */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-emerald-400 w-12 flex-shrink-0">USE</span>
                                            {condSelect(thenV, 'Use this value when true', (v) => updateToken(idx, { value: rebuildCond(condA, condOp, condB, v, elseV) }))}
                                        </div>

                                        {/* Row 3: OTHERWISE value */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-red-400 w-12 flex-shrink-0">OTHER</span>
                                            {condSelect(elseV, 'Use this value when false', (v) => updateToken(idx, { value: rebuildCond(condA, condOp, condB, thenV, v) }))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* na check / replace */}
                            {isNa && token.value.startsWith('na:check') && (() => {
                                const naParts = token.value.split(':');
                                const src = naParts[2] || 'close';
                                return (
                                    <>
                                        <span className="text-[9px] text-gray-500">is missing?</span>
                                        <select value={src} title="Source to check" onChange={(e) => updateToken(idx, { value: `na:check:${e.target.value}` })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                            <optgroup label="Price"><option value="close">Close</option><option value="open">Open</option><option value="high">High</option><option value="low">Low</option></optgroup>
                                            {indicators.length > 0 && <optgroup label="Indicators">{indicators.map((ind) => <option key={ind.id} value={`ind:${ind.id}`}>{ind.name}</option>)}</optgroup>}
                                            {priorFormulas.length > 0 && <optgroup label="Formulas">{priorFormulas.map((f) => <option key={f.id} value={`formula:${f.name}`}>{f.name}</option>)}</optgroup>}
                                        </select>
                                    </>
                                );
                            })()}
                            {isNa && token.value.startsWith('na:replace') && (() => {
                                const naParts = token.value.split(':');
                                const src = naParts[2] || 'close'; const repl = naParts[3] || '0';
                                return (
                                    <>
                                        <span className="text-[9px] text-gray-500">if</span>
                                        <select value={src} title="Source to check" onChange={(e) => updateToken(idx, { value: `na:replace:${e.target.value}:${repl}` })}
                                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                            <optgroup label="Price"><option value="close">Close</option><option value="open">Open</option><option value="high">High</option><option value="low">Low</option></optgroup>
                                            {indicators.length > 0 && <optgroup label="Indicators">{indicators.map((ind) => <option key={ind.id} value={`ind:${ind.id}`}>{ind.name}</option>)}</optgroup>}
                                            {priorFormulas.length > 0 && <optgroup label="Formulas">{priorFormulas.map((f) => <option key={f.id} value={`formula:${f.name}`}>{f.name}</option>)}</optgroup>}
                                        </select>
                                        <span className="text-[9px] text-gray-500">is missing, use</span>
                                        <input type="number" title="Replacement value" value={parseFloat(repl) || 0}
                                            onChange={(e) => updateToken(idx, { value: `na:replace:${src}:${e.target.value || '0'}` })}
                                            className="w-14 bg-[#1e222d] border border-white/[0.08] rounded px-1 py-1 text-[11px] text-gray-200 text-center focus:border-[#2962FF] outline-none" />
                                    </>
                                );
                            })()}
                        </React.Fragment>
                    );
                }

                // Operator token
                return (
                    <div key={idx} className="flex items-center gap-0.5">
                        <select
                            value={token.value}
                            title="Operator"
                            onChange={(e) => updateToken(idx, { value: e.target.value })}
                            className="bg-[#1e222d] border border-purple-500/30 rounded px-1.5 py-1 text-[11px] text-purple-300 focus:border-[#2962FF] outline-none appearance-none"
                        >
                            {OPERATOR_LIBRARY.map((o) => (
                                <option key={o.op} value={o.op}>{o.label}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => removeOperatorAt(idx)}
                            title="Remove this operator and operand"
                            className="text-gray-600 hover:text-red-400 transition-colors"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                );
            })}

            {/* Add operator button */}
            <select
                value=""
                title="Add operator"
                onChange={(e) => {
                    if (e.target.value) {
                        addOperatorPair(e.target.value);
                        e.target.value = '';
                    }
                }}
                className="w-7 text-center rounded bg-[#2962FF]/10 hover:bg-[#2962FF]/20 text-[#2962FF] text-sm font-bold border border-[#2962FF]/20 outline-none appearance-none cursor-pointer flex-shrink-0"
            >
                <option value="">+</option>
                {OPERATOR_LIBRARY.map((o) => (
                    <option key={o.op} value={o.op}>{o.label}</option>
                ))}
            </select>
        </div>
    );
};

export default ExpressionComposer;
