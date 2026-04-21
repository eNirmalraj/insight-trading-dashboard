/**
 * hydrator.ts — Parses raw .kuri source into IndicatorModel for the Visual Builder.
 *
 * Strategy:
 *   - Parse obvious constructs (frontmatter, params, known kuri.<fn> indicators,
 *     simple formulas, simple mark* plots, simple kuri.alert calls).
 *   - Everything else — complex expressions, if/else blocks, custom functions,
 *     var declarations, line.new/label.new — is preserved as raw CodeBlock / StateVar /
 *     IfBlock / CustomFunction / LineDraw / LabelDraw items so codegen can reproduce
 *     it verbatim.
 *   - itemOrder is tracked so codegen emits things in the original order.
 *
 * Key principle: when in doubt, fall back to raw CodeBlock. Wrong parsing is worse
 * than raw preservation.
 */

import type {
    IndicatorModel,
    ParameterDef,
    IndicatorInstance,
    Formula,
    FormulaToken,
    PlotDef,
    PlotKind,
    AlertRow,
    StateVar,
    CustomFunction,
    IfBlock,
    LineDraw,
    LabelDraw,
    CodeBlock,
    ItemOrderEntry,
    ParamType,
} from './types';
import { createEmptyModel } from './types';

let _uid = 0;
const nextId = (prefix: string): string => `${prefix}_${Date.now()}_${_uid++}`;

// ─────────────────────────────────────────────────────────────────────────────
// Frontmatter parsing
// ─────────────────────────────────────────────────────────────────────────────

interface FrontmatterResult {
    info: IndicatorModel['info'];
    extraFrontmatter: string[];
    consumedLines: number; // number of source lines consumed (including both --- markers)
}

function parseFrontmatter(source: string): FrontmatterResult {
    const lines = source.split('\n');
    const info: IndicatorModel['info'] = { name: 'My Indicator', shortname: '', overlay: true };
    const extraFrontmatter: string[] = [];

    if (!lines[0] || lines[0].trim() !== '---') {
        return { info, extraFrontmatter, consumedLines: 0 };
    }

    let i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
        const raw = lines[i];
        const line = raw.trim();
        if (line === '' || line.startsWith('#')) { extraFrontmatter.push(raw); i++; continue; }

        const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
        if (kv) {
            const key = kv[1];
            let val = kv[2].trim();
            const wasQuoted = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''));
            // strip surrounding quotes
            if (wasQuoted) val = val.slice(1, -1);
            if (key === 'name') { info.name = val; info.nameQuoted = wasQuoted; }
            else if (key === 'short' || key === 'shortname') { info.shortname = val; info.shortnameKey = key as 'short' | 'shortname'; }
            else if (key === 'pane') { info.overlay = val === 'overlay'; }
            else if (key === 'max_labels_count') {
                const n = parseInt(val, 10);
                if (!isNaN(n)) info.maxLabelsCount = n;
            }
            else if (key === 'max_lines_count') {
                const n = parseInt(val, 10);
                if (!isNaN(n)) info.maxLinesCount = n;
            }
            else if (key === 'version' || key === 'type') {
                // standard keys — still record to re-emit
                extraFrontmatter.push(raw);
            } else {
                extraFrontmatter.push(raw);
            }
        } else {
            extraFrontmatter.push(raw);
        }
        i++;
    }
    // i points at closing ---
    const consumedLines = i < lines.length ? i + 1 : i;
    return { info, extraFrontmatter, consumedLines };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokenizer — joins multi-line statements and classifies them.
// ─────────────────────────────────────────────────────────────────────────────

/** Count net paren/bracket depth contribution ignoring string content. */
function netDepthDelta(s: string): number {
    let depth = 0;
    let inStr: string | null = null;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (esc) { esc = false; continue; }
        if (inStr) {
            if (c === '\\') { esc = true; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === '\'') { inStr = c; continue; }
        if (c === '/' && s[i + 1] === '/') break; // comment — ignore rest of line
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
    }
    return depth;
}

/** Returns true if the line (after comments stripped) ends with a ternary `?` or `:` or arithmetic continuation. */
function endsWithContinuation(s: string): boolean {
    const noComment = stripComment(s).trimEnd();
    if (noComment === '') return false;
    const last = noComment[noComment.length - 1];
    return last === '?' || last === ':' || last === '+' || last === '-' || last === '*' || last === '/' || last === ',' || last === '(' || last === '[';
}

function stripComment(s: string): string {
    let inStr: string | null = null;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (esc) { esc = false; continue; }
        if (inStr) {
            if (c === '\\') { esc = true; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === '\'') { inStr = c; continue; }
        if (c === '/' && s[i + 1] === '/') return s.slice(0, i);
    }
    return s;
}

/** Return the indent width (count of leading spaces/tabs, tabs counted as 4). */
function indentWidth(s: string): number {
    let w = 0;
    for (const c of s) {
        if (c === ' ') w++;
        else if (c === '\t') w += 4;
        else break;
    }
    return w;
}

interface LogicalStatement {
    /** Raw source lines that compose this statement (original text, no trailing newline). */
    rawLines: string[];
    /** Zero-based line index in the source (of the first rawLine). */
    startLine: number;
    /** Indent width of the first raw line. */
    indent: number;
}

