/**
 * VisualBuilder — Form wizard for creating strategies using indicators.
 * Steps: 1. Indicators (+ params)  2. Entry & Exit Rules (smart logic)  3. Risk  4. Review
 * Parses .kuri source to extract params, outputs, levels for the logic builder.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import IndicatorPickerModal from '../../market-chart/IndicatorPickerModal';
import { DEFAULT_INDICATORS } from '../../../indicators';
import { parseKuriSource, type ParsedIndicator, type ParsedParam, type ParsedCondition } from './kuriSourceParser';
import type { Strategy } from '../../../types';

interface VisualBuilderProps {
    onCodeChange: (code: string) => void;
    strategyName: string;
}

const SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'];

/* ── Condition operators ── */
/* Standard operators work as: left CONDITION right */
/* Pattern operators (FR, FB, TW, BF, SR) check price-level interactions — they require candle OHLC + a price level */
const CONDITIONS = [
    { label: 'crosses above', fn: 'kuri.crossover' },
    { label: 'crosses below', fn: 'kuri.crossunder' },
    { label: 'is above (>)', op: '>' },
    { label: 'is below (<)', op: '<' },
    { label: 'is greater or equal (>=)', op: '>=' },
    { label: 'is less or equal (<=)', op: '<=' },
    { label: 'equals (==)', op: '==' },
    { label: 'not equals (!=)', op: '!=' },
    { label: 'plus (+)', op: '+' },
    { label: 'minus (-)', op: '-' },
    { label: 'times (*)', op: '*' },
    { label: 'divided by (/)', op: '/' },
    { label: 'AND', op: 'and' },
    { label: 'OR', op: 'or' },
    // Pattern operators — price vs level patterns
    { label: 'False Rejection (Buy)', helper: 'f_falseRejBuy' },
    { label: 'False Rejection (Sell)', helper: 'f_falseRejSell' },
    { label: 'False Breakout (Buy)', helper: 'f_falseBrkBuy' },
    { label: 'False Breakout (Sell)', helper: 'f_falseBrkSell' },
    { label: 'Two Wick Rejection (Buy)', helper: 'f_twoWickBuy' },
    { label: 'Two Wick Rejection (Sell)', helper: 'f_twoWickSell' },
    { label: 'Breakout + Follow-through (Buy)', helper: 'f_bofBuy' },
    { label: 'Breakout + Follow-through (Sell)', helper: 'f_bofSell' },
    { label: 'Single Rejection (Buy)', helper: 'f_singleRejBuy' },
    { label: 'Single Rejection (Sell)', helper: 'f_singleRejSell' },
];

/* ── Pattern helper function definitions — emitted into generated Kuri code ── */
const PATTERN_HELPERS = `// Pattern detection helpers
f_falseRejBuy(level) =>
    first = (high[1] >= level) and (open[1] < level and low[1] < level and close[1] < level)
    next  = (open < level and low < level and high > level and close > level and close > high[1])
    first and next

f_falseRejSell(level) =>
    first = (low[1] <= level) and (open[1] > level and high[1] > level and close[1] > level)
    next  = (open > level and high > level and low < level and close < level and close < low[1])
    first and next

f_falseBrkBuy(level) =>
    first = (high[1] > level and open[1] > level) and (low[1] < level and close[1] < level)
    next  = (open < level and low < level and high > level and close > level)
    first and next

f_falseBrkSell(level) =>
    first = (low[1] < level and open[1] < level) and (high[1] > level and close[1] > level)
    next  = (open > level and high > level and low < level and close < level)
    first and next

f_twoWickBuy(level) =>
    first = (low[1] < level) and (open[1] > level and high[1] > level and close[1] > level)
    next  = (low < level) and (close > high[1])
    first and next

f_twoWickSell(level) =>
    first = (high[1] > level) and (open[1] < level and low[1] < level and close[1] < level)
    next  = (high > level) and (close < low[1])
    first and next

f_bofBuy(level) =>
    first = (open[1] < level and low[1] < level) and (close[1] > level and high[1] > level)
    next  = (open > level and high > level) and (close > level) and (close > high[1])
    first and next

f_bofSell(level) =>
    first = (open[1] > level and high[1] > level) and (close[1] < level and low[1] < level)
    next  = (open < level and low < level) and (close < level) and (close < low[1])
    first and next

f_singleRejBuy(level) =>
    first = (low[1] < level) and (open[1] > level and high[1] > level and close[1] > level)
    next  = (open > level and low > level and high > level) and (close > level) and (close > high[1])
    first and next

f_singleRejSell(level) =>
    first = (high[1] > level) and (open[1] < level and low[1] < level and close[1] < level)
    next  = (open < level and high < level and low < level) and (close < level) and (close < low[1])
    first and next
`;

/* ── Data types ── */
interface IndicatorConfig {
    id: string;
    name: string;
    shortname: string;
    kuriSource: string;
    parsed: ParsedIndicator;
    paramValues: Record<string, any>;
    paramLocked: Record<string, boolean>;
}

interface ConditionConfig {
    id: string;
    mode: 'manual' | 'signal';  // manual = left/condition/right, signal = pre-computed boolean
    left: string;       // "ind:ID:varName" or "price:close" or "level:ID:value"
    condition: string;
    right: string;       // same format, or "value:NUMBER"
    rightValue: number;
    signalIndId?: string;   // indicator ID for signal mode
    signalVar?: string;     // variable name for signal mode (e.g., "FR_buy")
    signalTitle?: string;   // display title (e.g., "False Rejection — BUY")
}

/* ── Shortname map for picker ── */
const SHORTNAME_MAP: Record<string, string> = {
    'SMA': 'sma', 'EMA': 'ema', 'WMA': 'wma', 'HMA': 'hma', 'VWMA': 'vwma',
    'RSI': 'rsi', 'MACD': 'macd', 'Stoch': 'stochastic', 'CCI': 'cci',
    'MFI': 'mfi', 'ADX': 'adx', 'ATR': 'atr', 'BB': 'bb',
    'Supertrend': 'supertrend', 'OBV': 'obv', 'VWAP': 'vwap', 'Vol': 'volume',
    'DC': 'donchian', 'KC': 'keltner', 'Ichimoku': 'ichimoku',
    'MA Ribbon': 'ma-ribbon', 'ADR': 'adr', 'MFL': 'money-flow-levels',
};

