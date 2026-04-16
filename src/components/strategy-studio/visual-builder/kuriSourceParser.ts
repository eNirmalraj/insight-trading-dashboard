/**
 * kuriSourceParser — Parses .kuri indicator source code to extract:
 *   - Parameters (param.int, param.float, param.source, param.string, param.bool, param.color)
 *   - Outputs (mark() calls — the computed values the indicator plots)
 *   - Levels (mark.level() calls — reference horizontal lines)
 */

export interface ParsedParam {
    varName: string;
    type: 'int' | 'float' | 'source' | 'string' | 'bool' | 'color';
    title: string;
    defaultValue: any;
    min?: number;
    max?: number;
    options?: string[];
    isVisual: boolean;  // true = drawing/visual param (color, width, opacity, labels), false = core calculation param
}

export interface ParsedOutput {
    varName: string;
    title: string;
    kind: 'value' | 'level';  // value = mark() line plot, level = line.new() horizontal level
}

export interface ParsedLevel {
    value: number;
    title: string;
}

export interface ParsedCondition {
    varName: string;        // e.g., "FR_buy", "anyBuy"
    title: string;          // from kuri.alert() title, e.g., "False Rejection — BUY"
    type: 'buy' | 'sell' | 'any';  // inferred from name/title
}

export interface ParsedIndicator {
    params: ParsedParam[];
    outputs: ParsedOutput[];
    levels: ParsedLevel[];
    conditions: ParsedCondition[];  // boolean buy/sell signals computed by the indicator
}

/**
 * Determine if a parameter is visual/drawing (not affecting calculation).
 * Visual params: colors, line widths, opacity, show/hide toggles for labels/markers, pattern markers.
 * Core params: length, period, source, multiplier, factor, sensitivity, open type, etc.
 */
function isVisualParam(type: string, varName: string, title: string): boolean {
    // Color params are always visual
    if (type === 'color') return true;

    const nameLower = varName.toLowerCase();
    const titleLower = title.toLowerCase();

    // "Apply patterns to X" toggles are CORE — they affect which levels are checked
    if (titleLower.startsWith('apply pattern')) return false;

    // Visual keywords in variable name
    const visualVarKeywords = [
        'col_', 'color', 'colour',
        'linew', 'linewidth', 'width',
        'opacity', 'transp', 'transparency',
        'histopacity',
    ];
    for (const kw of visualVarKeywords) {
        if (nameLower.includes(kw)) return true;
    }

    // Visual keywords in title
    const visualTitleKeywords = [
        'color', 'colour',
        'line width', 'linewidth',
        'opacity', 'transparency',
        'show label', 'show price label', 'show marker', 'show pattern marker',
        'show history', 'show all history',
        'history line',
    ];
    for (const kw of visualTitleKeywords) {
        if (titleLower.includes(kw)) return true;
    }

    // Bool params starting with "show" are visual (show labels, show history, etc.)
    if (type === 'bool' && /^show/i.test(nameLower)) return true;

    return false;
}

/**
 * Parse a Kuri indicator source file and extract its structure.
 */