/**
 * Group physical lines into logical statements. A logical statement is:
 *   - A single non-indented line (indent === baseIndent), possibly followed by indented continuation lines
 *   - OR a multi-line expression where parentheses/brackets aren't balanced on the header line
 *   - OR a multi-line ternary (line ends with `?` or `:`)
 *   - OR an `if <cond>` header followed by its indented block
 *   - OR an `f_name(args) =>` header followed by its indented body
 *
 * Blank lines and comment-only lines are emitted as their own statements so we can
 * preserve whitespace/comment layout in codeBlocks.
 */
function groupLogicalStatements(lines: string[], startLine: number): LogicalStatement[] {
    const out: LogicalStatement[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Blank line or comment-only line — emit standalone
        if (trimmed === '' || trimmed.startsWith('//')) {
            out.push({ rawLines: [line], startLine: startLine + i, indent: indentWidth(line) });
            i++;
            continue;
        }

        const baseIndent = indentWidth(line);
        const collected: string[] = [line];
        let j = i + 1;

        // 1. Continue while parens/brackets/braces unbalanced
        let depth = netDepthDelta(line);

        // 2. Continue while the last non-comment line ends with a continuation char (`?`, `:`, `+`, etc.)
        //    BUT only when the next line is more indented (so it belongs to this expression).
        let expectMore = depth > 0 || endsWithContinuation(line);

        while (j < lines.length && expectMore) {
            const nxt = lines[j];
            const nxtTrim = nxt.trim();
            const nxtIndent = indentWidth(nxt);

            if (nxtTrim === '') {
                // Blank line inside continuation — usually means continuation ended. Stop.
                break;
            }
            // If parens still open, we must consume everything until balanced, regardless of indent.
            // If parens are balanced but we're waiting for ternary body, require the next line to be indented.
            if (depth <= 0 && nxtIndent <= baseIndent) {
                break;
            }
            collected.push(nxt);
            depth += netDepthDelta(nxt);
            expectMore = depth > 0 || endsWithContinuation(nxt);
            j++;
        }

        // 3. Block headers: `if <cond>`, `else`, `else if`, `for ...`, `while ...`, `switch ...`, `f_foo(...) =>`
        //    Pull in indented body lines.
        //    We also handle the case where the header itself was a single-line and we already collected
        //    continuation lines (collected[] may be >1).
        const headerText = collected.map((l) => stripComment(l)).join(' ').trim();
        const isBlockHeader = isStatementBlockHeader(headerText);
        if (isBlockHeader) {
            while (j < lines.length) {
                const nxt = lines[j];
                const nxtTrim = nxt.trim();
                if (nxtTrim === '') {
                    // Look ahead — if the NEXT non-blank is still indented, include this blank. Otherwise stop.
                    let k = j + 1;
                    while (k < lines.length && lines[k].trim() === '') k++;
                    if (k < lines.length && indentWidth(lines[k]) > baseIndent) {
                        collected.push(nxt);
                        j++;
                        continue;
                    }
                    break;
                }
                if (indentWidth(nxt) <= baseIndent) break;
                collected.push(nxt);
                j++;
            }
            // After collecting the body, check for an `else` / `else if` chain at the same base indent
            while (j < lines.length) {
                // Skip blank lines between blocks only if they are followed by an else/elseif at same indent
                let k = j;
                while (k < lines.length && lines[k].trim() === '') k++;
                if (k >= lines.length) break;
                const candidate = lines[k];
                if (indentWidth(candidate) !== baseIndent) break;
                const cTrim = candidate.trim();
                if (!cTrim.startsWith('else')) break;
                // include intervening blanks + this else line
                for (let m = j; m <= k; m++) collected.push(lines[m]);
                j = k + 1;
                // pull else's indented body
                while (j < lines.length) {
                    const nxt = lines[j];
                    const nxtTrim = nxt.trim();
                    if (nxtTrim === '') {
                        let kk = j + 1;
                        while (kk < lines.length && lines[kk].trim() === '') kk++;
                        if (kk < lines.length && indentWidth(lines[kk]) > baseIndent) {
                            collected.push(nxt);
                            j++;
                            continue;
                        }
                        break;
                    }
                    if (indentWidth(nxt) <= baseIndent) break;
                    collected.push(nxt);
                    j++;
                }
            }
        }

        out.push({ rawLines: collected, startLine: startLine + i, indent: baseIndent });
        i = j;
    }
    return out;
}

