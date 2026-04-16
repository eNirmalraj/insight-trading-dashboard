/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Kuri Script — Monaco Language Integration (TypeScript)      ║
 * ║  For Antigravity: @monaco-editor/react v4.7.0               ║
 * ║  Replaces the stub at StrategyStudio.tsx:25                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 *  USAGE in StrategyStudio.tsx:
 *
 *    import { registerKuriLanguage, setKuriDiagnostics } from '@/src/lib/kuri/kuri-monaco';
 *
 *    // In Monaco onMount callback:
 *    function handleEditorDidMount(editor: any, monaco: any) {
 *      registerKuriLanguage(monaco);
 *      editorRef.current = editor;
 *    }
 *
 *    // For diagnostics (replaces ScriptEngine.provideDiagnostics stub):
 *    setKuriDiagnostics(monaco, editorRef.current, errors);
 */

import type { KuriError } from './types';

// ═══════════════════════════════════════════════════════
// ALL 395 KURI FUNCTIONS — for autocomplete + hover docs
// ═══════════════════════════════════════════════════════
interface FnDoc {
    label: string;
    detail: string;
    documentation: string;
    insertText: string;
}

const KURI_FUNCTIONS: FnDoc[] = [
    // ── ta.* (59) ──
    {
        label: 'ta.sma',
        detail: '(source, length) → series float',
        documentation: 'Simple Moving Average',
        insertText: 'ta.sma(${1:close}, ${2:20})',
    },
    {
        label: 'ta.ema',
        detail: '(source, length) → series float',
        documentation: 'Exponential Moving Average',
        insertText: 'ta.ema(${1:close}, ${2:20})',
    },
    {
        label: 'ta.wma',
        detail: '(source, length) → series float',
        documentation: 'Weighted Moving Average',
        insertText: 'ta.wma(${1:close}, ${2:20})',
    },
    {
        label: 'ta.rma',
        detail: '(source, length) → series float',
        documentation: "Wilder's Moving Average (RSI/ATR smoothing)",
        insertText: 'ta.rma(${1:source}, ${2:14})',
    },
    {
        label: 'ta.vwma',
        detail: '(source, volume, length) → series float',
        documentation: 'Volume Weighted Moving Average',
        insertText: 'ta.vwma(${1:close}, ${2:volume}, ${3:20})',
    },
    {
        label: 'ta.hma',
        detail: '(source, length) → series float',
        documentation: 'Hull Moving Average',
        insertText: 'ta.hma(${1:close}, ${2:9})',
    },
    {
        label: 'ta.dema',
        detail: '(source, length) → series float',
        documentation: 'Double Exponential Moving Average',
        insertText: 'ta.dema(${1:close}, ${2:14})',
    },
    {
        label: 'ta.tema',
        detail: '(source, length) → series float',
        documentation: 'Triple Exponential Moving Average',
        insertText: 'ta.tema(${1:close}, ${2:14})',
    },
    {
        label: 'ta.alma',
        detail: '(source, length, offset?, sigma?) → series float',
        documentation: 'Arnaud Legoux Moving Average',
        insertText: 'ta.alma(${1:close}, ${2:9}, ${3:0.85}, ${4:6})',
    },
    {
        label: 'ta.swma',
        detail: '(source) → series float',
        documentation: 'Symmetrically Weighted Moving Average',
        insertText: 'ta.swma(${1:close})',
    },
    {
        label: 'ta.rsi',
        detail: '(source, length) → series float',
        documentation: 'Relative Strength Index (0-100)',
        insertText: 'ta.rsi(${1:close}, ${2:14})',
    },
    {
        label: 'ta.macd',
        detail: '(source, fast, slow, signal) → [macd, signal, histogram]',
        documentation: 'MACD — returns tuple of three series',
        insertText:
            '[macdLine, signalLine, histLine] = ta.macd(${1:close}, ${2:12}, ${3:26}, ${4:9})',
    },
    {
        label: 'ta.stoch',
        detail: '(close, high, low, length) → series float',
        documentation: 'Stochastic %K',
        insertText: 'ta.stoch(${1:close}, ${2:high}, ${3:low}, ${4:14})',
    },
    {
        label: 'ta.cci',
        detail: '(source, length) → series float',
        documentation: 'Commodity Channel Index',
        insertText: 'ta.cci(${1:close}, ${2:20})',
    },
    {
        label: 'ta.mfi',
        detail: '(source, length) → series float',
        documentation: 'Money Flow Index (0-100)',
        insertText: 'ta.mfi(${1:hlc3}, ${2:14})',
    },
    {
        label: 'ta.mom',
        detail: '(source, length) → series float',
        documentation: 'Momentum (price change over N bars)',
        insertText: 'ta.mom(${1:close}, ${2:10})',
    },
    {
        label: 'ta.roc',
        detail: '(source, length) → series float',
        documentation: 'Rate of Change (%)',
        insertText: 'ta.roc(${1:close}, ${2:10})',
    },
    {
        label: 'ta.cmo',
        detail: '(source, length) → series float',
        documentation: 'Chande Momentum Oscillator',
        insertText: 'ta.cmo(${1:close}, ${2:14})',
    },
    {
        label: 'ta.cog',
        detail: '(source, length) → series float',
        documentation: 'Center of Gravity',
        insertText: 'ta.cog(${1:close}, ${2:10})',
    },
    {
        label: 'ta.atr',
        detail: '(high, low, close, length) → series float',
        documentation: 'Average True Range',
        insertText: 'ta.atr(${1:high}, ${2:low}, ${3:close}, ${4:14})',
    },
    {
        label: 'ta.tr',
        detail: '(high, low, close) → series float',
        documentation: 'True Range (single bar)',
        insertText: 'ta.tr(${1:high}, ${2:low}, ${3:close})',
    },
    {
        label: 'ta.bb',
        detail: '(source, length, mult) → [basis, upper, lower]',
        documentation: 'Bollinger Bands — returns tuple',
        insertText: '[middle, upper, lower] = ta.bb(${1:close}, ${2:20}, ${3:2})',
    },
    {
        label: 'ta.bbw',
        detail: '(source, length, mult) → series float',
        documentation: 'Bollinger Bands Width',
        insertText: 'ta.bbw(${1:close}, ${2:20}, ${3:2})',
    },
    {
        label: 'ta.kc',
        detail: '(source, length, mult, atrLen) → [basis, upper, lower]',
        documentation: 'Keltner Channels',
        insertText: 'ta.kc(${1:close}, ${2:20}, ${3:1.5}, ${4:10})',
    },
    {
        label: 'ta.supertrend',
        detail: '(factor, atrPeriod) → [supertrend, direction]',
        documentation: 'Supertrend indicator',
        insertText: '[supertrend, direction] = ta.supertrend(${1:3.0}, ${2:10})',
    },
    {
        label: 'ta.adx',
        detail: '(diLen, adxLen) → series float',
        documentation: 'Average Directional Index',
        insertText: 'ta.adx(${1:14}, ${2:14})',
    },
    {
        label: 'ta.aroon',
        detail: '(source, length) → [up, down]',
        documentation: 'Aroon indicator',
        insertText: '[aroonUp, aroonDn] = ta.aroon(${1:close}, ${2:14})',
    },
    {
        label: 'ta.psar',
        detail: '(start?, inc?, max?) → series float',
        documentation: 'Parabolic SAR',
        insertText: 'ta.psar(${1:0.02}, ${2:0.02}, ${3:0.2})',
    },
    {
        label: 'ta.stdev',
        detail: '(source, length) → series float',
        documentation: 'Standard Deviation',
        insertText: 'ta.stdev(${1:close}, ${2:20})',
    },
    {
        label: 'ta.variance',
        detail: '(source, length) → series float',
        documentation: 'Variance',
        insertText: 'ta.variance(${1:close}, ${2:20})',
    },
    {
        label: 'ta.vwap',
        detail: '(high, low, close, volume) → series float',
        documentation: 'Volume Weighted Average Price',
        insertText: 'ta.vwap(${1:high}, ${2:low}, ${3:close}, ${4:volume})',
    },
    {
        label: 'ta.obv',
        detail: '(close, volume) → series float',
        documentation: 'On Balance Volume',
        insertText: 'ta.obv(${1:close}, ${2:volume})',
    },
    {
        label: 'ta.change',
        detail: '(source, length?) → series float',
        documentation: 'Change in value over N bars',
        insertText: 'ta.change(${1:close})',
    },
    {
        label: 'ta.highest',
        detail: '(source, length) → series float',
        documentation: 'Highest value in lookback',
        insertText: 'ta.highest(${1:high}, ${2:20})',
    },
    {
        label: 'ta.lowest',
        detail: '(source, length) → series float',
        documentation: 'Lowest value in lookback',
        insertText: 'ta.lowest(${1:low}, ${2:20})',
    },
    {
        label: 'ta.crossover',
        detail: '(a, b) → series bool',
        documentation: 'True when A crosses above B',
        insertText: 'ta.crossover(${1:fast}, ${2:slow})',
    },
    {
        label: 'ta.crossunder',
        detail: '(a, b) → series bool',
        documentation: 'True when A crosses below B',
        insertText: 'ta.crossunder(${1:fast}, ${2:slow})',
    },
    {
        label: 'ta.cross',
        detail: '(a, b) → series bool',
        documentation: 'True when A crosses B in either direction',
        insertText: 'ta.cross(${1:a}, ${2:b})',
    },
    {
        label: 'ta.pivothigh',
        detail: '(source, lb, rb) → series float',
        documentation: 'Pivot high detection',
        insertText: 'ta.pivothigh(${1:high}, ${2:5}, ${3:5})',
    },
    {
        label: 'ta.pivotlow',
        detail: '(source, lb, rb) → series float',
        documentation: 'Pivot low detection',
        insertText: 'ta.pivotlow(${1:low}, ${2:5}, ${3:5})',
    },
    {
        label: 'ta.cum',
        detail: '(source) → series float',
        documentation: 'Cumulative sum across all bars',
        insertText: 'ta.cum(${1:volume})',
    },
    {
        label: 'ta.barssince',
        detail: '(condition) → series int',
        documentation: 'Bars since condition was true',
        insertText: 'ta.barssince(${1:condition})',
    },
    {
        label: 'ta.valuewhen',
        detail: '(condition, source, occurrence) → series float',
        documentation: 'Value when condition was true',
        insertText: 'ta.valuewhen(${1:cond}, ${2:close}, ${3:0})',
    },
    {
        label: 'ta.rising',
        detail: '(source, length) → series bool',
        documentation: 'True if source rose for N bars',
        insertText: 'ta.rising(${1:close}, ${2:5})',
    },
    {
        label: 'ta.falling',
        detail: '(source, length) → series bool',
        documentation: 'True if source fell for N bars',
        insertText: 'ta.falling(${1:close}, ${2:5})',
    },
    {
        label: 'ta.percentrank',
        detail: '(source, length) → series float',
        documentation: 'Percent rank over lookback',
        insertText: 'ta.percentrank(${1:close}, ${2:20})',
    },
    {
        label: 'ta.correlation',
        detail: '(a, b, length) → series float',
        documentation: 'Correlation coefficient',
        insertText: 'ta.correlation(${1:close}, ${2:volume}, ${3:20})',
    },
    {
        label: 'ta.dev',
        detail: '(source, length) → series float',
        documentation: 'Mean absolute deviation',
        insertText: 'ta.dev(${1:close}, ${2:20})',
    },
    {
        label: 'ta.median',
        detail: '(source, length) → series float',
        documentation: 'Median value in lookback',
        insertText: 'ta.median(${1:close}, ${2:14})',
    },
    {
        label: 'ta.linreg',
        detail: '(source, length, offset?) → series float',
        documentation: 'Linear regression',
        insertText: 'ta.linreg(${1:close}, ${2:20})',
    },

    // ── math.* (25+4) ──
    {
        label: 'math.abs',
        detail: '(number) → number',
        documentation: 'Absolute value',
        insertText: 'math.abs(${1:value})',
    },
    {
        label: 'math.max',
        detail: '(a, b) → number',
        documentation: 'Maximum of two values',
        insertText: 'math.max(${1:a}, ${2:b})',
    },
    {
        label: 'math.min',
        detail: '(a, b) → number',
        documentation: 'Minimum of two values',
        insertText: 'math.min(${1:a}, ${2:b})',
    },
    {
        label: 'math.round',
        detail: '(number, precision?) → number',
        documentation: 'Round to nearest integer or decimal places',
        insertText: 'math.round(${1:value}, ${2:2})',
    },
    {
        label: 'math.round_to_mintick',
        detail: '(number) → float',
        documentation: 'Round to symbol tick precision',
        insertText: 'math.round_to_mintick(${1:price})',
    },
    {
        label: 'math.ceil',
        detail: '(number) → int',
        documentation: 'Round up',
        insertText: 'math.ceil(${1:value})',
    },
    {
        label: 'math.floor',
        detail: '(number) → int',
        documentation: 'Round down',
        insertText: 'math.floor(${1:value})',
    },
    {
        label: 'math.sqrt',
        detail: '(number) → float',
        documentation: 'Square root',
        insertText: 'math.sqrt(${1:value})',
    },
    {
        label: 'math.pow',
        detail: '(base, exp) → float',
        documentation: 'Power / exponentiation',
        insertText: 'math.pow(${1:base}, ${2:exp})',
    },
    {
        label: 'math.log',
        detail: '(number) → float',
        documentation: 'Natural logarithm',
        insertText: 'math.log(${1:value})',
    },
    {
        label: 'math.log10',
        detail: '(number) → float',
        documentation: 'Base-10 logarithm',
        insertText: 'math.log10(${1:value})',
    },
    {
        label: 'math.exp',
        detail: '(number) → float',
        documentation: 'e^x',
        insertText: 'math.exp(${1:value})',
    },
    {
        label: 'math.sign',
        detail: '(number) → int',
        documentation: 'Sign: -1, 0, or 1',
        insertText: 'math.sign(${1:value})',
    },
    {
        label: 'math.avg',
        detail: '(a, b, ...) → float',
        documentation: 'Average of values',
        insertText: 'math.avg(${1:a}, ${2:b})',
    },
    {
        label: 'math.sum',
        detail: '(source, length) → series float',
        documentation: 'Sum over N bars',
        insertText: 'math.sum(${1:source}, ${2:length})',
    },
    {
        label: 'math.sin',
        detail: '(radians) → float',
        documentation: 'Sine',
        insertText: 'math.sin(${1:angle})',
    },
    {
        label: 'math.cos',
        detail: '(radians) → float',
        documentation: 'Cosine',
        insertText: 'math.cos(${1:angle})',
    },
    {
        label: 'math.tan',
        detail: '(radians) → float',
        documentation: 'Tangent',
        insertText: 'math.tan(${1:angle})',
    },
    {
        label: 'math.random',
        detail: '(min?, max?) → float',
        documentation: 'Random number',
        insertText: 'math.random()',
    },

    // ── input.* (14) ──
    {
        label: 'input.int',
        detail: '(defval, title?, ...) → int',
        documentation: 'Integer input (Settings panel: number spinner)',
        insertText: 'input.int(${1:14}, title="${2:Length}", minval=${3:1})',
    },
    {
        label: 'input.float',
        detail: '(defval, title?, ...) → float',
        documentation: 'Float input (Settings panel: decimal input)',
        insertText: 'input.float(${1:2.0}, title="${2:Multiplier}", minval=${3:0.001})',
    },
    {
        label: 'input.bool',
        detail: '(defval, title?) → bool',
        documentation: 'Boolean input (Settings panel: toggle switch)',
        insertText: 'input.bool(${1:true}, title="${2:Show}")',
    },
    {
        label: 'input.string',
        detail: '(defval, title?, options?) → string',
        documentation: 'String input (Settings panel: dropdown or text)',
        insertText: 'input.string("${1:SMA}", title="${2:Type}")',
    },
    {
        label: 'input.color',
        detail: '(defval, title?) → color',
        documentation: 'Color input (Settings panel: color picker)',
        insertText: 'input.color(${1:#2196F3}, title="${2:Color}")',
    },
    {
        label: 'input.source',
        detail: '(defval, title?) → source',
        documentation: 'Source selector (close, open, high, low, hl2...)',
        insertText: 'input.source(${1:close}, title="${2:Source}")',
    },

    // ── plot/visual ──
    {
        label: 'plot',
        detail: '(series, title?, color?, linewidth?, style?)',
        documentation: 'Plot a series on the chart',
        insertText: 'plot(${1:value}, title="${2:Plot}", color=${3:#2962FF})',
    },
    {
        label: 'plotshape',
        detail: '(condition, title?, style?, location?, color?, text?)',
        documentation: 'Plot a shape marker when condition is true',
        insertText:
            'plotshape(${1:cond}, title="${2:Signal}", style=${3:shape.triangleup}, location=${4:location.belowbar}, color=${5:#00FF00})',
    },
    {
        label: 'hline',
        detail: '(price, title?, color?)',
        documentation: 'Horizontal reference line',
        insertText: 'hline(${1:50}, title="${2:Level}", color=${3:#787B86})',
    },
    {
        label: 'bgcolor',
        detail: '(color)',
        documentation: 'Set background color for current bar',
        insertText: 'bgcolor(${1:color.new(color.green, 90)})',
    },
    {
        label: 'fill',
        detail: '(plot1, plot2, color?)',
        documentation: 'Fill area between two plots',
        insertText: 'fill(${1:p1}, ${2:p2}, color=${3:color.new(color.blue, 90)})',
    },
    {
        label: 'alertcondition',
        detail: '(condition, title?, message?)',
        documentation: 'Create alert trigger (used by Signal page)',
        insertText: 'alertcondition(${1:condition}, title="${2:Alert}", message="${3:Triggered}")',
    },

    // ── strategy.* ──
    {
        label: 'strategy.entry',
        detail: '(id, direction, qty?, ...)',
        documentation: 'Submit entry order',
        insertText: 'strategy.entry("${1:Long}", ${2:strategy.long})',
    },
    {
        label: 'strategy.exit',
        detail: '(id, from_entry?, ...)',
        documentation: 'Submit exit order',
        insertText: 'strategy.exit("${1:Exit}", from_entry="${2:Long}", stop=${3:stopPrice})',
    },
    {
        label: 'strategy.close',
        detail: '(id)',
        documentation: 'Close a position by entry ID',
        insertText: 'strategy.close("${1:Long}")',
    },
    {
        label: 'strategy.close_all',
        detail: '()',
        documentation: 'Close all open positions',
        insertText: 'strategy.close_all()',
    },

    // ── drawing.* ──
    {
        label: 'line.new',
        detail: '(x1, y1, x2, y2, ...opts)',
        documentation: 'Create a line between two points',
        insertText:
            'line.new(x1=${1:bar_index[1]}, y1=${2:low[1]}, x2=${3:bar_index}, y2=${4:high}, color=${5:#FF0000}, width=${6:2})',
    },
    {
        label: 'label.new',
        detail: '(x, y, text, ...opts)',
        documentation: 'Create a text label',
        insertText:
            'label.new(x=${1:bar_index}, y=${2:high}, text="${3:Label}", style=${4:label.style_label_down}, color=${5:#2196F3})',
    },
    {
        label: 'box.new',
        detail: '(left, top, right, bottom, ...opts)',
        documentation: 'Create a rectangle',
        insertText:
            'box.new(left=${1:bar_index[10]}, top=${2:high}, right=${3:bar_index}, bottom=${4:low})',
    },

    // ── color.* ──
    {
        label: 'color.new',
        detail: '(baseColor, transp) → color',
        documentation: 'Create color with transparency (0=opaque, 100=invisible)',
        insertText: 'color.new(${1:color.green}, ${2:50})',
    },
    {
        label: 'color.rgb',
        detail: '(r, g, b, transp?) → color',
        documentation: 'Create color from RGB values',
        insertText: 'color.rgb(${1:255}, ${2:128}, ${3:0}, ${4:20})',
    },

    // ── str.* ──
    {
        label: 'str.tostring',
        detail: '(value, format?) → string',
        documentation: 'Convert value to string',
        insertText: 'str.tostring(${1:close}, ${2:format.mintick})',
    },
    {
        label: 'str.format',
        detail: '("{0} {1}", a, b) → string',
        documentation: 'Format string with placeholders',
        insertText: 'str.format("{0} at {1}", ${1:"Price"}, ${2:close})',
    },

    // ── utility ──
    {
        label: 'na',
        detail: '(value?) → bool | na',
        documentation: 'Check if value is NaN/null, or return na literal',
        insertText: 'na(${1:value})',
    },
    {
        label: 'nz',
        detail: '(value, replacement?) → number',
        documentation: 'Replace NaN with 0 or custom value',
        insertText: 'nz(${1:value}, ${2:0})',
    },
    {
        label: 'fixnan',
        detail: '(source) → series float',
        documentation: 'Replace NaN with previous non-NaN value',
        insertText: 'fixnan(${1:source})',
    },
    {
        label: 'log.info',
        detail: '(message)',
        documentation: 'Log info message to console',
        insertText: 'log.info("${1:message}")',
    },
    {
        label: 'log.warning',
        detail: '(message)',
        documentation: 'Log warning to console',
        insertText: 'log.warning("${1:message}")',
    },
    {
        label: 'log.error',
        detail: '(message)',
        documentation: 'Log error to console',
        insertText: 'log.error("${1:message}")',
    },

    // ── Kuri v2: param.* ──
    {
        label: 'param.int',
        detail: '(name, default, min?, max?, step?) → int',
        documentation: 'Integer parameter',
        insertText: 'param.int("${1:Length}", ${2:14}, ${3:1}, ${4:200})',
    },
    {
        label: 'param.float',
        detail: '(name, default, min?, max?, step?) → float',
        documentation: 'Float parameter',
        insertText: 'param.float("${1:Multiplier}", ${2:2.0}, ${3:0.1}, ${4:10.0})',
    },
    {
        label: 'param.bool',
        detail: '(name, default) → bool',
        documentation: 'Boolean parameter',
        insertText: 'param.bool("${1:Show}", ${2:true})',
    },
    {
        label: 'param.source',
        detail: '(name, default) → series',
        documentation: 'Source parameter (close, open, high, low, etc.)',
        insertText: 'param.source("${1:Source}", ${2:close})',
    },
    {
        label: 'param.color',
        detail: '(name, default) → color',
        documentation: 'Color parameter',
        insertText: 'param.color("${1:Color}", ${2:#2196F3})',
    },
    {
        label: 'param.string',
        detail: '(name, default, options?) → string',
        documentation: 'String parameter',
        insertText: 'param.string("${1:Type}", "${2:SMA}", ["SMA", "EMA"])',
    },
    {
        label: 'param.timeframe',
        detail: '(name, default) → string',
        documentation: 'Timeframe parameter',
        insertText: 'param.timeframe("${1:Timeframe}", "${2:1h}")',
    },

    // ── Kuri v2: kuri.* ──
    {
        label: 'kuri.sma',
        detail: '(source, length) → series float',
        documentation: 'Simple Moving Average',
        insertText: 'kuri.sma(${1:close}, ${2:20})',
    },
    {
        label: 'kuri.ema',
        detail: '(source, length) → series float',
        documentation: 'Exponential Moving Average',
        insertText: 'kuri.ema(${1:close}, ${2:20})',
    },
    {
        label: 'kuri.rsi',
        detail: '(source, length) → series float',
        documentation: 'Relative Strength Index (0-100)',
        insertText: 'kuri.rsi(${1:close}, ${2:14})',
    },
    {
        label: 'kuri.hma',
        detail: '(source, length) → series float',
        documentation: 'Hull Moving Average',
        insertText: 'kuri.hma(${1:close}, ${2:9})',
    },
    {
        label: 'kuri.bb',
        detail: '(source, length, mult) → [basis, upper, lower]',
        documentation: 'Bollinger Bands',
        insertText: '[middle, upper, lower] = kuri.bb(${1:close}, ${2:20}, ${3:2})',
    },
    {
        label: 'kuri.macd',
        detail: '(source, fast, slow, signal) → [macd, signal, histogram]',
        documentation: 'MACD indicator',
        insertText:
            '[macdLine, signalLine, hist] = kuri.macd(${1:close}, ${2:12}, ${3:26}, ${4:9})',
    },
    {
        label: 'kuri.atr',
        detail: '(length) → series float',
        documentation: 'Average True Range',
        insertText: 'kuri.atr(${1:14})',
    },
    {
        label: 'kuri.crossover',
        detail: '(series1, series2) → bool',
        documentation: 'True when series1 crosses above series2',
        insertText: 'kuri.crossover(${1:fast}, ${2:slow})',
    },
    {
        label: 'kuri.crossunder',
        detail: '(series1, series2) → bool',
        documentation: 'True when series1 crosses below series2',
        insertText: 'kuri.crossunder(${1:fast}, ${2:slow})',
    },
    {
        label: 'kuri.alert',
        detail: '(condition, message) → void',
        documentation: 'Trigger an alert when condition is true',
        insertText: 'kuri.alert(${1:condition}, "${2:Alert message}")',
    },
    {
        label: 'kuri.smartalert',
        detail: '(condition, message, cooldown?) → void',
        documentation: 'Smart alert with deduplication and cooldown',
        insertText: 'kuri.smartalert(${1:condition}, "${2:Alert message}", ${3:5})',
    },

    // ── Kuri v2: draw.* ──
    {
        label: 'mark',
        detail: '(series, title?, color?, width?) → void',
        documentation: 'Draw a line on the chart',
        insertText: 'mark(${1:series}, "${2:Line}", ${3:#2196F3})',
    },
    {
        label: 'mark (style=mark.draw_bar)',
        detail: '(series, title?, color_up?, color_down?) → void',
        documentation: 'Draw bars (histogram) on the chart',
        insertText:
            'mark (style=mark.draw_bar)(${1:series}, "${2:Histogram}", ${3:#26A69A}, ${4:#EF5350})',
    },
    {
        label: 'mark.level',
        detail: '(value, title?, color?, style?) → void',
        documentation: 'Draw a horizontal level line',
        insertText: 'mark.level(${1:70}, "${2:Overbought}", ${3:#EF5350})',
    },
    {
        label: 'mark.fill',
        detail: '(series1, series2, color?) → void',
        documentation: 'Fill area between two series',
        insertText: 'mark.fill(${1:upper}, ${2:lower}, ${3:#2196F320})',
    },
    {
        label: 'mark.bgcolor',
        detail: '(condition, color?) → void',
        documentation: 'Color the background when condition is true',
        insertText: 'mark.bgcolor(${1:condition}, ${2:#FF980020})',
    },
    {
        label: 'mark.shape',
        detail: '(condition, style?, location?, color?) → void',
        documentation: 'Draw a shape marker on condition',
        insertText: 'mark.shape(${1:condition}, "${2:triangleup}", "${3:belowbar}", ${4:#26A69A})',
    },
    {
        label: 'mark.arrow',
        detail: '(condition, direction?, color?) → void',
        documentation: 'Draw an arrow marker on condition',
        insertText: 'mark.arrow(${1:condition}, "${2:up}", ${3:#26A69A})',
    },
];