export function parseKuriSource(source: string): ParsedIndicator {
    const params: ParsedParam[] = [];
    const outputs: ParsedOutput[] = [];
    const levels: ParsedLevel[] = [];
    const conditions: ParsedCondition[] = [];

    if (!source) return { params, outputs, levels, conditions };

    // ── Pre-process: join multi-line param.* calls into single lines ──
    // A param.* call may span multiple lines if options/tooltip are long.
    // Join lines where a param.* starts but the closing ) is on a later line.
    const rawLines = source.split('\n');
    const lines: string[] = [];
    let accumulator = '';
    let parenDepth = 0;

    for (const raw of rawLines) {
        if (accumulator) {
            accumulator += ' ' + raw.trim();
            for (const ch of raw) {
                if (ch === '(') parenDepth++;
                if (ch === ')') parenDepth--;
            }
            if (parenDepth <= 0) {
                lines.push(accumulator);
                accumulator = '';
                parenDepth = 0;
            }
        } else if (/^\w+\s*=\s*param\./.test(raw.trim())) {
            // Check if this line has balanced parens
            let depth = 0;
            for (const ch of raw) {
                if (ch === '(') depth++;
                if (ch === ')') depth--;
            }
            if (depth <= 0) {
                lines.push(raw);
            } else {
                accumulator = raw.trim();
                parenDepth = depth;
            }
        } else {
            lines.push(raw);
        }
    }
    if (accumulator) lines.push(accumulator);

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip comments and YAML header
        if (trimmed.startsWith('//') || trimmed.startsWith('---')) continue;

        // ── Parse param.* ──
        const paramMatch = trimmed.match(
            /^(\w+)\s*=\s*param\.(int|float|source|string|bool|color)\((.+)\)\s*$/
        );
        if (paramMatch) {
            const [, varName, type, argsStr] = paramMatch;
            const parsed = parseParamArgs(type as ParsedParam['type'], argsStr);
            const isVisual = isVisualParam(type as string, varName, parsed.title);
            params.push({ varName, type: type as ParsedParam['type'], isVisual, ...parsed });
            continue;
        }

        // ── Parse mark() — outputs ──
        // match: mark(varExpr, title="Title", ...)
        // match: mark.bar(varExpr, ...), mark.area(varExpr, ...) etc.
        const markMatch = trimmed.match(
            /^mark(?:\.\w+)?\(([^,)]+)/
        );
        if (markMatch && !trimmed.startsWith('mark.level')) {
            const titleMatch = trimmed.match(/title\s*=\s*"([^"]+)"/);
            if (titleMatch) {
                // Extract the variable name from the first argument
                // Handle complex expressions like "direction < 0 ? supertrend : na"
                let varExpr = markMatch[1].trim();
                // Try to get a clean variable name
                const simpleVar = varExpr.match(/^(\w+)$/);
                if (simpleVar) {
                    varExpr = simpleVar[1];
                } else {
                    // For ternary expressions, try to extract the key variable
                    const ternaryMatch = varExpr.match(/\?\s*(\w+)/);
                    if (ternaryMatch) varExpr = ternaryMatch[1];
                }
                outputs.push({ varName: varExpr, title: titleMatch[1], kind: 'value' });
            }
            continue;
        }

        // ── Parse mark.level() — levels ──
        const levelMatch = trimmed.match(
            /^mark\.level\(([^,)]+)/
        );
        if (levelMatch) {
            const value = parseFloat(levelMatch[1].trim());
            const titleMatch = trimmed.match(/title\s*=\s*"([^"]+)"/);
            if (!isNaN(value) && titleMatch) {
                levels.push({ value, title: titleMatch[1] });
            }
            continue;
        }

        // ── Parse kuri.alert() / alertcondition() — buy/sell conditions ──
        const alertMatch = trimmed.match(
            /^(?:kuri\.alert|alertcondition)\(([^,]+),\s*(?:title\s*=\s*)?"([^"]+)"/
        );
        if (alertMatch) {
            const [, condExpr, title] = alertMatch;
            const condVar = condExpr.trim();
            // Determine type from title or variable name
            const titleLower = title.toLowerCase();
            const varLower = condVar.toLowerCase();
            let condType: 'buy' | 'sell' | 'any' = 'any';
            if (titleLower.includes('buy') || titleLower.includes('long') || titleLower.includes('uptrend') || varLower.endsWith('_buy') || varLower === 'anybuy') {
                condType = 'buy';
            } else if (titleLower.includes('sell') || titleLower.includes('short') || titleLower.includes('downtrend') || varLower.endsWith('_sell') || varLower === 'anysell') {
                condType = 'sell';
            }
            // Only add if the condition is a simple variable name (not inline expression)
            // Inline expressions like "kuri.crossover(rsi, 30)" are too complex for visual builder
            if (/^\w+$/.test(condVar)) {
                conditions.push({ varName: condVar, title, type: condType });
            }
            continue;
        }
    }

    // If no mark() outputs found, look for variable assignments that produce computed values
    // This handles indicators like MFL that use line.new() instead of mark()
    if (outputs.length === 0) {
        const varPattern = /^(?:var\s+)?(?:float\s+)?(\w+)\s*:?=\s*.+$/;
        const paramNames = new Set(params.map((p) => p.varName));
        const seenVars = new Set<string>();

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('---')) continue;
            const match = trimmed.match(varPattern);
            if (match) {
                const varName = match[1];
                // Skip params, loop vars, temp vars, and common non-output names
                if (paramNames.has(varName)) continue;
                if (['i', 'j', 'k', 'n', 'temp', 'fmt', 'prevTFTime', 'isNewHTF',
                    'tOpen', 'tClose', 'curO', 'curH', 'curL', 'curC',
                    'prevO', 'prevH', 'prevL', 'prevC', 'atrMapped',
                    'isGap', 'C', 'haveLevels', 'X', 'X1', 'X2', 'X3',
                    'shouldDraw', 'activeC', 'activeATR', 'activeOpen', 'activeClose',
                    'nudge_ms', 'xLabelTime', 'yBA', 'ySB', 'yRS', 'yRSL', 'yRB', 'yRBL',
                    'histEnd', 'hX', 'hX1', 'hX2', 'hX3',
                    'hBA', 'hSB', 'hRS', 'hRSL', 'hRB', 'hRBL',
                ].includes(varName)) continue;
                if (seenVars.has(varName)) continue;
                seenVars.add(varName);
            }
        }

        // For MFL-style indicators, look for specific level variable patterns
        // Variables that are computed from base price + ATR and used in line.new()
        const lineNewPattern = /line\.new\([^)]*y1\s*=\s*(\w+)/g;
        let lineMatch;
        const lineVars = new Set<string>();
        const fullSource = source;
        // Excluded: history variables (h-prefix), time variables, internal state
        const excludedLineVars = [
            'tOpen', 'tClose', 'histEnd', 'activeOpen', 'activeClose',
            'hBA', 'hSB', 'hRS', 'hRSL', 'hRB', 'hRBL',  // history duplicates
        ];
        while ((lineMatch = lineNewPattern.exec(fullSource)) !== null) {
            const varName = lineMatch[1];
            // Skip history variables (h-prefixed) and internal state
            if (excludedLineVars.includes(varName)) continue;
            if (/^h[A-Z]/.test(varName)) continue;  // skip any h-prefixed var
            lineVars.add(varName);
        }
        // Also check for y2 references
        const lineNewY2Pattern = /line\.new\([^)]*y2\s*=\s*(\w+)/g;
        while ((lineMatch = lineNewY2Pattern.exec(fullSource)) !== null) {
            const varName = lineMatch[1];
            if (excludedLineVars.includes(varName)) continue;
            if (/^h[A-Z]/.test(varName)) continue;
            lineVars.add(varName);
        }

        for (const v of lineVars) {
            if (!outputs.some((o) => o.varName === v)) {
                outputs.push({ varName: v, title: v, kind: 'level' });
            }
        }
    }

    return { params, outputs, levels, conditions };
}

