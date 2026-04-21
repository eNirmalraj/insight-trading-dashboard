import type { IndicatorModel, FormulaToken } from './types';
import { OPERATOR_LIBRARY } from './types';

const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

const sanitize = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

// Resolve a param value: if linked ($param:varName), return the variable name; else return literal
const pv = (val: any, fallback: any): string => {
    if (typeof val === 'string' && val.startsWith('$param:')) return val.slice(7);
    return String(val ?? fallback);
};

const KURI_FN: Record<string, (p: Record<string, any>) => string> = {
    SMA: (p) => `kuri.sma(${pv(p.source, 'close')}, ${pv(p.length, 14)})`,
    EMA: (p) => `kuri.ema(${pv(p.source, 'close')}, ${pv(p.length, 14)})`,
    WMA: (p) => `kuri.wma(${pv(p.source, 'close')}, ${pv(p.length, 14)})`,
    HMA: (p) => `kuri.hma(${pv(p.source, 'close')}, ${pv(p.length, 14)})`,
    RSI: (p) => `kuri.rsi(${pv(p.source, 'close')}, ${pv(p.length, 14)})`,
    ATR: (p) => `kuri.atr(${pv(p.length, 14)})`,
    BB: (p) => `kuri.bb(${pv(p.source, 'close')}, ${pv(p.length, 20)}, ${pv(p.mult, 2)})`,
    MACD: (p) => `kuri.macd(${pv(p.source, 'close')}, ${pv(p.fast, 12)}, ${pv(p.slow, 26)}, ${pv(p.signal, 9)})`,
    DC: (p) => `kuri.highest(high, ${pv(p.length, 20)})`,
    Supertrend: (p) => `kuri.supertrend(${pv(p.factor, 3)}, ${pv(p.length, 10)})`,
    ADX: (p) => `kuri.adx(${pv(p.length, 14)})`,
    KC: (p) => `kuri.kc(${pv(p.source, 'close')}, ${pv(p.length, 20)}, ${pv(p.mult, 1.5)})`,
    Stoch: (p) => `kuri.stoch(${pv(p.length, 14)}, ${pv(p.smoothK, 3)}, ${pv(p.smoothD, 3)})`,
    VWMA: (p) => `kuri.vwma(${pv(p.source, 'close')}, ${pv(p.length, 20)})`,
    CCI: (p) => `kuri.cci(${pv(p.source, 'hlc3')}, ${pv(p.length, 20)})`,
    MFI: (p) => `kuri.mfi(${pv(p.length, 14)})`,
    OBV: () => `kuri.obv()`,
    Vol: () => `volume`,
    VWAP: () => `kuri.vwap()`,
};