// ═══════════════════════════════════════════════════════
// KEYWORDS + CONSTANTS for syntax highlighting
// ═══════════════════════════════════════════════════════

const KEYWORDS = [
    'indicator',
    'strategy',
    'if',
    'else',
    'for',
    'to',
    'while',
    'switch',
    'var',
    'varip',
    'int',
    'float',
    'bool',
    'string',
    'color',
    'series',
    'simple',
    'true',
    'false',
    'na',
    'and',
    'or',
    'not',
    'break',
    'continue',
    'return',
    'import',
    'export',
    'plot',
    'plotshape',
    'plotchar',
    'plotarrow',
    'hline',
    'bgcolor',
    'fill',
    'alert',
    'alertcondition',
    'line',
    'label',
    'box',
    'table',
    'linefill',
    'polyline',
    'input',
    'array',
    'matrix',
    'map',
    'param',
    'mark',
    'kuri',
];

const CONSTANTS = [
    // barstate
    'barstate.isfirst',
    'barstate.islast',
    'barstate.isconfirmed',
    'barstate.isrealtime',
    'barstate.isnew',
    // syminfo
    'syminfo.ticker',
    'syminfo.tickerid',
    'syminfo.currency',
    'syminfo.mintick',
    'syminfo.pointvalue',
    'syminfo.volumetype',
    'syminfo.type',
    // timeframe
    'timeframe.period',
    'timeframe.multiplier',
    'timeframe.isdaily',
    'timeframe.isweekly',
    'timeframe.ismonthly',
    'timeframe.isintraday',
    // display
    'xloc.bar_time',
    'xloc.bar_index',
    'yloc.price',
    'yloc.abovebar',
    'yloc.belowbar',
    'extend.none',
    'extend.left',
    'extend.right',
    'extend.both',
    // sizes
    'size.tiny',
    'size.small',
    'size.normal',
    'size.large',
    'size.huge',
    'size.auto',
    // styles
    'label.style_label_left',
    'label.style_label_right',
    'label.style_label_up',
    'label.style_label_down',
    'label.style_label_center',
    'line.style_solid',
    'line.style_dashed',
    'line.style_dotted',
    'plot.style_line',
    'plot.style_histogram',
    'plot.style_columns',
    'plot.style_circles',
    'plot.style_cross',
    'plot.style_linebr',
    'shape.triangleup',
    'shape.triangledown',
    'shape.diamond',
    'shape.circle',
    'shape.cross',
    'shape.xcross',
    'shape.flag',
    'shape.arrowup',
    'shape.arrowdown',
    'shape.labelup',
    'shape.labeldown',
    'location.abovebar',
    'location.belowbar',
    'location.absolute',
    'format.mintick',
    'format.price',
    'format.volume',
    'format.percent',
    // strategy
    'strategy.long',
    'strategy.short',
    'strategy.equity',
    'strategy.position_size',
    // colors
    'color.red',
    'color.green',
    'color.blue',
    'color.yellow',
    'color.orange',
    'color.purple',
    'color.white',
    'color.black',
    'color.gray',
    'color.silver',
    'color.maroon',
    'color.olive',
    'color.lime',
    'color.teal',
    'color.navy',
    'color.fuchsia',
    'color.aqua',
    // series
    'open',
    'high',
    'low',
    'close',
    'volume',
    'time',
    'bar_index',
    'hl2',
    'hlc3',
    'ohlc4',
];

