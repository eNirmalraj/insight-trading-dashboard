import type { IndicatorModel, FormulaToken } from './types';
import { OPERATOR_LIBRARY } from './types';

const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

const sanitize = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

const KURI_FN: Record<string, (p: Record<string, any>) => string> = {
    SMA: (p) => `kuri.sma(${p.source ?? 'close'}, ${p.length ?? 14})`,
    EMA: (p) => `kuri.ema(${p.source ?? 'close'}, ${p.length ?? 14})`,
    WMA: (p) => `kuri.wma(${p.source ?? 'close'}, ${p.length ?? 14})`,
    HMA: (p) => `kuri.hma(${p.source ?? 'close'}, ${p.length ?? 14})`,
    RSI: (p) => `kuri.rsi(${p.source ?? 'close'}, ${p.length ?? 14})`,
    ATR: (p) => `kuri.atr(${p.length ?? 14})`,
    BB: (p) => `kuri.bb(${p.source ?? 'close'}, ${p.length ?? 20}, ${p.mult ?? 2})`,
    MACD: (p) => `kuri.macd(${p.source ?? 'close'}, ${p.fast ?? 12}, ${p.slow ?? 26}, ${p.signal ?? 9})`,
    DC: (p) => `kuri.highest(high, ${p.length ?? 20})`,
    Supertrend: (p) => `kuri.supertrend(${p.factor ?? 3}, ${p.length ?? 10})`,
    ADX: (p) => `kuri.adx(${p.length ?? 14})`,
    KC: (p) => `kuri.kc(${p.source ?? 'close'}, ${p.length ?? 20}, ${p.mult ?? 1.5})`,
    Stoch: (p) => `kuri.stoch(${p.length ?? 14}, ${p.smoothK ?? 3}, ${p.smoothD ?? 3})`,
    VWMA: (p) => `kuri.vwma(${p.source ?? 'close'}, ${p.length ?? 20})`,
    CCI: (p) => `kuri.cci(${p.source ?? 'hlc3'}, ${p.length ?? 20})`,
    MFI: (p) => `kuri.mfi(${p.length ?? 14})`,
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

    // Crosses Above/Below: cross:<dir>:<srcA>:<srcB>
    if (v.startsWith('cross:')) {
        const cp = v.split(':');
        const dir = cp[1];
        const resolveArg = (parts: string[], startIdx: number): [string, number] => {
            if (parts[startIdx] === 'ind') {
                const inst = model.indicators.find((i) => i.id === parts[startIdx + 1]);
                return [inst ? sanitize(inst.name) : 'na', startIdx + 2];
            }
            if (parts[startIdx]?.startsWith('formula:')) return [parts[startIdx].split(':')[1], startIdx + 1];
            return [parts[startIdx] || 'close', startIdx + 1];
        };
        const [a, nextIdx] = resolveArg(cp, 2);
        const [b] = resolveArg(cp, nextIdx);
        return dir === 'above' ? `kuri.crossover(${a}, ${b})` : `kuri.crossunder(${a}, ${b})`;
    }

    // Math functions: math:<fn>:<argA>:<argB?>
    if (v.startsWith('math:')) {
        const mp = v.split(':');
        const mathFn = mp[1];
        const resolveArg = (idx: number): string => {
            if (mp[idx] === 'ind') { const inst = model.indicators.find((i) => i.id === mp[idx + 1]); return inst ? sanitize(inst.name) : 'na'; }
            if (mp[idx]?.startsWith('formula:')) return mp[idx].split(':')[1];
            return mp[idx] || 'close';
        };
        const a = resolveArg(2);
        if (mathFn === 'max' || mathFn === 'min') {
            const bIdx = mp[2] === 'ind' ? 4 : 3;
            const b = resolveArg(bIdx);
            return `math.${mathFn}(${a}, ${b})`;
        }
        return `math.${mathFn}(${a})`;
    }

    // Conditional: cond:ternary:<condA>:<op>:<condB>:<then>:<else>
    if (v.startsWith('cond:ternary')) {
        const cp = v.split(':');
        const resolveArg = (idx: number): string => {
            if (cp[idx]?.startsWith('ind')) { const inst = model.indicators.find((i) => i.id === cp[idx + 1]); return inst ? sanitize(inst.name) : 'na'; }
            if (cp[idx]?.startsWith('formula')) return cp[idx].split(':')[1] || 'na';
            if (cp[idx]?.startsWith('value')) return cp[idx].split(':')[1] || '0';
            return cp[idx] || 'close';
        };
        const condA = resolveArg(2);
        const op = cp[3] || '>';
        const condB = resolveArg(4);
        const thenV = resolveArg(5);
        const elseV = resolveArg(6);
        return `(${condA} ${op} ${condB} ? ${thenV} : ${elseV})`;
    }

    // na handling
    if (v === 'na:value') return 'na';
    if (v.startsWith('na:check:')) {
        const src = v.split(':')[2] || 'close';
        const resolved = src.startsWith('ind:') ? (() => { const inst = model.indicators.find((i) => i.id === src.split(':')[1]); return inst ? sanitize(inst.name) : 'na'; })()
            : src.startsWith('formula:') ? src.split(':')[1]
            : src;
        return `na(${resolved})`;
    }
    if (v.startsWith('na:replace:')) {
        const parts = v.split(':');
        const src = parts[2] || 'close';
        const repl = parts[3] || '0';
        const resolved = src.startsWith('ind:') ? (() => { const inst = model.indicators.find((i) => i.id === src.split(':')[1]); return inst ? sanitize(inst.name) : 'na'; })()
            : src.startsWith('formula:') ? src.split(':')[1]
            : src;
        return `nz(${resolved}, ${repl})`;
    }

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

    // 2. Indicator building blocks
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

            const styleMap: Record<string, string> = {
                solid: 'mark.style_solid',
                dashed: 'mark.style_dashed',
                dotted: 'mark.style_dotted',
            };
            const style = styleMap[p.lineStyle] || 'mark.style_solid';

            switch (p.kind) {
                case 'line':
                    L.push(`mark(${formulaName}, title=${q(p.title)}, color=${q(p.color)}, width=${p.width}, style=${style})`);
                    break;
                case 'level':
                    L.push(`mark.level(${formulaName}, title=${q(p.title)}, color=${q(p.color)}, style=${style})`);
                    break;
                case 'histogram':
                    L.push(`mark.bar(${formulaName}, title=${q(p.title)}, color=${q(p.color)})`);
                    break;
                case 'area':
                    L.push(`mark.area(${formulaName}, title=${q(p.title)}, color=${q(p.color)})`);
                    break;
                case 'marker': {
                    const loc = p.markerLocation === 'above' ? 'location.abovebar' : 'location.belowbar';
                    L.push(`plotshape(${formulaName}, location=${loc}, color=${q(p.color)}, title=${q(p.title)})`);
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