/** Resolve a single token to its Kuri expression */
function resolveToken(
    token: FormulaToken,
    model: IndicatorModel,
): string {
    const v = token.value;

    if (token.kind === 'operator') {
        const entry = OPERATOR_LIBRARY.find((o) => o.op === v);
        return entry ? entry.op : v;
    }

    // Operand resolution
    if (v.startsWith('param:')) return v.split(':')[1]; // user-defined parameter variable

    // Chart State — current chart timeframe info
    if (v === 'tf:multiplier') return 'timeframe.multiplier';
    if (v === 'tf:isintraday') return 'timeframe.isintraday';
    if (v === 'tf:isdaily') return 'timeframe.isdaily';
    if (v === 'tf:isweekly') return 'timeframe.isweekly';
    if (v === 'tf:ismonthly') return 'timeframe.ismonthly';
    if (v === 'tf:period') return 'timeframe.period';

    // Match (lookup table): map source value to output via chained comparisons
    // Emits nested ternary with per-case operators
    if (v.startsWith('match:')) {
        const source = token.matchParam || '';
        const cases = token.matchCases || [];
        const fallback = token.matchDefault || '';
        const outputType = token.matchOutputType || 'string';

        if (!source || cases.length === 0) return 'na';

        const formatOutput = (val: string): string => {
            if (outputType === 'number') {
                const n = parseFloat(val);
                return isNaN(n) ? '0' : String(n);
            }
            return `"${val.replace(/"/g, '\\"')}"`;
        };

        // Format "when" value based on source type — numeric for timeframe.multiplier etc., string otherwise
        const isNumericSource = source === 'timeframe.multiplier' || source === 'close' || source === 'open' || source === 'high' || source === 'low';
        const isBoolSource = source.startsWith('timeframe.is');
        const formatWhen = (val: string): string => {
            if (isBoolSource) return val.toLowerCase() === 'true' || val === '1' ? 'true' : 'false';
            if (isNumericSource) {
                const n = parseFloat(val);
                return isNaN(n) ? '0' : String(n);
            }
            return `"${val.replace(/"/g, '\\"')}"`;
        };

        let expr = formatOutput(fallback);
        for (let i = cases.length - 1; i >= 0; i--) {
            const c = cases[i];
            if (c.when === '') continue;
            const op = c.op || '==';
            expr = `${source} ${op} ${formatWhen(c.when)} ? ${formatOutput(c.then)} : ${expr}`;
        }
        return `(${expr})`;
    }

    if (v.startsWith('price:')) return v.split(':')[1];
    if (v.startsWith('hist:')) {
        const histParts = v.split(':');
        // hist:ind:<indId>:<n> — indicator history lookback
        if (histParts[1] === 'ind') {
            const indId = histParts[2];
            const n = histParts[3] || '1';
            const inst = model.indicators.find((i) => i.id === indId);
            if (inst) return `${sanitize(inst.name)}[${n}]`;
            return `na[${n}]`;
        }
        // hist:close:1 — price field history
        const [, field, n] = histParts;
        return `${field}[${n}]`;
    }
    if (v.startsWith('htf:')) {
        const htfParts = v.split(':');
        const tf = htfParts[1];
        const field = htfParts.slice(2).join(':');
        // htf:D:ind:<indId> — indicator on higher timeframe
        if (field.startsWith('ind:')) {
            const indId = field.split(':')[1];
            const inst = model.indicators.find((i) => i.id === indId);
            if (inst) {
                const fn = KURI_FN[inst.shortname];
                const expr = fn ? fn(inst.paramValues) : 'na';
                return `request.security("${tf}", ${expr})`;
            }
            return `request.security("${tf}", na)`;
        }
        return `request.security("${tf}", ${field})`;
    }
    if (v.startsWith('fn:')) {
        const parts = v.split(':');
        const fn = parts[1];
        if (fn === 'tr') return 'kuri.tr()';

        // Parse: fn:<name>:<source>:<period>:<tf?>
        // source can be "ind:<id>" (two segments)
        const allParts = parts.slice(2);
        let source: string;
        let period: string;
        let tf: string;

        if (allParts[0] === 'ind') {
            const indId = allParts[1];
            period = allParts[2] || '14';
            tf = allParts[3] || '';
            const inst = model.indicators.find((i) => i.id === indId);
            source = inst ? sanitize(inst.name) : 'close';
        } else if (allParts.length >= 3) {
            source = allParts[0];
            period = allParts[1];
            tf = allParts[2] || '';
        } else if (allParts.length === 2) {
            source = allParts[0];
            period = allParts[1];
            tf = '';
        } else {
            const defaultSrc: Record<string, string> = { highest: 'high', lowest: 'low', lastN: 'close', atr: 'close', stdev: 'close', change: 'close' };
            source = defaultSrc[fn] || 'close';
            period = allParts[0] || '14';
            tf = '';
        }

        let expr: string;
        switch (fn) {
            case 'highest': expr = `kuri.highest(${source}, ${period})`; break;
            case 'lowest': expr = `kuri.lowest(${source}, ${period})`; break;
            case 'lastN': expr = `${source}[${period}]`; break;
            case 'atr': expr = `kuri.atr(${period})`; break;
            case 'stdev': expr = `kuri.stdev(${source}, ${period})`; break;
            case 'change': expr = `kuri.change(${source}, ${period})`; break;
            default: expr = `kuri.${fn}(${source}, ${period})`; break;
        }

        // Wrap in request.security if a timeframe is specified
        if (tf) return `request.security("${tf}", ${expr})`;
        return expr;
    }
    if (v.startsWith('ind:')) {
        const [, instId, outVar] = v.split(':');
        const inst = model.indicators.find((i) => i.id === instId);
        if (!inst) return 'na';
        const varName = sanitize(inst.name);
        if (outVar && inst.parsed.outputs.length > 1) {
            return `${varName}.${outVar}`;
        }
        return varName;
    }
    if (v.startsWith('level:')) {
        const [, , val] = v.split(':');
        return val;
    }
    if (v.startsWith('formula:')) {
        return v.split(':')[1];
    }
    if (v.startsWith('value:')) {
        return String(token.valueNum ?? v.split(':')[1]);
    }

    // ── Shared arg resolver for compound tokens ──
    // Handles: 'ind' (next part = id), 'formula' (next part = name),
    //          'value' (next part = number), or plain price field
    const resolveCompoundArg = (parts: string[], startIdx: number): [string, number] => {
        const p = parts[startIdx];
        if (p === 'ind') {
            const inst = model.indicators.find((i) => i.id === parts[startIdx + 1]);
            return [inst ? sanitize(inst.name) : 'na', startIdx + 2];
        }
        if (p === 'formula') {
            return [parts[startIdx + 1] || 'na', startIdx + 2];
        }
        if (p === 'value') {
            return [parts[startIdx + 1] || '0', startIdx + 2];
        }
        return [p || 'close', startIdx + 1];
    };

    // Crosses Above/Below: cross:<dir>:<srcA>:<srcB>
    if (v.startsWith('cross:')) {
        const cp = v.split(':');
        const dir = cp[1];
        const [a, nextIdx] = resolveCompoundArg(cp, 2);
        const [b] = resolveCompoundArg(cp, nextIdx);
        return dir === 'above' ? `kuri.crossover(${a}, ${b})` : `kuri.crossunder(${a}, ${b})`;
    }

    // Math functions: math:<fn>:<argA>:<argB?>
    if (v.startsWith('math:')) {
        const mp = v.split(':');
        const mathFn = mp[1];
        const [a, nextIdx] = resolveCompoundArg(mp, 2);
        if (mathFn === 'max' || mathFn === 'min') {
            const [b] = resolveCompoundArg(mp, nextIdx);
            return `math.${mathFn}(${a}, ${b})`;
        }
        return `math.${mathFn}(${a})`;
    }

    // Conditional: cond:ternary:<condA>:<op>:<condB>:<then>:<else>
    if (v.startsWith('cond:ternary')) {
        const cp = v.split(':');
        const [condA, i1] = resolveCompoundArg(cp, 2);
        const op = cp[i1] || '>';
        const [condB, i2] = resolveCompoundArg(cp, i1 + 1);
        const [thenV, i3] = resolveCompoundArg(cp, i2);
        const [elseV] = resolveCompoundArg(cp, i3);
        return `(${condA} ${op} ${condB} ? ${thenV} : ${elseV})`;
    }

    // na handling
    if (v === 'na:value') return 'na';

    // Bar info
    if (v === 'barinfo:bar_index') return 'bar_index';
    if (v === 'barinfo:time') return 'time';
    if (v === 'barinfo:timenow') return 'timenow';
    if (v === 'barinfo:mintick') return 'syminfo.mintick';

    return v;
}