// ═══════════════════════════════════════════════════════
// MAIN REGISTRATION — call this in handleEditorDidMount
// ═══════════════════════════════════════════════════════

export function registerKuriLanguage(monaco: any): void {
    // Skip if already registered
    if (monaco.languages.getLanguages().some((lang: any) => lang.id === 'kuri')) return;

    // 1. Register language ID
    monaco.languages.register({
        id: 'kuri',
        extensions: ['.kuri'],
        aliases: ['Kuri Script', 'kuri'],
    });

    // 2. Tokenizer (syntax highlighting)
    monaco.languages.setMonarchTokensProvider('kuri', {
        keywords: KEYWORDS,
        operators: [
            '+',
            '-',
            '*',
            '/',
            '%',
            '==',
            '!=',
            '<',
            '>',
            '<=',
            '>=',
            '=',
            ':=',
            '+=',
            '-=',
            '*=',
            '/=',
            '=>',
            '?',
            ':',
        ],
        tokenizer: {
            root: [
                // YAML header block
                [/^---$/, { token: 'comment.doc', next: '@yamlHeader' }],
                // Comments
                [/\/\/.*$/, 'comment'],
                // Annotations
                [/\/\/@\w+/, 'annotation'],
                // Color hex literals
                [/#[0-9a-fA-F]{3,8}\b/, 'number.hex'],
                // Strings
                [/"([^"\\]|\\.)*"/, 'string'],
                [/'([^'\\]|\\.)*'/, 'string'],
                // Numbers
                [/\d+\.?\d*([eE][+-]?\d+)?/, 'number'],
                // Namespace method calls (ta.sma, math.abs, input.int, etc.)
                [
                    /\b(ta|math|str|color|array|matrix|map|input|line|label|box|table|polyline|linefill|strategy|request|ticker|log|runtime|chart|timeframe|syminfo|barstate|param|draw|kuri)\.[a-zA-Z_]\w*/,
                    'support.function',
                ],
                // Constants (open, high, low, close, na, true, false)
                [
                    /\b(open|high|low|close|volume|time|bar_index|hl2|hlc3|ohlc4|na|true|false)\b/,
                    'constant',
                ],
                // Keywords
                [
                    /\b(indicator|strategy|if|else|for|to|while|switch|var|varip|int|float|bool|string|color|series|simple|break|continue|return|import|export|and|or|not|plot|plotshape|plotchar|plotarrow|hline|bgcolor|fill|alert|alertcondition|param|draw|kuri)\b/,
                    'keyword',
                ],
                // Identifiers
                [/[a-zA-Z_]\w*/, 'identifier'],
                // Operators
                [/[=><!~?:&|+\-*\/\^%]+/, 'operator'],
                // Brackets
                [/[{}()\[\]]/, '@brackets'],
            ],
            yamlHeader: [
                [/^---$/, { token: 'comment.doc', next: '@popall' }],
                [/^\w+/, 'variable.name'],
                [/:/, 'delimiter'],
                [/.*$/, 'string'],
            ],
        },
    });

    // 3. Theme — kuri-dark
    monaco.editor.defineTheme('kuri-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
            { token: 'annotation', foreground: '569CD6', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'C586C0' },
            { token: 'support.function', foreground: 'DCDCAA' },
            { token: 'constant', foreground: '4FC1FF' },
            { token: 'number', foreground: 'B5CEA8' },
            { token: 'number.hex', foreground: 'CE9178' },
            { token: 'string', foreground: 'CE9178' },
            { token: 'operator', foreground: 'D4D4D4' },
            { token: 'identifier', foreground: '9CDCFE' },
        ],
        colors: {
            'editor.background': '#1a1a2e',
            'editor.foreground': '#D4D4D4',
            'editor.lineHighlightBackground': '#1f1f3a',
            'editorCursor.foreground': '#FFFFFF',
            'editor.selectionBackground': '#264F78',
        },
    });

    // 4. Autocomplete provider
    monaco.languages.registerCompletionItemProvider('kuri', {
        triggerCharacters: ['.'],
        provideCompletionItems(model: any, position: any) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            // Get text before cursor to detect namespace
            const lineContent = model.getLineContent(position.lineNumber);
            const textBefore = lineContent.substring(0, position.column - 1);

            // Check if typing after a namespace dot (ta., math., input., etc.)
            const nsMatch = textBefore.match(
                /\b(ta|math|str|color|array|matrix|map|input|line|label|box|table|polyline|linefill|strategy|request|ticker|log|runtime|chart|param|draw|kuri)\.\s*$/
            );

            let suggestions: any[];

            if (nsMatch) {
                const ns = nsMatch[1];
                suggestions = KURI_FUNCTIONS.filter((f) => f.label.startsWith(ns + '.')).map(
                    (f) => ({
                        label: f.label.replace(ns + '.', ''),
                        kind: monaco.languages.CompletionItemKind.Function,
                        detail: f.detail,
                        documentation: f.documentation,
                        insertText: f.insertText.replace(ns + '.', ''),
                        insertTextRules:
                            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                    })
                );
            } else {
                // Top-level: show keywords + namespaces + global functions
                suggestions = [
                    ...KEYWORDS.map((k) => ({
                        label: k,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: k,
                        range,
                    })),
                    ...[
                        'ta',
                        'math',
                        'str',
                        'color',
                        'array',
                        'matrix',
                        'map',
                        'input',
                        'line',
                        'label',
                        'box',
                        'table',
                        'strategy',
                        'log',
                        'param',
                        'mark',
                        'kuri',
                    ].map((ns) => ({
                        label: ns,
                        kind: monaco.languages.CompletionItemKind.Module,
                        insertText: ns,
                        detail: 'namespace',
                        range,
                    })),
                    ...KURI_FUNCTIONS.filter((f) => !f.label.includes('.')).map((f) => ({
                        label: f.label,
                        kind: monaco.languages.CompletionItemKind.Function,
                        detail: f.detail,
                        documentation: f.documentation,
                        insertText: f.insertText,
                        insertTextRules:
                            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                    })),
                    // YAML header snippet
                    {
                        label: 'kuri-header',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        detail: 'Kuri v2 YAML header',
                        documentation: 'Insert a Kuri script YAML metadata header',
                        insertText:
                            '---\nkuri: 1.0\ntype: indicator\nname: ${1:My Indicator}\nshort: ${2:IND}\npane: ${3|overlay,separate|}\n---\n',
                        insertTextRules:
                            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                    },
                ];
            }

            return { suggestions };
        },
    });

    // 5. Hover provider
    monaco.languages.registerHoverProvider('kuri', {
        provideHover(model: any, position: any) {
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            // Check for namespace.function pattern
            const lineContent = model.getLineContent(position.lineNumber);
            const startIdx = word.startColumn - 2;
            let fullName = word.word;

            // Look for namespace prefix
            if (startIdx >= 0 && lineContent[startIdx] === '.') {
                const beforeDot = model.getWordAtPosition({
                    lineNumber: position.lineNumber,
                    column: startIdx,
                });
                if (beforeDot) fullName = beforeDot.word + '.' + word.word;
            }
            // Look for namespace.suffix
            const afterWord = lineContent.substring(word.endColumn - 1);
            const dotAfter = afterWord.match(/^\.(\w+)/);
            if (dotAfter) fullName = word.word + '.' + dotAfter[1];

            const fn = KURI_FUNCTIONS.find((f) => f.label === fullName);
            if (fn) {
                return {
                    range: new monaco.Range(
                        position.lineNumber,
                        word.startColumn,
                        position.lineNumber,
                        word.endColumn
                    ),
                    contents: [
                        { value: `**${fn.label}**${fn.detail}` },
                        { value: fn.documentation },
                    ],
                };
            }

            // Check Kuri v2 namespaces
            const nsHover: Record<string, string> = {
                param: '**param** — Parameter namespace\n\nDeclare user-configurable inputs: `param.int`, `param.float`, `param.bool`, `param.source`, `param.color`, `param.string`, `param.timeframe`',
                kuri: '**kuri** — Technical analysis namespace\n\nCore indicators and utilities: `kuri.sma`, `kuri.ema`, `kuri.rsi`, `kuri.bb`, `kuri.macd`, `kuri.atr`, `kuri.crossover`, `kuri.crossunder`, `kuri.alert`, `kuri.smartalert`',
                draw: '**draw** — Rendering namespace\n\nChart drawing functions: `mark`, `mark (style=mark.draw_bar)`, `mark.level`, `mark.fill`, `mark.bgcolor`, `mark.shape`, `mark.arrow`',
            };
            if (nsHover[fullName]) {
                return {
                    range: new monaco.Range(
                        position.lineNumber,
                        word.startColumn,
                        position.lineNumber,
                        word.endColumn
                    ),
                    contents: [{ value: nsHover[fullName] }],
                };
            }

            // Check constants
            if (CONSTANTS.includes(fullName)) {
                return {
                    range: new monaco.Range(
                        position.lineNumber,
                        word.startColumn,
                        position.lineNumber,
                        word.endColumn
                    ),
                    contents: [{ value: `**${fullName}** — built-in constant` }],
                };
            }

            return null;
        },
    });
}

// ═══════════════════════════════════════════════════════
// DIAGNOSTICS — wire to StrategyStudio.tsx
// Replaces ScriptEngine.provideDiagnostics() stub
// ═══════════════════════════════════════════════════════

export function setKuriDiagnostics(monaco: any, editor: any, errors: KuriError[]): void {
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const markers = errors.map((err) => ({
        severity:
            err.phase === 'runtime' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: err.line || 1,
        startColumn: err.col || 1,
        endLineNumber: err.line || 1,
        endColumn: 1000,
        source: 'kuri-diagnostics',
    }));

    monaco.editor.setModelMarkers(model, 'kuri-diagnostics', markers);
}

export function clearKuriDiagnostics(monaco: any, editor: any): void {
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'kuri-diagnostics', []);
}