/* ================================================================ */
/*  COMPONENT                                                        */
/* ================================================================ */
export const VisualBuilder: React.FC<VisualBuilderProps> = ({ onCodeChange, strategyName }) => {
    const [step, setStep] = useState(1);

    // Indicators
    const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);

    // Step 2: Named conditions (user-built + auto-detected signals)
    // Structure: Action(buy/sell) = Left(price/indicator) — Condition(operator/pattern) — Right(level/value)
    // A single chain link — used to build compound AND expressions on one row
    // Example: close > SMA10 AND SMA10 > SMA20
    //   left=close, condition=">", right=SMA10  → base
    //   chain=[{left=SMA10, condition=">", right=SMA20}]  → extra links
    interface ChainLink {
        // 'continue' = inherit previous right as left (for a > b > c)
        // 'and' / 'or' = logical joiner starting a fresh segment (close > SMA20 AND RSI > 70)
        joiner: 'continue' | 'and' | 'or';
        left: string;
        condition: string;
        right: string;
        rightValue: number;
    }
    interface NamedCondition {
        id: string;
        action: 'buy' | 'sell';
        left: string;
        condition: string;
        right: string;
        rightValue: number;
        chain?: ChainLink[];    // additional AND chain links
        source: 'auto' | 'manual';
        signalVar?: string;
        signalIndId?: string;
        enabled: boolean;
    }
    const [namedConditions, setNamedConditions] = useState<NamedCondition[]>([]);
    // Toggle: true = auto-use indicator's pre-built conditions, false = create your own manually
    const [useIndicatorConditions, setUseIndicatorConditions] = useState(true);

    // Entry/Exit — references named conditions
    const [entryConditions, setEntryConditions] = useState<ConditionConfig[]>([]);
    const [exitConditions, setExitConditions] = useState<ConditionConfig[]>([]);
    const [entryDirection, setEntryDirection] = useState<'long' | 'short'>('long');

    // Risk
    const [useStopLoss, setUseStopLoss] = useState(true);
    const [useTakeProfit, setUseTakeProfit] = useState(true);
    const [slPercent, setSlPercent] = useState(2);
    const [tpPercent, setTpPercent] = useState(4);

    // Picker
    const [showPicker, setShowPicker] = useState(false);
    const [customScripts, setCustomScripts] = useState<Strategy[]>([]);

    useEffect(() => {
        import('../../../services/strategyService').then(({ getStrategies }) =>
            getStrategies().then((all) => setCustomScripts(all.filter((s) => s.type === 'INDICATOR')))
        ).catch(() => {});
    }, []);

    /* ── Auto-suffix a base name so it stays unique: "SMA", "SMA 2", "SMA 3"… ── */
    const uniqueName = (base: string, existing: { name: string }[]): string => {
        const taken = new Set(existing.map((e) => e.name.toLowerCase()));
        if (!taken.has(base.toLowerCase())) return base;
        let n = 2;
        while (taken.has(`${base} ${n}`.toLowerCase())) n++;
        return `${base} ${n}`;
    };

    /* ── Add indicator from picker ── */
    const handlePickerAdd = useCallback((shortname: string) => {
        const indId = SHORTNAME_MAP[shortname] || shortname.toLowerCase();
        const meta = DEFAULT_INDICATORS.find((i) => i.id === indId || i.shortname === shortname);
        if (!meta) { setShowPicker(false); return; }

        setIndicators((prev) => {
            const parsed = parseKuriSource(meta.kuriSource);
            const paramValues: Record<string, any> = {};
            const paramLocked: Record<string, boolean> = {};
            for (const p of parsed.params) {
                paramValues[p.varName] = p.defaultValue;
                paramLocked[p.varName] = false;
            }
            return [...prev, {
                id: String(Date.now()),
                name: uniqueName(meta.name, prev),
                shortname: meta.shortname,
                kuriSource: meta.kuriSource,
                parsed,
                paramValues,
                paramLocked,
            }];
        });
        setShowPicker(false);
    }, []);

    const handlePickerAddCustom = useCallback((script: Strategy) => {
        const source = script.scriptSource || script.kuriScript || '';
        setIndicators((prev) => {
            const parsed = parseKuriSource(source);
            const paramValues: Record<string, any> = {};
            const paramLocked: Record<string, boolean> = {};
            for (const p of parsed.params) {
                paramValues[p.varName] = p.defaultValue;
                paramLocked[p.varName] = false;
            }
            return [...prev, {
                id: String(Date.now()),
                name: uniqueName(script.name, prev),
                shortname: 'Custom',
                kuriSource: source,
                parsed,
                paramValues,
                paramLocked,
            }];
        });
        setShowPicker(false);
    }, []);

    const renameIndicator = useCallback((id: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        setIndicators((prev) => {
            if (prev.some((i) => i.id !== id && i.name.toLowerCase() === trimmed.toLowerCase())) {
                alert(`"${trimmed}" is already in use. Pick a different name.`);
                return prev;
            }
            return prev.map((i) => (i.id === id ? { ...i, name: trimmed } : i));
        });
    }, []);

    const removeIndicator = useCallback((id: string) => {
        setIndicators((prev) => prev.filter((i) => i.id !== id));
        setEntryConditions((prev) => prev.filter((c) => !c.left.includes(id) && !c.right.includes(id)));
        setExitConditions((prev) => prev.filter((c) => !c.left.includes(id) && !c.right.includes(id)));
    }, []);

    const updateParamValue = useCallback((indId: string, paramName: string, value: any) => {
        setIndicators((prev) => prev.map((ind) =>
            ind.id === indId ? { ...ind, paramValues: { ...ind.paramValues, [paramName]: value } } : ind
        ));
    }, []);

    const toggleParamLock = useCallback((indId: string, paramName: string) => {
        setIndicators((prev) => prev.map((ind) =>
            ind.id === indId ? { ...ind, paramLocked: { ...ind.paramLocked, [paramName]: !ind.paramLocked[paramName] } } : ind
        ));
    }, []);

    /* ── Left options — Close, Tick Price, and indicator VALUES (not levels) ── */
    const priceOptions = useMemo(() => {
        const options: { value: string; label: string; group: string }[] = [
            { value: 'price:close', label: 'Close', group: 'Price' },
            { value: 'price:tick', label: 'Tick Price', group: 'Price' },
        ];
        // Add only indicator values (mark() outputs), not levels (line.new() outputs)
        for (const ind of indicators) {
            const valueOutputs = ind.parsed.outputs.filter((o) => (o.kind ?? 'value') === 'value');
            for (const out of valueOutputs) {
                options.push({
                    value: `ind:${ind.id}:${out.varName}`,
                    label: valueOutputs.length > 1 ? `${ind.name} — ${out.title}` : ind.name,
                    group: ind.name,
                });
            }
        }
        return options;
    }, [indicators]);

    /* ── Build operand options for condition dropdowns (Right side) ── */
    const operandOptions = useMemo(() => {
        const options: { value: string; label: string; group: string }[] = [];

        // Indicator outputs
        for (const ind of indicators) {
            const levelOutputs = ind.parsed.outputs.filter((o) => o.kind === 'level');
            const valueOutputs = ind.parsed.outputs.filter((o) => (o.kind ?? 'value') === 'value');
            const totalOutputs = ind.parsed.outputs.length;

            // Add "Any Level" if the indicator has multiple level outputs
            if (levelOutputs.length > 1) {
                options.push({
                    value: `anylevel:${ind.id}`,
                    label: `${ind.name} — Any Level`,
                    group: ind.name,
                });
            }

            // Add individual outputs (values and levels)
            for (const out of ind.parsed.outputs) {
                options.push({
                    value: `ind:${ind.id}:${out.varName}`,
                    label: totalOutputs > 1 ? `${ind.name} — ${out.title}` : ind.name,
                    group: ind.name,
                });
            }

            if (ind.parsed.outputs.length === 0) {
                options.push({
                    value: `ind:${ind.id}:value`,
                    label: ind.name,
                    group: ind.name,
                });
            }
            void valueOutputs;
        }

        // Reference levels from mark.level()
        for (const ind of indicators) {
            for (const lvl of ind.parsed.levels) {
                options.push({
                    value: `level:${ind.id}:${lvl.value}`,
                    label: `${ind.name} — ${lvl.title} (${lvl.value})`,
                    group: `${ind.name} Levels`,
                });
            }
        }

        return options;
    }, [indicators]);

    /* ── Pre-computed buy/sell signals from indicators ── */
    const availableSignals = useMemo(() => {
        const signals: { indId: string; indName: string; indShort: string; condition: ParsedCondition }[] = [];
        for (const ind of indicators) {
            for (const cond of ind.parsed.conditions) {
                signals.push({ indId: ind.id, indName: ind.name, indShort: ind.shortname, condition: cond });
            }
        }
        return signals;
    }, [indicators]);


    // Map auto-detected signal varName to a pattern helper label
    const signalToPattern: Record<string, string> = {
        'FR_buy': 'False Rejection (Buy)',
        'FR_sell': 'False Rejection (Sell)',
        'FB_buy': 'False Breakout (Buy)',
        'FB_sell': 'False Breakout (Sell)',
        'TW_buy': 'Two Wick Rejection (Buy)',
        'TW_sell': 'Two Wick Rejection (Sell)',
        'BF_buy': 'Breakout + Follow-through (Buy)',
        'BF_sell': 'Breakout + Follow-through (Sell)',
        'SR_buy': 'Single Rejection (Buy)',
        'SR_sell': 'Single Rejection (Sell)',
    };

    // Auto-populate conditions from indicator signals
    useEffect(() => {
        setNamedConditions((prev) => {
            const manualOnes = prev.filter((c) => c.source === 'manual');
            const autoOnes: NamedCondition[] = availableSignals
                .filter((sig) => sig.condition.type !== 'any' && !sig.condition.varName.toLowerCase().startsWith('any'))
                .map((sig) => {
                    const existing = prev.find((c) => c.source === 'auto' && c.signalVar === sig.condition.varName && c.signalIndId === sig.indId);
                    // Find the indicator that owns this signal
                    const ind = indicators.find((i) => i.id === sig.indId);
                    // Default right operand: "Any Level" if the indicator has multiple levels
                    // (matches the original MFL behavior of checking all levels at once)
                    const levelCount = ind?.parsed.outputs.filter((o) => o.kind === 'level').length ?? 0;
                    const firstLevel = ind?.parsed.outputs.find((o) => o.kind === 'level');
                    const defaultRight = levelCount > 1
                        ? `anylevel:${sig.indId}`
                        : firstLevel
                            ? `ind:${sig.indId}:${firstLevel.varName}`
                            : 'value:0';
                    // Map the signal var to a pattern helper label
                    const patternLabel = signalToPattern[sig.condition.varName] ||
                        (sig.condition.type === 'buy' ? 'False Rejection (Buy)' : 'False Rejection (Sell)');
                    return {
                        id: `auto-${sig.indId}-${sig.condition.varName}`,
                        action: sig.condition.type as 'buy' | 'sell',
                        left: 'price:close',
                        condition: patternLabel,
                        right: defaultRight,
                        rightValue: 0,
                        source: 'auto' as const,
                        signalVar: sig.condition.varName,
                        signalIndId: sig.indId,
                        enabled: existing?.enabled ?? true,
                    };
                });
            return [...autoOnes, ...manualOnes];
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableSignals, indicators]);

    // Add manual condition
    const addManualCondition = useCallback((action: 'buy' | 'sell') => {
        setNamedConditions((prev) => [...prev, {
            id: `manual-${Date.now()}`,
            action,
            left: 'price:close',
            condition: action === 'buy' ? 'False Rejection (Buy)' : 'False Rejection (Sell)',
            right: operandOptions.length > 4 ? operandOptions[4].value : 'value:0',
            rightValue: 0,
            source: 'manual' as const,
            enabled: true,
        }]);
    }, [operandOptions]);

    const updateNamedCondition = useCallback((id: string, field: string, value: any) => {
        setNamedConditions((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
    }, []);

    const removeNamedCondition = useCallback((id: string) => {
        setNamedConditions((prev) => prev.filter((c) => c.id !== id));
    }, []);

    // Chain helpers — add/update/remove AND links on a condition
    const addChainLink = useCallback((id: string, operatorLabel?: string) => {
        setNamedConditions((prev) => prev.map((c) => {
            if (c.id !== id) return c;
            const lastRight = c.chain && c.chain.length > 0 ? c.chain[c.chain.length - 1].right : c.right;
            const newLink: ChainLink = {
                joiner: 'continue',
                left: lastRight,
                condition: operatorLabel || c.condition,
                right: operandOptions[0]?.value || 'price:close',
                rightValue: 0,
            };
            return { ...c, chain: [...(c.chain || []), newLink] };
        }));
    }, [operandOptions]);

    const updateChainLink = useCallback((id: string, idx: number, field: keyof ChainLink, value: any) => {
        setNamedConditions((prev) => prev.map((c) => {
            if (c.id !== id || !c.chain) return c;
            const newChain = c.chain.map((link, i) => i === idx ? { ...link, [field]: value } : link);
            return { ...c, chain: newChain };
        }));
    }, []);

    const removeChainLink = useCallback((id: string, idx: number) => {
        setNamedConditions((prev) => prev.map((c) => {
            if (c.id !== id || !c.chain) return c;
            return { ...c, chain: c.chain.filter((_, i) => i !== idx) };
        }));
    }, []);

    const enabledBuyConditions = useMemo(() => namedConditions.filter((c) => c.enabled && c.action === 'buy'), [namedConditions]);
    const enabledSellConditions = useMemo(() => namedConditions.filter((c) => c.enabled && c.action === 'sell'), [namedConditions]);

    /* ── Condition helpers ── */
    const addEntryCondition = useCallback(() => {
        const firstInd = indicators[0];
        const defaultLeft = firstInd?.parsed.outputs[0]
            ? `ind:${firstInd.id}:${firstInd.parsed.outputs[0].varName}`
            : 'price:close';
        setEntryConditions((prev) => [...prev, {
            id: String(Date.now()),
            mode: 'manual',
            left: defaultLeft,
            condition: 'crosses above',
            right: 'value:0',
            rightValue: 0,
        }]);
    }, [indicators]);

    const addExitCondition = useCallback(() => {
        const firstInd = indicators[0];
        const defaultLeft = firstInd?.parsed.outputs[0]
            ? `ind:${firstInd.id}:${firstInd.parsed.outputs[0].varName}`
            : 'price:close';
        setExitConditions((prev) => [...prev, {
            id: String(Date.now()),
            mode: 'manual',
            left: defaultLeft,
            condition: 'crosses below',
            right: 'value:0',
            rightValue: 0,
        }]);
    }, [indicators]);

    /* ── Resolve operand to Kuri variable name for code gen ── */
    const resolveOperand = useCallback((op: string, rightValue?: number): string => {
        if (op.startsWith('price:')) {
            const priceType = op.split(':')[1];
            return priceType === 'tick' ? 'close' : priceType;  // tick resolves to close in Kuri
        }
        if (op.startsWith('value:')) return String(rightValue ?? op.split(':')[1]);
        if (op.startsWith('level:')) return op.split(':')[2];
        if (op.startsWith('ind:')) {
            const [, indId, varName] = op.split(':');
            const ind = indicators.find((i) => i.id === indId);
            if (!ind) return 'close';
            if (varName === 'value') {
                // Single-output indicator — use a sanitized name
                return ind.shortname.replace(/\s+/g, '').toLowerCase() + '_val';
            }
            return varName;
        }
        return op;
    }, [indicators]);

    /* ── Code Generation ── */
    const generatedCode = useMemo(() => {
        const lines: string[] = [];
        lines.push('---');
        lines.push('version: kuri 1.0');
        lines.push(`name: ${strategyName}`);
        lines.push('type: strategy');
        lines.push('---');
        lines.push('');

        // Indicator sections — include their full kuri source (minus YAML header)
        for (const ind of indicators) {
            lines.push(`// ── ${ind.name} ──`);
            const src = ind.kuriSource;
            // Strip YAML header
            const bodyMatch = src.match(/^---[\s\S]*?---\s*\n([\s\S]*)$/m);
            const body = bodyMatch ? bodyMatch[1] : src;
            // Replace param.* calls with actual values
            let processedBody = body;
            for (const p of ind.parsed.params) {
                // Replace "varName = param.type(...)" with "varName = value"
                const paramRegex = new RegExp(
                    `${p.varName}\\s*=\\s*param\\.\\w+\\([^)]+\\)`,
                    'g'
                );
                const val = ind.paramValues[p.varName] ?? p.defaultValue;
                const formattedVal = typeof val === 'string' ? `"${val}"` : String(val);
                if (ind.paramLocked[p.varName]) {
                    // Locked: inline the value
                    processedBody = processedBody.replace(paramRegex, `${p.varName} = ${formattedVal}`);
                } else {
                    // Unlocked: keep as param.* but with current value as default
                    // Just leave it as-is from the source
                }
            }
            // Remove mark() and mark.level() calls — we don't want indicator plots in strategy
            processedBody = processedBody.replace(/^mark(?:\.\w+)?\(.*\)\s*$/gm, '');
            processedBody = processedBody.replace(/^mark\.level\(.*\)\s*$/gm, '');
            // Remove alert calls
            processedBody = processedBody.replace(/^(?:kuri\.alert|alertcondition)\(.*\)\s*$/gm, '');
            // Remove plotshape calls
            processedBody = processedBody.replace(/^plotshape\(.*\)\s*$/gm, '');
            // Clean up blank lines
            processedBody = processedBody.replace(/\n{3,}/g, '\n\n').trim();
            lines.push(processedBody);
            lines.push('');
        }

        // Track which pattern helpers are used so we only emit them when needed
        const usedHelpers = new Set<string>();

        // Helper: resolve a single condition to a Kuri expression
        // Resolve a single segment (left, condition, right) into a Kuri expression string
        const resolveSegment = (segLeft: string, segCondition: string, segRight: string, segRightValue: number): string => {
            const condInfo = CONDITIONS.find((c) => c.label === segCondition);
            if (!condInfo) return '';
            const left = resolveOperand(segLeft);
            if ('helper' in condInfo && condInfo.helper) {
                usedHelpers.add(condInfo.helper);
                if (segRight.startsWith('anylevel:')) {
                    const indId = segRight.split(':')[1];
                    const ind = indicators.find((i) => i.id === indId);
                    if (ind) {
                        const levelOutputs = ind.parsed.outputs.filter((o) => o.kind === 'level');
                        if (levelOutputs.length > 0) {
                            return `(${levelOutputs.map((l) => `${condInfo.helper}(${l.varName})`).join(' or ')})`;
                        }
                    }
                    return '';
                }
                const right = segRight.startsWith('value:') ? String(segRightValue) : resolveOperand(segRight);
                return `${condInfo.helper}(${right})`;
            }
            if (segRight.startsWith('anylevel:')) return '';
            const right = segRight.startsWith('value:') ? String(segRightValue) : resolveOperand(segRight);
            if ('fn' in condInfo && condInfo.fn) return `${condInfo.fn}(${left}, ${right})`;
            if ('op' in condInfo && condInfo.op) return `${left} ${condInfo.op} ${right}`;
            return '';
        };

        const resolveCondition = (cond: NamedCondition): string => {
            // Auto pattern format (pattern:indId:varName) — direct variable reference
            if (cond.condition.startsWith('pattern:')) {
                const [, , varName] = cond.condition.split(':');
                return varName;
            }
            // Resolve base + chain links. Each link is a raw "<operator> <operand>" append.
            // e.g. base "close > sma20", link[>, sma50] → "close > sma20 > sma50"
            //      link[and, condition] → "close > sma20 and condition"
            const baseExpr = resolveSegment(cond.left, cond.condition, cond.right, cond.rightValue);
            if (!baseExpr) return '';
            if (!cond.chain || cond.chain.length === 0) return baseExpr;
            let expr = baseExpr;
            for (const link of cond.chain) {
                const condInfo = CONDITIONS.find((c) => c.label === link.condition);
                if (!condInfo || !('op' in condInfo) || !condInfo.op) continue;
                const rightStr = link.right.startsWith('value:')
                    ? String(link.rightValue)
                    : resolveOperand(link.right);
                if (rightStr) expr += ` ${condInfo.op} ${rightStr}`;
            }
            return `(${expr})`;
        };

        // Entry (BUY) conditions — use enabled buy conditions from namedConditions
        const buyParts = enabledBuyConditions.map(resolveCondition).filter(Boolean);
        // Exit (SELL) conditions — use enabled sell conditions
        const sellParts = enabledSellConditions.map(resolveCondition).filter(Boolean);

        // Emit helper functions if any pattern condition is used
        if (usedHelpers.size > 0) {
            const helperLines: string[] = [];
            const blocks = PATTERN_HELPERS.split(/\n\n/);
            for (const block of blocks) {
                const nameMatch = block.match(/^(f_\w+)\(/m);
                if (nameMatch && usedHelpers.has(nameMatch[1])) {
                    helperLines.push(block.trim());
                }
            }
            if (helperLines.length > 0) {
                lines.push('// Pattern detection helpers');
                lines.push(helperLines.join('\n\n'));
                lines.push('');
            }
        }

        if (buyParts.length > 0) {
            lines.push(`if ${buyParts.join(' or ')}`);
            lines.push(`    strategy.entry("Long", strategy.long)`);
            lines.push('');
        }

        if (sellParts.length > 0) {
            lines.push(`if ${sellParts.join(' or ')}`);
            lines.push(`    strategy.close("Long")`);
        }

        return lines.join('\n');
    }, [indicators, enabledBuyConditions, enabledSellConditions, strategyName, resolveOperand]);

    // Live sync
    useEffect(() => { onCodeChange(generatedCode); }, [generatedCode, onCodeChange]);

    /* ── Render param input ── */
    const renderParamInput = (ind: IndicatorConfig, param: ParsedParam) => {
        const val = ind.paramValues[param.varName];
        const locked = ind.paramLocked[param.varName];

        return (
            <div key={param.varName} className="flex items-center gap-2 py-1.5">
                {/* Lock toggle */}
                <button type="button" onClick={() => toggleParamLock(ind.id, param.varName)}
                    title={locked ? 'Locked (hardcoded)' : 'Unlocked (user-adjustable)'}
                    className={`w-6 h-6 flex items-center justify-center rounded flex-shrink-0 transition-colors ${locked ? 'bg-[#2962FF]/15 text-[#2962FF]' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}>
                    {locked ? (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                    ) : (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" /></svg>
                    )}
                </button>

                {/* Title */}
                <span className="text-xs text-gray-400 w-28 flex-shrink-0 truncate">{param.title || param.varName}</span>

                {/* Input */}
                <div className="flex-1">
                    {(param.type === 'int' || param.type === 'float') && (
                        <input type="number" value={val} title={param.title}
                            min={param.min} max={param.max}
                            step={param.type === 'float' ? 0.1 : 1}
                            onChange={(e) => updateParamValue(ind.id, param.varName, param.type === 'int' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#2962FF] outline-none text-center" />
                    )}
                    {param.type === 'source' && (
                        <select value={val} title={param.title}
                            onChange={(e) => updateParamValue(ind.id, param.varName, e.target.value)}
                            className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    )}
                    {param.type === 'string' && param.options && (
                        <select value={val} title={param.title}
                            onChange={(e) => updateParamValue(ind.id, param.varName, e.target.value)}
                            className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                            {param.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    )}
                    {param.type === 'string' && !param.options && (
                        <input type="text" value={val} title={param.title}
                            onChange={(e) => updateParamValue(ind.id, param.varName, e.target.value)}
                            className="w-full bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#2962FF] outline-none" />
                    )}
                    {param.type === 'bool' && (
                        <button type="button" title={param.title}
                            onClick={() => updateParamValue(ind.id, param.varName, !val)}
                            className={`w-8 h-4 rounded-full relative transition-colors ${val ? 'bg-[#2962FF]' : 'bg-gray-700'}`}>
                            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                    )}
                </div>

                {/* Default value hint */}
                <span className="text-[9px] text-gray-600 flex-shrink-0 w-16 text-right truncate">
                    def: {String(param.defaultValue)}
                </span>
            </div>
        );
    };

    /* ── Render inline chain links (operator + operand) for a manual named condition ── */
    const renderChainRows = (cond: NamedCondition): React.ReactNode => {
        if (cond.source !== 'manual' || !cond.chain || cond.chain.length === 0) return null;
        return (
            <>
                {cond.chain.map((link, idx) => (
                    <React.Fragment key={idx}>
                        <select value={link.condition} title="Operator"
                            onChange={(e) => updateChainLink(cond.id, idx, 'condition', e.target.value)}
                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-purple-300 focus:border-[#2962FF] outline-none appearance-none">
                            {CONDITIONS.filter((c) => !('helper' in c)).map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                        </select>
                        <select value={link.right?.startsWith('value:') ? '__custom__' : link.right} title="Operand"
                            onChange={(e) => {
                                if (e.target.value === '__custom__') updateChainLink(cond.id, idx, 'right', `value:${link.rightValue || 0}`);
                                else updateChainLink(cond.id, idx, 'right', e.target.value);
                            }}
                            className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                            {operandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            <option value="__custom__">Value</option>
                        </select>
                        {link.right?.startsWith('value:') && (
                            <input type="number" value={link.rightValue} title="Value"
                                onChange={(e) => { updateChainLink(cond.id, idx, 'rightValue', parseFloat(e.target.value) || 0); updateChainLink(cond.id, idx, 'right', `value:${e.target.value}`); }}
                                className="w-14 bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 text-center focus:border-[#2962FF] outline-none" />
                        )}
                        <button type="button" onClick={() => removeChainLink(cond.id, idx)} title="Remove link"
                            className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </React.Fragment>
                ))}
            </>
        );
    };

    /* ── Render condition row ── */
    const renderConditionRow = (
        cond: ConditionConfig,
        onUpdate: (id: string, field: string, value: any) => void,
        onRemove: (id: string) => void,
    ) => {
        // Signal mode — pre-computed boolean condition from indicator
        if (cond.mode === 'signal') {
            return (
                <div key={cond.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2">
                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded flex-shrink-0">SIGNAL</span>
                    <span className="text-xs text-gray-200 flex-1">{cond.signalTitle}</span>
                    <span className="text-[9px] text-gray-500 font-mono">{cond.signalVar}</span>
                    <button type="button" onClick={() => onRemove(cond.id)} title="Remove"
                        className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            );
        }

        // Manual mode — left/condition/right
        return (
        <div key={cond.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 flex items-center gap-2">
            {/* Left operand */}
            <select value={cond.left} title="Left operand"
                onChange={(e) => onUpdate(cond.id, 'left', e.target.value)}
                className="flex-1 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                {(() => {
                    let lastGroup = '';
                    return operandOptions.map((opt) => {
                        const items = [];
                        if (opt.group !== lastGroup) {
                            lastGroup = opt.group;
                            items.push(<optgroup key={`g-${opt.group}`} label={opt.group} />);
                        }
                        items.push(<option key={opt.value} value={opt.value}>{opt.label}</option>);
                        return items;
                    }).flat();
                })()}
            </select>

            {/* Condition */}
            <select value={cond.condition} title="Condition"
                onChange={(e) => onUpdate(cond.id, 'condition', e.target.value)}
                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-purple-300 focus:border-[#2962FF] outline-none appearance-none" style={{ minWidth: 110 }}>
                {CONDITIONS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>

            {/* Right operand */}
            {cond.right.startsWith('value:') ? (
                <input type="number" value={cond.rightValue} title="Value"
                    onChange={(e) => {
                        onUpdate(cond.id, 'rightValue', parseFloat(e.target.value) || 0);
                        onUpdate(cond.id, 'right', `value:${e.target.value}`);
                    }}
                    className="w-16 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 text-center focus:border-[#2962FF] outline-none" />
            ) : (
                <select value={cond.right} title="Right operand"
                    onChange={(e) => onUpdate(cond.id, 'right', e.target.value)}
                    className="flex-1 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                    {operandOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                    <option value="value:0">Custom value...</option>
                </select>
            )}

            {/* Toggle value/indicator */}
            <button type="button" title={cond.right.startsWith('value:') ? 'Switch to indicator' : 'Switch to value'}
                onClick={() => onUpdate(cond.id, 'right', cond.right.startsWith('value:') ? (operandOptions[0]?.value || 'price:close') : `value:${cond.rightValue}`)}
                className="text-[9px] text-gray-500 hover:text-white px-1.5 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0">
                {cond.right.startsWith('value:') ? 'Ind' : '#'}
            </button>

            {/* Remove */}
            <button type="button" onClick={() => onRemove(cond.id)} title="Remove"
                className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-[#09090b]">
            {/* ═══ Steps ═══ */}
            <div className="flex items-center justify-center gap-0 py-3 px-6 border-b border-white/5 bg-[#0a0a0f] flex-shrink-0">
                {[
                    { num: 1, label: 'Indicators' },
                    { num: 2, label: 'Conditions' },
                    { num: 3, label: 'Entry & Exit Rules' },
                    { num: 4, label: 'Risk Management' },
                    { num: 5, label: 'Review Code' },
                ].map((s, i) => (
                    <React.Fragment key={s.num}>
                        {i > 0 && <div className="w-10 h-px bg-white/10 mx-2" />}
                        <button type="button" onClick={() => setStep(s.num)} className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                step === s.num ? 'bg-[#2962FF] text-white' : step > s.num ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-600'
                            }`}>{step > s.num ? '\u2713' : s.num}</div>
                            <span className={`text-xs font-medium ${step === s.num ? 'text-white' : step > s.num ? 'text-emerald-400' : 'text-gray-600'}`}>{s.label}</span>
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* ═══ Content ═══ */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-2xl mx-auto">

                    {/* ── STEP 1: Indicators ── */}
                    {step === 1 && (
                        <div>
                            <h2 className="text-sm font-semibold text-white mb-1">Select Indicators</h2>
                            <p className="text-xs text-gray-500 mb-4">Add indicators and configure their parameters. Lock a parameter to hardcode it, unlock to let users adjust it.</p>

                            {indicators.length > 0 && (
                                <div className="space-y-3 mb-4">
                                    {indicators.map((ind) => (
                                        <div key={ind.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
                                            {/* Header */}
                                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-[#60a5fa] bg-[#60a5fa]/10 px-2 py-0.5 rounded">{ind.shortname}</span>
                                                    <input
                                                        type="text"
                                                        defaultValue={ind.name}
                                                        title="Rename indicator"
                                                        onBlur={(e) => { if (e.target.value !== ind.name) renameIndicator(ind.id, e.target.value); }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                        className="text-xs font-medium text-white bg-transparent border border-transparent hover:border-white/10 focus:border-[#2962FF] rounded px-1.5 py-0.5 outline-none w-40"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {ind.parsed.outputs.length > 0 && (
                                                        <span className="text-[9px] text-gray-500">
                                                            {ind.parsed.outputs.length} output{ind.parsed.outputs.length > 1 ? 's' : ''}
                                                            {ind.parsed.levels.length > 0 && ` · ${ind.parsed.levels.length} level${ind.parsed.levels.length > 1 ? 's' : ''}`}
                                                        </span>
                                                    )}
                                                    <button type="button" onClick={() => removeIndicator(ind.id)} title="Remove"
                                                        className="text-gray-600 hover:text-red-400 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Params — only core calculation params, not visual/drawing ones */}
                                            {ind.parsed.params.filter((p) => !p.isVisual).length > 0 && (
                                                <div className="px-4 py-2">
                                                    {ind.parsed.params
                                                        .filter((p) => !p.isVisual)
                                                        .map((p) => renderParamInput(ind, p))}
                                                </div>
                                            )}

                                            {/* Outputs preview */}
                                            {ind.parsed.outputs.length > 0 && (
                                                <div className="px-4 py-2 border-t border-white/[0.03] bg-white/[0.01]">
                                                    <span className="text-[9px] text-gray-600 uppercase tracking-wide">Outputs: </span>
                                                    {ind.parsed.outputs.map((o, i) => (
                                                        <span key={o.varName} className="text-[10px] text-[#60a5fa]">
                                                            {o.title}{i < ind.parsed.outputs.length - 1 ? ', ' : ''}
                                                        </span>
                                                    ))}
                                                    {ind.parsed.levels.length > 0 && (
                                                        <>
                                                            <span className="text-[9px] text-gray-600 ml-2">Levels: </span>
                                                            {ind.parsed.levels.map((l, i) => (
                                                                <span key={l.value} className="text-[10px] text-purple-400">
                                                                    {l.value} ({l.title}){i < ind.parsed.levels.length - 1 ? ', ' : ''}
                                                                </span>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {indicators.length === 0 && (
                                <div className="text-center py-10 border border-dashed border-white/[0.08] rounded-lg mb-4">
                                    <div className="text-3xl mb-2 opacity-20">&#128200;</div>
                                    <p className="text-sm text-gray-500">No indicators added yet</p>
                                    <p className="text-xs text-gray-600 mt-1">Click below to add from the indicator registry</p>
                                </div>
                            )}

                            <button type="button" onClick={() => setShowPicker(true)}
                                className="w-full py-2.5 border border-dashed border-[#2962FF]/30 rounded-lg text-xs text-[#2962FF] hover:bg-[#2962FF]/5 transition-colors flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Add from Indicator Registry
                            </button>
                        </div>
                    )}

                    {/* ── STEP 2: Conditions ── */}
                    {step === 2 && (
                        <div>
                            <h2 className="text-sm font-semibold text-white mb-1">Conditions</h2>
                            <p className="text-xs text-gray-500 mb-4">Use the indicator's pre-built conditions or create your own.</p>

                            {/* Toggle: Use Indicator Conditions vs Create */}
                            {indicators.length > 0 && (
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 mb-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-medium text-white">
                                            {useIndicatorConditions ? 'Using Indicator Conditions' : 'Create Your Own'}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                            {useIndicatorConditions
                                                ? 'Pre-computed conditions from the indicator (read-only).'
                                                : 'Build your own conditions from scratch.'}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setUseIndicatorConditions(!useIndicatorConditions)}
                                        title="Toggle"
                                        className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${useIndicatorConditions ? 'bg-[#2962FF]' : 'bg-gray-700'}`}
                                    >
                                        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${useIndicatorConditions ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                            )}

                            {indicators.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 text-sm italic">Add indicators in Step 1 first.</div>
                            ) : useIndicatorConditions && availableSignals.length === 0 ? (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 text-center">
                                    <div className="text-2xl mb-2 opacity-50">&#9888;</div>
                                    <p className="text-sm text-yellow-400 font-medium">No pre-built conditions available</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        The selected indicators don't have pre-computed buy/sell conditions.
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Switch the toggle OFF to build your own conditions.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {/* ── BUY Conditions ── */}
                                    <div>
                                        <h3 className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-sm bg-emerald-500" /> Buy Conditions
                                        </h3>
                                        <div className="space-y-1.5">
                                            {namedConditions.filter((c) => c.action === 'buy').map((cond, idx) => (
                                                <React.Fragment key={cond.id}>
                                                {idx > 0 && (
                                                    <div className="flex items-center gap-2 pl-2">
                                                        <div className="flex-1 h-px bg-emerald-500/20" />
                                                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded">OR</span>
                                                        <div className="flex-1 h-px bg-emerald-500/20" />
                                                    </div>
                                                )}
                                                <div className={`px-3 py-2 rounded-lg border transition-all ${
                                                    cond.enabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.01] border-white/[0.04] opacity-40'
                                                }`}>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                    {/* Toggle */}
                                                    <button type="button" title={cond.enabled ? 'Disable' : 'Enable'}
                                                        onClick={() => updateNamedCondition(cond.id, 'enabled', !cond.enabled)}
                                                        className={`w-7 h-4 rounded-full relative transition-colors flex-shrink-0 ${cond.enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${cond.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                                    </button>

                                                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded flex-shrink-0">BUY</span>
                                                    <span className="text-[10px] text-gray-400">=</span>

                                                    {cond.source === 'auto' ? (
                                                        /* Read-only label for pre-computed indicator conditions */
                                                        <>
                                                            <span className="text-xs text-gray-200 flex-1">
                                                                {availableSignals.find((s) => s.condition.varName === cond.signalVar && s.indId === cond.signalIndId)?.condition.title || cond.signalVar}
                                                            </span>
                                                            <span className="text-[9px] text-gray-600 font-mono mr-1">{cond.signalVar}</span>
                                                            <span className="text-[9px] text-emerald-400/60 italic">pre-built</span>
                                                        </>
                                                    ) : (
                                                        /* Editable condition for manual conditions */
                                                        <>
                                                            <select value={cond.left} title="Price" onChange={(e) => updateNamedCondition(cond.id, 'left', e.target.value)}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                                                {priceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                            </select>
                                                            <span className="text-[10px] text-purple-400">—</span>
                                                            <select value={cond.condition} title="Condition" onChange={(e) => updateNamedCondition(cond.id, 'condition', e.target.value)}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-purple-300 focus:border-[#2962FF] outline-none appearance-none">
                                                                <optgroup label="Operators">
                                                                    {CONDITIONS.filter((c) => !('helper' in c)).map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                                                                </optgroup>
                                                                <optgroup label="Patterns">
                                                                    {CONDITIONS.filter((c) => 'helper' in c).map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                                                                </optgroup>
                                                            </select>
                                                            <span className="text-[10px] text-purple-400">—</span>
                                                            <select value={cond.right?.startsWith('value:') ? '__custom__' : cond.right} title="Level/Value"
                                                                onChange={(e) => {
                                                                    if (e.target.value === '__custom__') updateNamedCondition(cond.id, 'right', `value:${cond.rightValue || 0}`);
                                                                    else updateNamedCondition(cond.id, 'right', e.target.value);
                                                                }}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                                                {operandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                                <option value="__custom__">Value</option>
                                                            </select>
                                                            {cond.right?.startsWith('value:') && (
                                                                <input type="number" value={cond.rightValue} title="Value"
                                                                    onChange={(e) => { updateNamedCondition(cond.id, 'rightValue', parseFloat(e.target.value) || 0); updateNamedCondition(cond.id, 'right', `value:${e.target.value}`); }}
                                                                    className="w-16 bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 text-center focus:border-[#2962FF] outline-none" />
                                                            )}
                                                        </>
                                                    )}

                                                    {cond.source === 'manual' && (
                                                        <>
                                                        {renderChainRows(cond)}
                                                        <select value="" title="Add operator"
                                                            onChange={(e) => { if (e.target.value) { addChainLink(cond.id, e.target.value); e.target.value = ''; } }}
                                                            className="w-7 text-center rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-bold border border-emerald-500/20 outline-none appearance-none cursor-pointer flex-shrink-0">
                                                            <option value="">+</option>
                                                            {CONDITIONS.filter((c) => 'op' in c).map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                                                        </select>
                                                        <button type="button" onClick={() => removeNamedCondition(cond.id)} title="Remove"
                                                            className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                        </>
                                                    )}
                                                    </div>
                                                </div>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                        {!useIndicatorConditions && (
                                            <button type="button" onClick={() => addManualCondition('buy')}
                                                className="w-full mt-2 py-1.5 border border-dashed border-emerald-500/30 rounded-lg text-[11px] text-emerald-400 hover:bg-emerald-500/5 transition-colors">
                                                + Add Buy Condition
                                            </button>
                                        )}
                                    </div>

                                    {/* ── SELL Conditions ── */}
                                    <div>
                                        <h3 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-sm bg-red-500" /> Sell Conditions
                                        </h3>
                                        <div className="space-y-1.5">
                                            {namedConditions.filter((c) => c.action === 'sell').map((cond, idx) => (
                                                <React.Fragment key={cond.id}>
                                                {idx > 0 && (
                                                    <div className="flex items-center gap-2 pl-2">
                                                        <div className="flex-1 h-px bg-red-500/20" />
                                                        <span className="text-[9px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded">OR</span>
                                                        <div className="flex-1 h-px bg-red-500/20" />
                                                    </div>
                                                )}
                                                <div className={`px-3 py-2 rounded-lg border transition-all ${
                                                    cond.enabled ? 'bg-red-500/5 border-red-500/20' : 'bg-white/[0.01] border-white/[0.04] opacity-40'
                                                }`}>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                    <button type="button" title={cond.enabled ? 'Disable' : 'Enable'}
                                                        onClick={() => updateNamedCondition(cond.id, 'enabled', !cond.enabled)}
                                                        className={`w-7 h-4 rounded-full relative transition-colors flex-shrink-0 ${cond.enabled ? 'bg-red-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${cond.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                                    </button>

                                                    <span className="text-[9px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded flex-shrink-0">SELL</span>
                                                    <span className="text-[10px] text-gray-400">=</span>

                                                    {cond.source === 'auto' ? (
                                                        /* Read-only label for pre-computed indicator conditions */
                                                        <>
                                                            <span className="text-xs text-gray-200 flex-1">
                                                                {availableSignals.find((s) => s.condition.varName === cond.signalVar && s.indId === cond.signalIndId)?.condition.title || cond.signalVar}
                                                            </span>
                                                            <span className="text-[9px] text-gray-600 font-mono mr-1">{cond.signalVar}</span>
                                                            <span className="text-[9px] text-red-400/60 italic">pre-built</span>
                                                        </>
                                                    ) : (
                                                        /* Editable condition for manual conditions */
                                                        <>
                                                            <select value={cond.left} title="Price" onChange={(e) => updateNamedCondition(cond.id, 'left', e.target.value)}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                                                {priceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                            </select>
                                                            <span className="text-[10px] text-purple-400">—</span>
                                                            <select value={cond.condition} title="Condition" onChange={(e) => updateNamedCondition(cond.id, 'condition', e.target.value)}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-purple-300 focus:border-[#2962FF] outline-none appearance-none">
                                                                <optgroup label="Operators">
                                                                    {CONDITIONS.filter((c) => !('helper' in c)).map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                                                                </optgroup>
                                                                <optgroup label="Patterns">
                                                                    {CONDITIONS.filter((c) => 'helper' in c).map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                                                                </optgroup>
                                                            </select>
                                                            <span className="text-[10px] text-purple-400">—</span>
                                                            <select value={cond.right?.startsWith('value:') ? '__custom__' : cond.right} title="Level/Value"
                                                                onChange={(e) => {
                                                                    if (e.target.value === '__custom__') updateNamedCondition(cond.id, 'right', `value:${cond.rightValue || 0}`);
                                                                    else updateNamedCondition(cond.id, 'right', e.target.value);
                                                                }}
                                                                className="bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-[#2962FF] outline-none appearance-none">
                                                                {operandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                                <option value="__custom__">Value</option>
                                                            </select>
                                                            {cond.right?.startsWith('value:') && (
                                                                <input type="number" value={cond.rightValue} title="Value"
                                                                    onChange={(e) => { updateNamedCondition(cond.id, 'rightValue', parseFloat(e.target.value) || 0); updateNamedCondition(cond.id, 'right', `value:${e.target.value}`); }}
                                                                    className="w-16 bg-[#1e222d] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-gray-200 text-center focus:border-[#2962FF] outline-none" />
                                                            )}
                                                        </>
                                                    )}

                                                    {cond.source === 'manual' && (
                                                        <>
                                                        {renderChainRows(cond)}
                                                        <select value="" title="Add operator"
                                                            onChange={(e) => { if (e.target.value) { addChainLink(cond.id, e.target.value); e.target.value = ''; } }}
                                                            className="w-7 text-center rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-bold border border-red-500/20 outline-none appearance-none cursor-pointer flex-shrink-0">
                                                            <option value="">+</option>
                                                            {CONDITIONS.filter((c) => 'op' in c).map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                                                        </select>
                                                        <button type="button" onClick={() => removeNamedCondition(cond.id)} title="Remove"
                                                            className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                        </>
                                                    )}
                                                    </div>
                                                </div>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                        {!useIndicatorConditions && (
                                            <button type="button" onClick={() => addManualCondition('sell')}
                                                className="w-full mt-2 py-1.5 border border-dashed border-red-500/30 rounded-lg text-[11px] text-red-400 hover:bg-red-500/5 transition-colors">
                                                + Add Sell Condition
                                            </button>
                                        )}
                                    </div>

                                    {/* Summary */}
                                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg px-4 py-2.5 flex items-center gap-4 text-[10px]">
                                        <span className="text-gray-500">{namedConditions.filter((c) => c.enabled).length} active</span>
                                        <span className="text-emerald-400">{enabledBuyConditions.length} buy</span>
                                        <span className="text-red-400">{enabledSellConditions.length} sell</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 3: Entry & Exit Rules ── */}
                    {step === 3 && (
                        <div>
                            <h2 className="text-sm font-semibold text-white mb-1">Entry & Exit Rules</h2>
                            <p className="text-xs text-gray-500 mb-4">Build conditions using the indicator outputs. Entry: ALL must be true. Exit: ANY triggers close.</p>

                            {indicators.length === 0 && (
                                <div className="text-center py-8 text-gray-500 text-sm italic">
                                    Add indicators in Step 1 first to build conditions.
                                </div>
                            )}

                            {indicators.length > 0 && (
                                <>
                                    {/* Direction */}
                                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 mb-4">
                                        <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-2">Direction</label>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setEntryDirection('long')}
                                                className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors ${entryDirection === 'long' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.03] text-gray-500 border border-white/[0.06]'}`}>
                                                Long (Buy)
                                            </button>
                                            <button type="button" onClick={() => setEntryDirection('short')}
                                                className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors ${entryDirection === 'short' ? 'bg-red-600/20 text-red-400 border border-red-500/30' : 'bg-white/[0.03] text-gray-500 border border-white/[0.06]'}`}>
                                                Short (Sell)
                                            </button>
                                        </div>
                                    </div>

                                    {/* Entry Conditions */}
                                    <div className="mb-6">
                                        <h3 className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-sm bg-emerald-500" /> Entry Conditions (AND)
                                        </h3>
                                        <div className="space-y-2">
                                            {entryConditions.map((cond, i) => (
                                                <React.Fragment key={cond.id}>
                                                    {i > 0 && (
                                                        <div className="flex justify-center py-0.5">
                                                            <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 px-3 py-0.5 rounded-full">AND</span>
                                                        </div>
                                                    )}
                                                    {renderConditionRow(cond,
                                                        (id, f, v) => setEntryConditions((prev) => prev.map((c) => c.id === id ? { ...c, [f]: v } : c)),
                                                        (id) => setEntryConditions((prev) => prev.filter((c) => c.id !== id))
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                        <button type="button" onClick={addEntryCondition}
                                            className="w-full mt-2 py-2 border border-dashed border-emerald-500/30 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/5 transition-colors">
                                            + Add Manual Condition
                                        </button>

                                    </div>

                                    {/* Exit Conditions */}
                                    <div>
                                        <h3 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-sm bg-red-500" /> Exit Conditions (OR)
                                        </h3>
                                        <div className="space-y-2">
                                            {exitConditions.map((cond, i) => (
                                                <React.Fragment key={cond.id}>
                                                    {i > 0 && (
                                                        <div className="flex justify-center py-0.5">
                                                            <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-3 py-0.5 rounded-full">OR</span>
                                                        </div>
                                                    )}
                                                    {renderConditionRow(cond,
                                                        (id, f, v) => setExitConditions((prev) => prev.map((c) => c.id === id ? { ...c, [f]: v } : c)),
                                                        (id) => setExitConditions((prev) => prev.filter((c) => c.id !== id))
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                        <button type="button" onClick={addExitCondition}
                                            className="w-full mt-2 py-2 border border-dashed border-red-500/30 rounded-lg text-xs text-red-400 hover:bg-red-500/5 transition-colors">
                                            + Add Manual Condition
                                        </button>

                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── STEP 4: Risk Management ── */}
                    {step === 4 && (
                        <div>
                            <h2 className="text-sm font-semibold text-white mb-1">Risk Management</h2>
                            <p className="text-xs text-gray-500 mb-4">Set stop loss and take profit levels.</p>

                            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-gray-400">Stop Loss</label>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => setUseStopLoss(!useStopLoss)} title="Toggle stop loss"
                                            className={`w-8 h-4 rounded-full relative transition-colors ${useStopLoss ? 'bg-[#2962FF]' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${useStopLoss ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                        </button>
                                        {useStopLoss && (
                                            <div className="flex items-center gap-1">
                                                <input type="number" value={slPercent} min={0.1} step={0.5} title="SL %"
                                                    onChange={(e) => setSlPercent(parseFloat(e.target.value) || 0)}
                                                    className="w-16 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 text-center focus:border-[#2962FF] outline-none" />
                                                <span className="text-[10px] text-gray-500">%</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-gray-400">Take Profit</label>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => setUseTakeProfit(!useTakeProfit)} title="Toggle take profit"
                                            className={`w-8 h-4 rounded-full relative transition-colors ${useTakeProfit ? 'bg-[#2962FF]' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${useTakeProfit ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                        </button>
                                        {useTakeProfit && (
                                            <div className="flex items-center gap-1">
                                                <input type="number" value={tpPercent} min={0.1} step={0.5} title="TP %"
                                                    onChange={(e) => setTpPercent(parseFloat(e.target.value) || 0)}
                                                    className="w-16 bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200 text-center focus:border-[#2962FF] outline-none" />
                                                <span className="text-[10px] text-gray-500">%</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── STEP 5: Review Code ── */}
                    {step === 5 && (
                        <div>
                            <h2 className="text-sm font-semibold text-white mb-1">Review Generated Code</h2>
                            <p className="text-xs text-gray-500 mb-4">This Kuri strategy code was generated from your selections.</p>

                            <div className="bg-[#0a0a0f] border border-white/[0.06] rounded-lg p-4 mb-4">
                                <pre className="text-xs leading-relaxed text-gray-300 whitespace-pre-wrap font-mono">{generatedCode}</pre>
                            </div>

                            <div className="grid grid-cols-4 gap-3 mb-4">
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold text-[#60a5fa]">{indicators.length}</div>
                                    <div className="text-[9px] text-gray-500 uppercase">Indicators</div>
                                </div>
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold text-emerald-400">{entryConditions.length}</div>
                                    <div className="text-[9px] text-gray-500 uppercase">Entry Rules</div>
                                </div>
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold text-red-400">{exitConditions.length}</div>
                                    <div className="text-[9px] text-gray-500 uppercase">Exit Rules</div>
                                </div>
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold text-orange-400">{(useStopLoss ? 1 : 0) + (useTakeProfit ? 1 : 0)}</div>
                                    <div className="text-[9px] text-gray-500 uppercase">Risk Rules</div>
                                </div>
                            </div>

                            <button type="button" onClick={() => onCodeChange(generatedCode)}
                                className="w-full py-2.5 bg-[#2962FF] hover:bg-[#1e54e8] text-white rounded-lg text-sm font-semibold transition-colors">
                                Apply to Editor
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ Navigation ═══ */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 bg-[#0a0a0f] flex-shrink-0">
                <button type="button" onClick={() => setStep((s) => Math.max(s - 1, 1))} disabled={step === 1}
                    className="px-4 py-1.5 text-xs text-gray-400 hover:text-white rounded-md hover:bg-white/5 transition-colors disabled:opacity-30">
                    &larr; Back
                </button>
                <span className="text-[10px] text-gray-600">Step {step} of 5</span>
                {step < 5 ? (
                    <button type="button" onClick={() => setStep((s) => Math.min(s + 1, 5))}
                        className="px-4 py-1.5 text-xs text-white bg-[#2962FF] hover:bg-[#1e54e8] rounded-md transition-colors font-medium">
                        Next &rarr;
                    </button>
                ) : (
                    <button type="button" onClick={() => onCodeChange(generatedCode)}
                        className="px-4 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors font-medium">
                        Apply to Editor
                    </button>
                )}
            </div>

            {/* ═══ Indicator Picker ═══ */}
            <IndicatorPickerModal
                isOpen={showPicker}
                onClose={() => setShowPicker(false)}
                onAdd={(type) => handlePickerAdd(type as string)}
                customScripts={customScripts}
                onAddCustom={handlePickerAddCustom}
            />
        </div>
    );
};