function isStatementBlockHeader(text: string): boolean {
    // Strip leading var/float/int type prefixes
    const t = text.trim();
    if (/^if\b/.test(t)) return true;
    if (/^for\b/.test(t)) return true;
    if (/^while\b/.test(t)) return true;
    if (/^switch\b/.test(t)) return true;
    // custom function: `f_name(args) =>` with NO expression after =>
    const fnMatch = t.match(/^([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*=>\s*(.*)$/);
    if (fnMatch) {
        const body = fnMatch[3].trim();
        if (body === '' || body.startsWith('//')) return true;
    }
    // `var <type> <name> = switch <expr>` — switch with indented body
    if (/=\s*switch\b/.test(t)) return true;
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification of a logical statement
// ─────────────────────────────────────────────────────────────────────────────

function joinLogical(stmt: LogicalStatement): string {
    return stmt.rawLines.join('\n');
}

function headerText(stmt: LogicalStatement): string {
    // All raw lines joined with spaces, comments stripped, whitespace collapsed — used for regex classification.
    return stmt.rawLines.map((l) => stripComment(l)).join(' ').replace(/\s+/g, ' ').trim();
}

/** Split top-level args respecting parens/brackets/braces and strings. */
function splitTopLevelArgs(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let inStr: string | null = null;
    let esc = false;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (esc) { cur += c; esc = false; continue; }
        if (inStr) {
            cur += c;
            if (c === '\\') { esc = true; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === '\'') { inStr = c; cur += c; continue; }
        if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
        if (c === ')' || c === ']' || c === '}') { depth--; cur += c; continue; }
        if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += c;
    }
    if (cur.trim() !== '' || out.length > 0) out.push(cur);
    return out.map((a) => a.trim());
}

/** Parse named arg `title=...`. Returns null if not a named arg. */
function parseNamedArg(arg: string): { key: string; value: string } | null {
    const m = arg.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([\s\S]+)$/);
    if (!m) return null;
    return { key: m[1], value: m[2].trim() };
}

function unquote(s: string): string {
    const t = s.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
        const inner = t.slice(1, -1);
        // decode escape sequences: \n \r \t \" \' \\
        return inner.replace(/\\(["'\\nrt])/g, (_m, c) => {
            switch (c) {
                case 'n': return '\n';
                case 'r': return '\r';
                case 't': return '\t';
                default: return c;
            }
        });
    }
    return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parameter parsing — name = param.<type>(default, title=..., min=..., max=..., options=[...], tooltip=...)
// ─────────────────────────────────────────────────────────────────────────────

function tryParseParameter(stmt: LogicalStatement): ParameterDef | null {
    const text = headerText(stmt);
    const m = text.match(/^([a-zA-Z_]\w*)\s*=\s*param\.([a-z]+)\s*\(([\s\S]*)\)\s*$/);
    if (!m) return null;
    const varName = m[1];
    const rawType = m[2];
    const argsStr = m[3];

    // Only simple types map to model. Skip source/color — those become codeBlocks
    // UNLESS we can degrade gracefully.
    const typeMap: Record<string, ParamType> = {
        int: 'int', float: 'float', bool: 'bool', string: 'string',
    };
    const modelType = typeMap[rawType];
    if (!modelType) return null;

    const args = splitTopLevelArgs(argsStr);
    if (args.length === 0) return null;

    const defaultRaw = args[0];
    let defaultValue: any;
    switch (modelType) {
        case 'int': { const n = parseInt(defaultRaw, 10); defaultValue = isNaN(n) ? 0 : n; break; }
        case 'float': { const n = parseFloat(defaultRaw); defaultValue = isNaN(n) ? 0 : n; break; }
        case 'bool': defaultValue = defaultRaw.trim() === 'true'; break;
        case 'string': defaultValue = unquote(defaultRaw); break;
    }

    const p: ParameterDef = {
        id: nextId('param'),
        varName,
        title: '',
        type: modelType,
        defaultValue,
        defaultRaw: defaultRaw.trim(),
    };

    for (let i = 1; i < args.length; i++) {
        const na = parseNamedArg(args[i]);
        if (!na) continue;
        switch (na.key) {
            case 'title': p.title = unquote(na.value); break;
            case 'min': case 'minval': {
                const n = parseFloat(na.value);
                if (!isNaN(n)) { p.min = n; p.minKey = na.key === 'min' ? 'min' : 'minval'; }
                break;
            }
            case 'max': case 'maxval': {
                const n = parseFloat(na.value);
                if (!isNaN(n)) { p.max = n; p.maxKey = na.key === 'max' ? 'max' : 'maxval'; }
                break;
            }
            case 'options': {
                // parse [a, b, c] or ["a","b","c"]
                const v = na.value.trim();
                if (v.startsWith('[') && v.endsWith(']')) {
                    const inner = v.slice(1, -1);
                    p.options = splitTopLevelArgs(inner).map((x) => unquote(x));
                }
                break;
            }
            case 'tooltip': p.tooltip = unquote(na.value); break;
        }
    }
    return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known kuri.<fn> indicator calls → IndicatorInstance
// ─────────────────────────────────────────────────────────────────────────────

interface KuriFnSignature {
    shortname: string;
    /** ordered list of param value-keys consumed from positional args */
    argKeys: string[];
}

const KURI_SIGS: Record<string, KuriFnSignature> = {
    'kuri.sma': { shortname: 'SMA', argKeys: ['source', 'length'] },
    'kuri.ema': { shortname: 'EMA', argKeys: ['source', 'length'] },
    'kuri.wma': { shortname: 'WMA', argKeys: ['source', 'length'] },
    'kuri.hma': { shortname: 'HMA', argKeys: ['source', 'length'] },
    'kuri.rsi': { shortname: 'RSI', argKeys: ['source', 'length'] },
    'kuri.atr': { shortname: 'ATR', argKeys: ['length'] },
    'kuri.bb': { shortname: 'BB', argKeys: ['source', 'length', 'mult'] },
    'kuri.macd': { shortname: 'MACD', argKeys: ['source', 'fast', 'slow', 'signal'] },
    'kuri.supertrend': { shortname: 'Supertrend', argKeys: ['factor', 'length'] },
    'kuri.adx': { shortname: 'ADX', argKeys: ['length'] },
    'kuri.kc': { shortname: 'KC', argKeys: ['source', 'length', 'mult'] },
    'kuri.stoch': { shortname: 'Stoch', argKeys: ['length', 'smoothK', 'smoothD'] },
    'kuri.vwma': { shortname: 'VWMA', argKeys: ['source', 'length'] },
    'kuri.cci': { shortname: 'CCI', argKeys: ['source', 'length'] },
    'kuri.mfi': { shortname: 'MFI', argKeys: ['length'] },
    'kuri.obv': { shortname: 'OBV', argKeys: [] },
    'kuri.vwap': { shortname: 'VWAP', argKeys: [] },
};

function tryParseIndicatorInstance(stmt: LogicalStatement): IndicatorInstance | null {
    const text = headerText(stmt);
    // name = kuri.<fn>(args)
    const m = text.match(/^([a-zA-Z_]\w*)\s*=\s*(kuri\.[a-z]+)\s*\(([\s\S]*)\)\s*$/);
    if (!m) return null;
    const varName = m[1];
    const fnName = m[2];
    const sig = KURI_SIGS[fnName];
    if (!sig) return null;
    const argsStr = m[3];
    const args = argsStr.trim() === '' ? [] : splitTopLevelArgs(argsStr);
    // Must match expected arity (allow shorter for optional-defaulted but reject longer).
    if (args.length > sig.argKeys.length) return null;

    const paramValues: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
        paramValues[sig.argKeys[i]] = args[i];
    }

    const inst: IndicatorInstance = {
        id: nextId('ind'),
        name: varName,
        shortname: sig.shortname,
        kuriSource: '',
        parsed: { params: [], outputs: [{ varName, title: varName, kind: 'value' }], levels: [], conditions: [] },
        paramValues,
    };
    return inst;
}

// ─────────────────────────────────────────────────────────────────────────────
// State variables: var <type> <name> = <init>   OR   var <name> = <init>
// ─────────────────────────────────────────────────────────────────────────────

function tryParseStateVar(stmt: LogicalStatement): StateVar | null {
    // Must be a single-line statement for a state var (no body)
    if (stmt.rawLines.length !== 1) return null;
    const text = stripComment(stmt.rawLines[0]).trim();
    // var [type] name = init
    const m = text.match(/^var\s+(?:(float|int|bool|string|line|label|color)\s+)?([a-zA-Z_]\w*)\s*=\s*(.+)$/);
    if (!m) return null;
    const varType = (m[1] as StateVar['varType']) || '';
    const varName = m[2];
    const initialValue = m[3].trim();
    return { id: nextId('sv'), varName, varType, initialValue };
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom function: f_name(args) =>\n  <body>   OR   name(args) => expr
// ─────────────────────────────────────────────────────────────────────────────

function tryParseCustomFunction(stmt: LogicalStatement): CustomFunction | null {
    const first = stripComment(stmt.rawLines[0]).trim();
    const m = first.match(/^([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*=>\s*(.*)$/);
    if (!m) return null;
    const fnName = m[1];
    const argsStr = m[2];
    const inlineBody = m[3].trim();

    const args = argsStr.trim() === '' ? [] : argsStr.split(',').map((a) => a.trim()).filter((a) => a.length > 0);

    // Only accept function-like names (must contain _ or start with f/F/is/has etc.). Reject param.X, kuri.X etc.
    if (!/^[a-zA-Z_]\w*$/.test(fnName)) return null;
    // Reject if fnName looks like a keyword/builtin
    const reserved = new Set(['if', 'else', 'for', 'while', 'switch', 'var', 'float', 'int', 'bool', 'string', 'true', 'false', 'na', 'and', 'or', 'not']);
    if (reserved.has(fnName)) return null;

    if (inlineBody !== '') {
        // single-line function def
        if (stmt.rawLines.length === 1) {
            return { id: nextId('fn'), fnName, args, body: inlineBody };
        }
        // otherwise fall through — multi-line body starting inline + indented continuation
        const bodyLines = [inlineBody, ...stmt.rawLines.slice(1)];
        return { id: nextId('fn'), fnName, args, body: bodyLines.join('\n') };
    }
    // Body lines are the rest of rawLines (indented)
    if (stmt.rawLines.length <= 1) return null;
    const body = stmt.rawLines.slice(1).join('\n');
    return { id: nextId('fn'), fnName, args, body };
}

// ─────────────────────────────────────────────────────────────────────────────
// If/else block — anything starting with `if` that has indented body
// ─────────────────────────────────────────────────────────────────────────────

function tryParseIfBlock(stmt: LogicalStatement): IfBlock | null {
    if (stmt.rawLines.length < 2) return null;
    const first = stripComment(stmt.rawLines[0]).trim();
    if (!/^if\s+/.test(first)) return null;
    const condition = first.replace(/^if\s+/, '').trim();

    // Walk rawLines grouping into then/else bodies at the base indent + 1
    const baseIndent = stmt.indent;
    const then: string[] = [];
    const els: string[] = [];
    let mode: 'then' | 'else' = 'then';

    for (let i = 1; i < stmt.rawLines.length; i++) {
        const line = stmt.rawLines[i];
        const trimmed = line.trim();
        const ind = indentWidth(line);
        if (trimmed === '' ) {
            // attach to current mode
            if (mode === 'then') then.push(line); else els.push(line);
            continue;
        }
        if (ind === baseIndent && /^else(\s+if\b|\s*$)/.test(trimmed)) {
            mode = 'else';
            // preserve the else/elseif line itself as part of else body
            els.push(line);
            continue;
        }
        if (mode === 'then') then.push(line); else els.push(line);
    }
    const ib: IfBlock = {
        id: nextId('if'),
        condition,
        thenBody: then.join('\n'),
    };
    if (els.length > 0) ib.elseBody = els.join('\n');
    return ib;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plots — mark(), mark.level(), mark.bar(), mark.area(), plotshape()
// Only simple cases (first arg is a bare var reference to a formula OR a formula name)
// Complex cases fall back to code block.
// ─────────────────────────────────────────────────────────────────────────────

function tryParsePlot(stmt: LogicalStatement, formulaNameToId: Map<string, string>): PlotDef | null {
    const text = headerText(stmt);
    let kind: PlotKind | null = null;
    let argsStr = '';

    const markLvl = text.match(/^mark\.level\s*\(([\s\S]*)\)\s*$/);
    if (markLvl) { kind = 'level'; argsStr = markLvl[1]; }
    const markBar = text.match(/^mark\.bar\s*\(([\s\S]*)\)\s*$/);
    if (markBar) { kind = 'histogram'; argsStr = markBar[1]; }
    const markArea = text.match(/^mark\.area\s*\(([\s\S]*)\)\s*$/);
    if (markArea) { kind = 'area'; argsStr = markArea[1]; }
    const markPlain = text.match(/^mark\s*\(([\s\S]*)\)\s*$/);
    if (markPlain && !markLvl && !markBar && !markArea) { kind = 'line'; argsStr = markPlain[1]; }
    const plotShape = text.match(/^plotshape\s*\(([\s\S]*)\)\s*$/);
    if (plotShape) { kind = 'marker'; argsStr = plotShape[1]; }

    if (!kind) return null;
    const args = splitTopLevelArgs(argsStr);
    if (args.length === 0) return null;

    const valueExpr = args[0].trim();

    // Extract named args
    let title = '';
    let color = '#2962FF';
    let markerLocation: 'above' | 'below' | undefined;
    for (let i = 1; i < args.length; i++) {
        const na = parseNamedArg(args[i]);
        if (!na) continue;
        if (na.key === 'title') title = unquote(na.value);
        else if (na.key === 'color') {
            const v = na.value.trim();
            if (v.startsWith('#')) color = v;
            else {
                // color.blue / color.new(...) / variable ref → keep default, fallback to code block if we want literal colors preserved
                // We keep default here; full fidelity is preserved via codeBlock fallback instead for non-simple plots.
                return null;
            }
        }
        else if (na.key === 'location') {
            if (na.value.includes('above')) markerLocation = 'above';
            else if (na.value.includes('below')) markerLocation = 'below';
        }
    }

    // For mark.level(), the first arg is usually a numeric literal. For others it must be a var reference.
    let formulaId: string;
    if (kind === 'level') {
        // Find or create a pseudo-formula representing the literal/expression
        // We'll treat the first arg literally — codegen will round-trip via formula lookup.
        // Simplest: only accept simple identifier that matches a known formula; otherwise bail out.
        if (!/^[a-zA-Z_]\w*$/.test(valueExpr) && !/^-?\d+(\.\d+)?$/.test(valueExpr)) return null;
        // For numeric literals we create an implicit "formula" with that name — codegen wraps it inline.
        // To keep things simple, only accept when valueExpr is a known formula name; otherwise fall back to code.
        const fid = formulaNameToId.get(valueExpr);
        if (!fid && !/^-?\d+(\.\d+)?$/.test(valueExpr)) return null;
        if (fid) formulaId = fid;
        else return null;
    } else {
        if (!/^[a-zA-Z_]\w*$/.test(valueExpr)) return null;
        const fid = formulaNameToId.get(valueExpr);
        if (!fid) return null;
        formulaId = fid;
    }

    const plot: PlotDef = {
        id: nextId('plot'),
        formulaId,
        title: title || valueExpr,
        kind,
        color,
        lineStyle: 'solid',
        width: 2,
    };
    if (markerLocation) plot.markerLocation = markerLocation;
    return plot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerts — kuri.alert(<condVar>, title=..., message=...) OR kuri.alert(<cond>, "title", "msg")
// ─────────────────────────────────────────────────────────────────────────────

function tryParseAlert(stmt: LogicalStatement): { alert: AlertRow; condVarName: string } | null {
    const text = headerText(stmt);
    const m = text.match(/^kuri\.alert\s*\(([\s\S]*)\)\s*$/);
    if (!m) return null;
    const args = splitTopLevelArgs(m[1]);
    if (args.length < 2) return null;

    const condExpr = args[0].trim();
    // Only accept simple var ref for now
    if (!/^[a-zA-Z_]\w*$/.test(condExpr)) return null;

    let title = '';
    let message = '';
    // Remaining positional args (title, message) OR named args (title=..., message=...)
    for (let i = 1; i < args.length; i++) {
        const a = args[i].trim();
        const na = parseNamedArg(a);
        if (na) {
            if (na.key === 'title') title = unquote(na.value);
            else if (na.key === 'message') {
                // message can be an expression with string concatenation — keep raw if not a pure quoted literal
                const v = na.value.trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\''))) {
                    message = unquote(v);
                } else {
                    // complex expression — bail out, fall back to code block
                    return null;
                }
            }
        } else {
            if (i === 1) title = unquote(a);
            else if (i === 2) {
                if ((a.startsWith('"') && a.endsWith('"')) || (a.startsWith('\'') && a.endsWith('\''))) {
                    message = unquote(a);
                } else {
                    return null;
                }
            }
        }
    }
    if (!title) return null;

    const alert: AlertRow = {
        id: nextId('alert'),
        title,
        message,
        condition: [{ kind: 'operand', value: `formula:${condExpr}` }],
    };
    return { alert, condVarName: condExpr };
}

// ─────────────────────────────────────────────────────────────────────────────
// Line / Label draws — varName = line.new(...)  or  varName = label.new(...)
// ─────────────────────────────────────────────────────────────────────────────

function tryParseLineDraw(stmt: LogicalStatement): LineDraw | null {
    const text = headerText(stmt);
    const m = text.match(/^([a-zA-Z_]\w*)\s*:?=\s*line\.new\s*\(([\s\S]*)\)\s*$/);
    if (!m) return null;
    const varName = m[1];
    const args = splitTopLevelArgs(m[2]);
    let x1 = '', y1 = '', x2 = '', y2 = '', colorExpr = '';
    let widthExpr: string | undefined, styleExpr: string | undefined;
    for (const a of args) {
        const na = parseNamedArg(a);
        if (!na) continue;
        if (na.key === 'x1') x1 = na.value;
        else if (na.key === 'y1') y1 = na.value;
        else if (na.key === 'x2') x2 = na.value;
        else if (na.key === 'y2') y2 = na.value;
        else if (na.key === 'color') colorExpr = na.value;
        else if (na.key === 'width') widthExpr = na.value;
        else if (na.key === 'style') styleExpr = na.value;
    }
    if (!x1 || !y1 || !x2 || !y2) return null;
    const ld: LineDraw = {
        id: nextId('line'),
        varName,
        x1Expr: x1, y1Expr: y1, x2Expr: x2, y2Expr: y2,
        colorExpr: colorExpr || 'color.blue',
    };
    if (widthExpr !== undefined) ld.widthExpr = widthExpr;
    if (styleExpr !== undefined) ld.styleExpr = styleExpr;
    return ld;
}

function tryParseLabelDraw(stmt: LogicalStatement): LabelDraw | null {
    const text = headerText(stmt);
    const m = text.match(/^([a-zA-Z_]\w*)\s*:?=\s*label\.new\s*\(([\s\S]*)\)\s*$/);
    if (!m) return null;
    const varName = m[1];
    const args = splitTopLevelArgs(m[2]);
    let xExpr = '', yExpr = '', textExpr = '';
    let colorExpr: string | undefined, styleExpr: string | undefined;
    for (const a of args) {
        const na = parseNamedArg(a);
        if (!na) continue;
        if (na.key === 'x') xExpr = na.value;
        else if (na.key === 'y') yExpr = na.value;
        else if (na.key === 'text') textExpr = na.value;
        else if (na.key === 'color' || na.key === 'textcolor') colorExpr = na.value;
        else if (na.key === 'style') styleExpr = na.value;
    }
    if (!xExpr || !yExpr || !textExpr) return null;
    const lb: LabelDraw = {
        id: nextId('label'),
        varName,
        xExpr, yExpr, textExpr,
    };
    if (colorExpr !== undefined) lb.colorExpr = colorExpr;
    if (styleExpr !== undefined) lb.styleExpr = styleExpr;
    return lb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula parsing — simple assignment `name = <expr>`
//
// We attempt to tokenize the expression into FormulaToken[]. If the expression
// contains anything unsupported (ternary, function calls we don't recognize,
// custom function calls, etc.) we bail and return null → caller stores as code block.
// ─────────────────────────────────────────────────────────────────────────────

function tryParseSimpleFormula(stmt: LogicalStatement, known: {
    paramVars: Set<string>;
    indicatorByVar: Map<string, IndicatorInstance>;
    formulaNames: Set<string>;
}): { name: string; tokens: FormulaToken[] } | null {
    if (stmt.rawLines.length !== 1) return null;
    const text = stripComment(stmt.rawLines[0]).trim();
    // Reject block headers & special assignments
    if (/^(var|if|for|while|switch|else)\b/.test(text)) return null;

    const m = text.match(/^(?:(float|int|bool|string)\s+)?([a-zA-Z_]\w*)\s*=\s*(.+)$/);
    if (!m) return null;
    const name = m[2];
    const expr = m[3].trim();

    // Reject if the RHS is clearly a construct we handle elsewhere
    if (/^param\./.test(expr)) return null;
    if (/^kuri\.alert\b/.test(expr)) return null;
    if (/^line\.new\b/.test(expr)) return null;
    if (/^label\.new\b/.test(expr)) return null;
    if (/^switch\b/.test(expr)) return null;
    // ternary?  contain `?` at top level? We'll bail — too complex for FormulaToken model.
    if (containsTopLevelTernary(expr)) return null;

    const tokens = tokenizeExpression(expr, known);
    if (!tokens) return null;
    return { name, tokens };
}

function containsTopLevelTernary(s: string): boolean {
    let depth = 0;
    let inStr: string | null = null;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (esc) { esc = false; continue; }
        if (inStr) {
            if (c === '\\') { esc = true; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === '\'') { inStr = c; continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === '?' && depth === 0) return true;
    }
    return false;
}

/**
 * Tokenize a simple expression into FormulaToken[].
 * Grammar supported (conservative):
 *   operand ( <op> operand )*
 *   operand := price | histRef | formulaRef | paramRef | numericLit | knownFn(...) | indicatorRef
 *
 * Returns null if anything unparseable is encountered.
 */
function tokenizeExpression(expr: string, known: {
    paramVars: Set<string>;
    indicatorByVar: Map<string, IndicatorInstance>;
    formulaNames: Set<string>;
}): FormulaToken[] | null {
    const tokens: FormulaToken[] = [];
    let i = 0;
    const s = expr;
    const len = s.length;

    const skipWs = () => { while (i < len && /\s/.test(s[i])) i++; };

    const readIdent = (): string | null => {
        skipWs();
        const start = i;
        while (i < len && /[a-zA-Z0-9_.]/.test(s[i])) i++;
        if (i === start) return null;
        return s.slice(start, i);
    };

    const readNumber = (): string | null => {
        skipWs();
        const start = i;
        if (s[i] === '-') i++;
        while (i < len && /[0-9.]/.test(s[i])) i++;
        const str = s.slice(start, i);
        if (str === '' || str === '-' || !/^-?[0-9]+(\.[0-9]+)?$/.test(str)) { i = start; return null; }
        return str;
    };

    const readOperator = (): string | null => {
        skipWs();
        if (i >= len) return null;
        // Two-char operators
        const two = s.slice(i, i + 2);
        if (two === '<=' || two === '>=' || two === '==' || two === '!=') { i += 2; return two; }
        const c = s[i];
        if (c === '+' || c === '-' || c === '*' || c === '/' || c === '<' || c === '>') { i++; return c; }
        // word operators
        const save = i;
        const ident = readIdent();
        if (ident === 'and' || ident === 'or') return ident;
        i = save;
        return null;
    };

    const readParenBalanced = (): string | null => {
        // assumes s[i] === '('
        if (s[i] !== '(') return null;
        let depth = 0;
        const start = i;
        for (; i < len; i++) {
            if (s[i] === '(') depth++;
            else if (s[i] === ')') { depth--; if (depth === 0) { i++; return s.slice(start, i); } }
        }
        return null;
    };

    const readOperand = (): FormulaToken | null => {
        skipWs();
        if (i >= len) return null;
        // numeric literal
        const saveNum = i;
        const num = readNumber();
        if (num !== null) {
            // make sure what follows isn't an identifier char
            if (i < len && /[a-zA-Z_]/.test(s[i])) { i = saveNum; }
            else {
                const n = parseFloat(num);
                return { kind: 'operand', value: `value:${num}`, valueNum: isNaN(n) ? undefined : n };
            }
        }
        // parenthesized expression — too complex for our simple token model
        if (s[i] === '(') return null;
        // identifier (may have dots for member access, and may have [n] history or (args) call)
        const identStart = i;
        const ident = readIdent();
        if (!ident) return null;
        // history access: ident[n]
        if (s[i] === '[') {
            // read [n]
            let d = 0, start = i;
            for (; i < len; i++) {
                if (s[i] === '[') d++;
                else if (s[i] === ']') { d--; if (d === 0) { i++; break; } }
            }
            const histExpr = s.slice(start + 1, i - 1).trim();
            if (!/^-?\d+$/.test(histExpr)) return null; // only simple numeric history
            // Identify ident: price field? formula? indicator?
            if (['close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'hlcc4', 'ohlc4'].includes(ident)) {
                return { kind: 'operand', value: `hist:${ident}:${histExpr}` };
            }
            if (known.indicatorByVar.has(ident)) {
                const inst = known.indicatorByVar.get(ident)!;
                return { kind: 'operand', value: `hist:ind:${inst.id}:${histExpr}` };
            }
            // formula[n] — not supported by codegen directly → bail
            return null;
        }
        // function call: ident(args)
        if (s[i] === '(') {
            // Only accept known kuri.* or math.* functions with simple args
            const argsRaw = readParenBalanced();
            if (!argsRaw) return null;
            const inner = argsRaw.slice(1, -1);
            const args = inner.trim() === '' ? [] : splitTopLevelArgs(inner);
            // Only accept functions where every arg is a simple operand (identifier or number)
            for (const a of args) {
                if (!/^-?\d+(\.\d+)?$/.test(a) && !/^[a-zA-Z_]\w*$/.test(a)) return null;
            }
            // Map to fn: form when recognized
            if (ident === 'kuri.highest' && args.length === 2) return { kind: 'operand', value: `fn:highest:${args[0]}:${args[1]}` };
            if (ident === 'kuri.lowest' && args.length === 2) return { kind: 'operand', value: `fn:lowest:${args[0]}:${args[1]}` };
            if (ident === 'kuri.atr' && args.length === 1) return { kind: 'operand', value: `fn:atr:close:${args[0]}` };
            if (ident === 'kuri.stdev' && args.length === 2) return { kind: 'operand', value: `fn:stdev:${args[0]}:${args[1]}` };
            if (ident === 'kuri.change' && (args.length === 1 || args.length === 2)) {
                return { kind: 'operand', value: `fn:change:${args[0]||'close'}:${args[1]||'1'}` };
            }
            if (ident === 'kuri.tr' && args.length === 0) return { kind: 'operand', value: `fn:tr` };
            // Crossovers
            if (ident === 'kuri.crossover' && args.length === 2) {
                return { kind: 'operand', value: `cross:above:${args[0]}:${args[1]}` };
            }
            if (ident === 'kuri.crossunder' && args.length === 2) {
                return { kind: 'operand', value: `cross:below:${args[0]}:${args[1]}` };
            }
            // math.*
            if (ident.startsWith('math.')) {
                const fn = ident.slice(5);
                if (['max', 'min'].includes(fn) && args.length === 2) {
                    return { kind: 'operand', value: `math:${fn}:${args[0]}:${args[1]}` };
                }
                if (['abs', 'round', 'floor', 'ceil', 'sqrt'].includes(fn) && args.length === 1) {
                    return { kind: 'operand', value: `math:${fn}:${args[0]}` };
                }
            }
            // Unrecognized function call — bail.
            void identStart;
            return null;
        }
        // plain identifier
        // price field?
        if (['close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'hlcc4', 'ohlc4'].includes(ident)) {
            return { kind: 'operand', value: `price:${ident}` };
        }
        if (ident === 'na') return { kind: 'operand', value: 'na:value' };
        if (known.indicatorByVar.has(ident)) {
            const inst = known.indicatorByVar.get(ident)!;
            return { kind: 'operand', value: `ind:${inst.id}` };
        }
        if (known.paramVars.has(ident)) {
            return { kind: 'operand', value: `param:${ident}` };
        }
        if (known.formulaNames.has(ident)) {
            return { kind: 'operand', value: `formula:${ident}` };
        }
        // Unknown identifier (probably a bare variable not in our model) — bail
        return null;
    };

    // Parse: operand ( op operand )*
    const first = readOperand();
    if (!first) return null;
    tokens.push(first);
    while (true) {
        skipWs();
        if (i >= len) break;
        const op = readOperator();
        if (!op) return null;
        tokens.push({ kind: 'operator', value: op });
        const nxt = readOperand();
        if (!nxt) return null;
        tokens.push(nxt);
    }
    return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export function parseKuriToModel(source: string): IndicatorModel {
    const model = createEmptyModel();
    if (!source || source.trim() === '') return model;

    const { info, extraFrontmatter, consumedLines } = parseFrontmatter(source);
    model.info = info;
    if (extraFrontmatter.length > 0) model.extraFrontmatter = extraFrontmatter;

    const allLines = source.split('\n');
    const bodyLines = allLines.slice(consumedLines);
    const statements = groupLogicalStatements(bodyLines, consumedLines);

    const itemOrder: ItemOrderEntry[] = [];
    const paramVars = new Set<string>();
    const indicatorByVar = new Map<string, IndicatorInstance>();
    const formulaNames = new Set<string>();
    const formulaNameToId = new Map<string, string>();
    const alertCondVars = new Set<string>(); // vars used as alert conditions, promoted to formulas

    // First pass: classify and push into model
    for (const stmt of statements) {
        const joined = joinLogical(stmt);
        const text = headerText(stmt);

        // Skip pure blank/comment statements → stash as codeBlock to preserve whitespace & comments.
        if (text === '') {
            // Avoid leading run of blank lines bloating the model — still emit as code block so layout round-trips.
            const cb: CodeBlock = { id: nextId('cb'), code: joined, originalLineStart: stmt.startLine };
            model.codeBlocks.push(cb);
            itemOrder.push({ kind: 'codeBlock', id: cb.id });
            continue;
        }

        // 1. Parameter
        const p = tryParseParameter(stmt);
        if (p) {
            model.parameters.push(p);
            paramVars.add(p.varName);
            itemOrder.push({ kind: 'parameter', id: p.id });
            continue;
        }

        // 2. Known indicator instance
        const inst = tryParseIndicatorInstance(stmt);
        if (inst) {
            model.indicators.push(inst);
            indicatorByVar.set(inst.name, inst);
            itemOrder.push({ kind: 'indicator', id: inst.id });
            continue;
        }

        // 3. State variable (var ...)
        const sv = tryParseStateVar(stmt);
        if (sv) {
            model.stateVars.push(sv);
            itemOrder.push({ kind: 'stateVar', id: sv.id });
            continue;
        }

        // 4. Custom function (f_xxx(args) =>)
        const cf = tryParseCustomFunction(stmt);
        if (cf) {
            model.customFunctions.push(cf);
            itemOrder.push({ kind: 'customFunction', id: cf.id });
            continue;
        }

        // 5. If block
        const ib = tryParseIfBlock(stmt);
        if (ib) {
            model.ifBlocks.push(ib);
            itemOrder.push({ kind: 'ifBlock', id: ib.id });
            continue;
        }

        // 6. Line draw (var = line.new(...))
        const ln = tryParseLineDraw(stmt);
        if (ln && stmt.rawLines.length === 1) {
            model.lineDraws.push(ln);
            itemOrder.push({ kind: 'lineDraw', id: ln.id });
            continue;
        }

        // 7. Label draw (var = label.new(...))
        const lb = tryParseLabelDraw(stmt);
        if (lb && stmt.rawLines.length === 1) {
            model.labelDraws.push(lb);
            itemOrder.push({ kind: 'labelDraw', id: lb.id });
            continue;
        }

        // 8. Plot (mark/plotshape)
        const plot = tryParsePlot(stmt, formulaNameToId);
        if (plot) {
            model.plots.push(plot);
            itemOrder.push({ kind: 'plot', id: plot.id });
            continue;
        }

        // 9. Alert (kuri.alert(...))
        const al = tryParseAlert(stmt);
        if (al) {
            model.alerts.push(al.alert);
            alertCondVars.add(al.condVarName);
            itemOrder.push({ kind: 'alert', id: al.alert.id });
            continue;
        }

        // 10. Simple formula
        const ff = tryParseSimpleFormula(stmt, { paramVars, indicatorByVar, formulaNames });
        if (ff) {
            const f: Formula = { id: nextId('f'), name: ff.name, tokens: ff.tokens };
            model.formulas.push(f);
            formulaNames.add(f.name);
            formulaNameToId.set(f.name, f.id);
            itemOrder.push({ kind: 'formula', id: f.id });
            continue;
        }

        // 11. Fallback: raw code block
        const cb: CodeBlock = { id: nextId('cb'), code: joined, originalLineStart: stmt.startLine };
        model.codeBlocks.push(cb);
        itemOrder.push({ kind: 'codeBlock', id: cb.id });
    }

    model.itemOrder = itemOrder;
    return model;
}