/**
 * Parse the arguments string of a param.* call.
 */
function parseParamArgs(type: ParsedParam['type'], argsStr: string): Omit<ParsedParam, 'varName' | 'type' | 'isVisual'> {
    const result: Omit<ParsedParam, 'varName' | 'type' | 'isVisual'> = {
        title: '',
        defaultValue: undefined,
    };

    // Split by comma, but respect nested parentheses and brackets
    const args = splitArgs(argsStr);

    if (args.length === 0) return result;

    // First argument is always the default value
    const defaultStr = args[0].trim();

    switch (type) {
        case 'int':
            result.defaultValue = parseInt(defaultStr) || 0;
            break;
        case 'float':
            result.defaultValue = parseFloat(defaultStr) || 0;
            break;
        case 'bool':
            result.defaultValue = defaultStr === 'true';
            break;
        case 'source':
            result.defaultValue = defaultStr;
            break;
        case 'string':
            result.defaultValue = defaultStr.replace(/^["']|["']$/g, '');
            break;
        case 'color':
            result.defaultValue = defaultStr;
            break;
    }

    // Parse named arguments
    for (let i = 1; i < args.length; i++) {
        const arg = args[i].trim();
        const titleMatch = arg.match(/^title\s*=\s*"([^"]+)"/);
        if (titleMatch) { result.title = titleMatch[1]; continue; }

        const minMatch = arg.match(/^min(?:val)?\s*=\s*(-?[\d.]+)/);
        if (minMatch) { result.min = parseFloat(minMatch[1]); continue; }

        const maxMatch = arg.match(/^max(?:val)?\s*=\s*(-?[\d.]+)/);
        if (maxMatch) { result.max = parseFloat(maxMatch[1]); continue; }

        const optionsMatch = arg.match(/^options\s*=\s*\[([^\]]+)\]/);
        if (optionsMatch) {
            result.options = optionsMatch[1]
                .split(',')
                .map((o) => o.trim().replace(/^["']|["']$/g, ''));
            continue;
        }
    }

    return result;
}

/**
 * Split a string by commas, respecting nested brackets/parens.
 */
function splitArgs(str: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let current = '';

    for (const ch of str) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) {
            result.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) result.push(current);
    return result;
}