/** Convert a token array into a Kuri expression string */
function tokensToExpression(tokens: FormulaToken[], model: IndicatorModel): string {
    if (tokens.length === 0) return 'na';
    const parts = tokens.map((t) => resolveToken(t, model));
    const expr = parts.join(' ');
    // Wrap in parens if it contains operators
    const hasOp = tokens.some((t) => t.kind === 'operator');
    return hasOp ? `(${expr})` : expr;
}

export const generateKuri = (model: IndicatorModel): string => {
    const L: string[] = [];

    // 1. Frontmatter
    L.push('---');
    L.push('version: kuri 1.0');
    L.push('type: indicator');
    L.push(`name: ${q(model.info.name)}`);
    L.push(`shortname: ${q(model.info.shortname)}`);
    L.push(`pane: ${model.info.overlay ? 'overlay' : 'separate'}`);
    L.push('---');
    L.push('');

    // 2. User Inputs (parameters)
    if (model.parameters && model.parameters.length > 0) {
        L.push('// -- User Inputs --');
        for (const p of model.parameters) {
            const parts: string[] = [];
            if (p.type === 'string') {
                parts.push(q(String(p.defaultValue)));
            } else {
                parts.push(String(p.defaultValue));
            }
            if (p.title) parts.push(`title=${q(p.title)}`);
            if ((p.type === 'int' || p.type === 'float') && p.min !== undefined) parts.push(`minval=${p.min}`);
            if ((p.type === 'int' || p.type === 'float') && p.max !== undefined) parts.push(`maxval=${p.max}`);
            if (p.options && p.options.length > 0) {
                const optList = p.options.map((o) => p.type === 'string' ? q(o) : o).join(', ');
                parts.push(`options=[${optList}]`);
            }
            if (p.tooltip && p.tooltip.trim()) {
                // Preserve \n as literal backslash-n in the quoted string
                const escaped = p.tooltip.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
                parts.push(`tooltip="${escaped}"`);
            }
            L.push(`${p.varName} = param.${p.type}(${parts.join(', ')})`);
        }
        L.push('');
    }

    // 3. Indicator building blocks
    if (model.indicators.length > 0) {
        L.push('// -- Indicator building blocks --');
        for (const inst of model.indicators) {
            const varName = sanitize(inst.name);
            const fn = KURI_FN[inst.shortname];
            if (fn) {
                L.push(`${varName} = ${fn(inst.paramValues)}`);
            } else {
                L.push(`// ${inst.name}: custom indicator -- edit manually`);
                L.push(`${varName} = na`);
            }
        }
        L.push('');
    }

    // 3. Formulas
    if (model.formulas.length > 0) {
        L.push('// -- Formulas --');
        for (const f of model.formulas) {
            const expr = tokensToExpression(f.tokens, model);
            L.push(`${f.name} = ${expr}`);
        }
        L.push('');
    }

    // 4. Plots
    if (model.plots.length > 0) {
        L.push('// -- Plots --');
        for (const p of model.plots) {
            const formula = model.formulas.find((f) => f.id === p.formulaId);
            const formulaName = formula?.name ?? 'na';

            const col = p.color.startsWith('#') ? p.color : `#${p.color}`;

            // If visibilityParam is linked, wrap value in ternary: showFlag ? value : na
            const plotValue = p.visibilityParam
                ? `${p.visibilityParam} ? ${formulaName} : na`
                : formulaName;

            switch (p.kind) {
                case 'line':
                    L.push(`mark(${plotValue}, title=${q(p.title)}, color=${col})`);
                    break;
                case 'level':
                    L.push(`mark.level(${plotValue}, title=${q(p.title)}, color=${col})`);
                    break;
                case 'histogram':
                    L.push(`mark.bar(${plotValue}, title=${q(p.title)}, color=${col})`);
                    break;
                case 'area':
                    L.push(`mark.area(${plotValue}, title=${q(p.title)}, color=${col})`);
                    break;
                case 'marker': {
                    const loc = p.markerLocation === 'above' ? 'location.abovebar' : 'location.belowbar';
                    L.push(`plotshape(${plotValue}, location=${loc}, color=${col}, title=${q(p.title)})`);
                    break;
                }
            }
        }
        L.push('');
    }

    // 5. Alerts
    if (model.alerts.length > 0) {
        L.push('// -- Alerts --');
        for (const a of model.alerts) {
            const varName = `_alert_${sanitize(a.id)}`;
            const expr = tokensToExpression(a.condition, model);
            L.push(`${varName} = ${expr}`);
            L.push(`kuri.alert(${varName}, title=${q(a.title)}, message=${q(a.message)})`);
        }
        L.push('');
    }

    return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
};
