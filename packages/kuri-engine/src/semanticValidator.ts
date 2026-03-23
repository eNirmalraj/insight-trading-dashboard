/**
 * Semantic Validator for Kuri Scripts
 *
 * Comprehensive error detection that the parser/lexer can't catch:
 * - break/continue outside loop
 * - return outside function
 * - na == comparison (always false)
 * - duplicate var declarations
 * - wrong argument count for built-in functions
 * - unused variable warnings
 * - undefined variable detection
 * - unknown function detection with typo suggestions
 * - wrong strategy direction strings
 * - duplicate input titles
 * - division by zero
 * - infinite loop detection
 * - history access on scalars
 * - conditional plot warnings
 * - dead condition detection
 * - missing strategy.close() for strategy.entry()
 * - input range validation (min > max, default out of range)
 * - deprecated function suggestions
 * - plot count pre-check
 */

import { ASTNode, Program } from './types';

import { createKuriError } from './errors';
import type { KuriError } from './errors';

// Keep as deprecated alias
export type SemanticIssue = KuriError;

// ─── Known built-in functions with arg counts ───────────────────────────────

const BUILTIN_ARG_COUNTS: Record<string, { min: number; max: number; name: string }> = {
    // ta.* indicator functions
    'ta.sma': { min: 2, max: 2, name: 'ta.sma(source, period)' },
    'ta.ema': { min: 2, max: 2, name: 'ta.ema(source, period)' },
    'ta.wma': { min: 2, max: 2, name: 'ta.wma(source, period)' },
    'ta.vwma': { min: 2, max: 3, name: 'ta.vwma(source, volume, period)' },
    'ta.hma': { min: 2, max: 2, name: 'ta.hma(source, period)' },
    'ta.rma': { min: 2, max: 2, name: 'ta.rma(source, period)' },
    'ta.dema': { min: 2, max: 2, name: 'ta.dema(source, period)' },
    'ta.tema': { min: 2, max: 2, name: 'ta.tema(source, period)' },
    'ta.alma': { min: 2, max: 4, name: 'ta.alma(source, period[, offset, sigma])' },
    'ta.kama': { min: 2, max: 2, name: 'ta.kama(source, period)' },
    'ta.smma': { min: 2, max: 2, name: 'ta.smma(source, period)' },
    'ta.zlema': { min: 2, max: 2, name: 'ta.zlema(source, period)' },
    'ta.swma': { min: 1, max: 1, name: 'ta.swma(source)' },
    'ta.rsi': { min: 2, max: 2, name: 'ta.rsi(source, period)' },
    'ta.atr': { min: 1, max: 1, name: 'ta.atr(period)' },
    'ta.tr': { min: 0, max: 0, name: 'ta.tr()' },
    'ta.cci': { min: 1, max: 3, name: 'ta.cci([high, low,] period)' },
    'ta.macd': { min: 3, max: 4, name: 'ta.macd(source, fast, slow[, signal])' },
    'ta.bb': { min: 2, max: 3, name: 'ta.bb(source, period[, mult])' },
    'ta.bollinger_bands': { min: 2, max: 3, name: 'ta.bollinger_bands(source, period[, mult])' },
    'ta.stoch': { min: 3, max: 3, name: 'ta.stoch(periodK, smoothK, periodD)' },
    'ta.stochastic': { min: 3, max: 3, name: 'ta.stochastic(periodK, smoothK, periodD)' },
    'ta.supertrend': { min: 2, max: 2, name: 'ta.supertrend(period, multiplier)' },
    'ta.adx': { min: 1, max: 4, name: 'ta.adx([high, low, close,] period)' },
    'ta.obv': { min: 0, max: 0, name: 'ta.obv()' },
    'ta.vwap': { min: 0, max: 0, name: 'ta.vwap()' },
    'ta.mfi': { min: 1, max: 5, name: 'ta.mfi([high, low, close, volume,] period)' },
    'ta.cmf': { min: 1, max: 1, name: 'ta.cmf(period)' },
    'ta.accdist': { min: 0, max: 0, name: 'ta.accdist()' },
    'ta.highest': { min: 2, max: 2, name: 'ta.highest(source, period)' },
    'ta.lowest': { min: 2, max: 2, name: 'ta.lowest(source, period)' },
    'ta.highest_bars': { min: 2, max: 2, name: 'ta.highest_bars(source, period)' },
    'ta.lowest_bars': { min: 2, max: 2, name: 'ta.lowest_bars(source, period)' },
    'ta.stdev': { min: 2, max: 2, name: 'ta.stdev(source, period)' },
    'ta.variance': { min: 2, max: 2, name: 'ta.variance(source, period)' },
    'ta.change': { min: 1, max: 2, name: 'ta.change(source[, period])' },
    'ta.mom': { min: 2, max: 2, name: 'ta.mom(source, period)' },
    'ta.roc': { min: 2, max: 2, name: 'ta.roc(source, period)' },
    'ta.wpr': { min: 1, max: 1, name: 'ta.wpr(period)' },
    'ta.cmo': { min: 2, max: 2, name: 'ta.cmo(source, period)' },
    'ta.tsi': { min: 3, max: 3, name: 'ta.tsi(source, shortLen, longLen)' },
    'ta.sar': { min: 3, max: 3, name: 'ta.sar(start, increment, maximum)' },
    'ta.dc': { min: 1, max: 1, name: 'ta.dc(period)' },
    'ta.donchian': { min: 1, max: 1, name: 'ta.donchian(period)' },
    'ta.kc': { min: 2, max: 3, name: 'ta.kc(source, period[, mult])' },
    'ta.kcw': { min: 2, max: 3, name: 'ta.kcw(source, period[, mult])' },
    'ta.bbw': { min: 2, max: 3, name: 'ta.bbw(source, period[, mult])' },
    'ta.percent_b': { min: 2, max: 3, name: 'ta.percent_b(source, period[, mult])' },
    'ta.ichimoku': { min: 3, max: 3, name: 'ta.ichimoku(conversion, base, spanB)' },
    'ta.linreg': { min: 2, max: 3, name: 'ta.linreg(source, period[, offset])' },
    'ta.median': { min: 2, max: 2, name: 'ta.median(source, period)' },
    'ta.percentrank': { min: 2, max: 2, name: 'ta.percentrank(source, period)' },
    'ta.correlation': { min: 3, max: 3, name: 'ta.correlation(source1, source2, period)' },
    'ta.crossover': { min: 2, max: 2, name: 'ta.crossover(a, b)' },
    'ta.crossunder': { min: 2, max: 2, name: 'ta.crossunder(a, b)' },
    'ta.rising': { min: 2, max: 2, name: 'ta.rising(source, period)' },
    'ta.falling': { min: 2, max: 2, name: 'ta.falling(source, period)' },
    'ta.barssince': { min: 1, max: 1, name: 'ta.barssince(condition)' },
    'ta.valuewhen': { min: 3, max: 3, name: 'ta.valuewhen(condition, source, occurrence)' },
    'ta.pivothigh': { min: 3, max: 3, name: 'ta.pivothigh(source, leftbars, rightbars)' },
    'ta.pivotlow': { min: 3, max: 3, name: 'ta.pivotlow(source, leftbars, rightbars)' },
    'ta.cum': { min: 1, max: 1, name: 'ta.cum(source)' },

    // Top-level crossover/crossunder
    crossover: { min: 2, max: 2, name: 'crossover(a, b)' },
    crossunder: { min: 2, max: 2, name: 'crossunder(a, b)' },

    // Plot functions
    plot: { min: 1, max: 4, name: 'plot(series[, title, color, linewidth])' },
    plotLine: { min: 1, max: 3, name: 'plotLine(series[, title, options])' },
    plotHistogram: { min: 1, max: 3, name: 'plotHistogram(series[, title, options])' },
    plotArea: { min: 1, max: 3, name: 'plotArea(series[, title, options])' },
    plotBand: { min: 3, max: 5, name: 'plotBand(upper, lower, middle[, title, options])' },
    plotHLine: { min: 1, max: 3, name: 'plotHLine(price[, title, color])' },
    plotCloud: { min: 2, max: 4, name: 'plotCloud(spanA, spanB[, title, options])' },
    plotColumns: { min: 1, max: 3, name: 'plotColumns(series[, title, options])' },
    plotMarkers: { min: 1, max: 3, name: 'plotMarkers(series[, title, options])' },
    hline: { min: 1, max: 3, name: 'hline(price[, title, color])' },

    // Input functions
    input: { min: 1, max: 3, name: 'input(defval[, title, options])' },
    'input.int': { min: 1, max: 8, name: 'input.int(defval[, title, minval, maxval, ...])' },
    'input.float': { min: 1, max: 8, name: 'input.float(defval[, title, minval, maxval, ...])' },
    'input.bool': { min: 1, max: 5, name: 'input.bool(defval[, title, ...])' },
    'input.string': { min: 1, max: 5, name: 'input.string(defval[, title, ...])' },
    'input.source': { min: 1, max: 5, name: 'input.source(defval[, title, ...])' },
    'input.color': { min: 1, max: 5, name: 'input.color(defval[, title, ...])' },

    // Math functions
    'math.abs': { min: 1, max: 1, name: 'math.abs(x)' },
    'math.ceil': { min: 1, max: 1, name: 'math.ceil(x)' },
    'math.floor': { min: 1, max: 1, name: 'math.floor(x)' },
    'math.round': { min: 1, max: 2, name: 'math.round(x[, precision])' },
    'math.max': { min: 2, max: 10, name: 'math.max(a, b[, ...])' },
    'math.min': { min: 2, max: 10, name: 'math.min(a, b[, ...])' },
    'math.pow': { min: 2, max: 2, name: 'math.pow(base, exp)' },
    'math.sqrt': { min: 1, max: 1, name: 'math.sqrt(x)' },
    'math.log': { min: 1, max: 1, name: 'math.log(x)' },
    'math.log10': { min: 1, max: 1, name: 'math.log10(x)' },
    'math.exp': { min: 1, max: 1, name: 'math.exp(x)' },
    'math.sign': { min: 1, max: 1, name: 'math.sign(x)' },
    'math.avg': { min: 2, max: 2, name: 'math.avg(a, b)' },
    'math.sum': { min: 1, max: 2, name: 'math.sum(series[, length])' },
    'math.pi': { min: 0, max: 0, name: 'math.pi()' },
    'math.e': { min: 0, max: 0, name: 'math.e()' },
    'math.random': { min: 0, max: 0, name: 'math.random()' },

    // String functions
    'str.tostring': { min: 1, max: 2, name: 'str.tostring(value, format?)' },
    'str.tonumber': { min: 1, max: 1, name: 'str.tonumber(string)' },
    'str.contains': { min: 2, max: 2, name: 'str.contains(source, substr)' },
    'str.length': { min: 1, max: 1, name: 'str.length(source)' },
    'str.upper': { min: 1, max: 1, name: 'str.upper(source)' },
    'str.lower': { min: 1, max: 1, name: 'str.lower(source)' },
    'str.replace': { min: 3, max: 3, name: 'str.replace(source, target, replacement)' },
    'str.replace_all': { min: 3, max: 3, name: 'str.replace_all(source, target, replacement)' },
    'str.split': { min: 2, max: 2, name: 'str.split(source, separator)' },
    'str.format': { min: 1, max: 10, name: 'str.format(template, ...args)' },
    'str.format_time': { min: 2, max: 3, name: 'str.format_time(timestamp, format[, timezone])' },

    // Utility
    nz: { min: 1, max: 2, name: 'nz(value[, replacement])' },
    na: { min: 1, max: 1, name: 'na(value)' },
    alertcondition: { min: 1, max: 3, name: 'alertcondition(condition[, title, message])' },

    // Strategy
    'strategy.entry': {
        min: 2,
        max: 6,
        name: 'strategy.entry(id, direction[, condition, stopLoss, takeProfit, comment])',
    },
    'strategy.close': { min: 1, max: 2, name: 'strategy.close(id[, comment])' },
    'strategy.close_all': { min: 0, max: 1, name: 'strategy.close_all([comment])' },
    'strategy.exit': { min: 2, max: 8, name: 'strategy.exit(id, from_entry[, profit, loss, ...])' },
    'strategy.exit_sl': { min: 1, max: 1, name: 'strategy.exit_sl(percent)' },
    'strategy.exit_tp': { min: 1, max: 1, name: 'strategy.exit_tp(percent)' },
    'strategy.order': {
        min: 2,
        max: 6,
        name: 'strategy.order(id, action[, quantity, limit, stop, comment])',
    },
    'strategy.cancel': { min: 1, max: 1, name: 'strategy.cancel(id)' },
    'strategy.cancel_all': { min: 0, max: 0, name: 'strategy.cancel_all()' },

    // Drawing
    'label.new': {
        min: 3,
        max: 12,
        name: 'label.new(x, y, text[, xloc, yloc, color, textcolor, style, size, ...])',
    },
    'label.delete': { min: 1, max: 1, name: 'label.delete(label)' },
    'line.new': {
        min: 4,
        max: 9,
        name: 'line.new(x1, y1, x2, y2[, xloc, color, width, style, extend])',
    },
    'line.delete': { min: 1, max: 1, name: 'line.delete(line)' },
    'box.new': { min: 4, max: 14, name: 'box.new(left, top, right, bottom[, ...])' },
    'box.delete': { min: 1, max: 1, name: 'box.delete(box)' },
    'table.new': { min: 3, max: 8, name: 'table.new(position, columns, rows[, bgcolor, ...])' },
    'table.cell': { min: 4, max: 12, name: 'table.cell(table, row, column, text[, ...])' },
    'table.delete': { min: 1, max: 1, name: 'table.delete(table)' },

    // Aliases without ta. prefix
    sma: { min: 2, max: 2, name: 'sma(source, period)' },
    ema: { min: 2, max: 2, name: 'ema(source, period)' },
    rsi: { min: 2, max: 2, name: 'rsi(source, period)' },
    macd: { min: 3, max: 4, name: 'macd(source, fast, slow[, signal])' },
    atr: { min: 1, max: 1, name: 'atr(period)' },

    // Request functions
    'request.security': { min: 3, max: 3, name: 'request.security(symbol, timeframe, expression)' },
    'request.security_lower_tf': {
        min: 3,
        max: 3,
        name: 'request.security_lower_tf(symbol, timeframe, expression)',
    },
    'ticker.new': { min: 2, max: 2, name: 'ticker.new(prefix, ticker)' },

    // Color functions
    'color.new': { min: 2, max: 2, name: 'color.new(color, transparency)' },
    'color.rgb': { min: 3, max: 4, name: 'color.rgb(r, g, b[, a])' },
    'color.hsl': { min: 3, max: 4, name: 'color.hsl(h, s, l[, a])' },
    rgba: { min: 3, max: 4, name: 'rgba(r, g, b[, a])' },
};

// All known function names (for unknown function detection)
const ALL_KNOWN_FUNCTIONS = new Set(Object.keys(BUILTIN_ARG_COUNTS));

// Add functions we know about but don't validate arg counts for
const ADDITIONAL_KNOWN_FUNCTIONS = [
    // Declarations
    'indicator',
    'strategy',
    // Pine compat stubs
    'plotcandle',
    'plotbar',
    'plotchar',
    'bgcolor',
    'fill',
    'barcolor',
    'plotShape',
    // Array functions
    'array.new_float',
    'array.new_int',
    'array.new_bool',
    'array.new_string',
    'array.get',
    'array.set',
    'array.push',
    'array.pop',
    'array.shift',
    'array.unshift',
    'array.size',
    'array.clear',
    'array.slice',
    'array.includes',
    'array.indexOf',
    'array.remove',
    'array.insert',
    'array.sort',
    'array.reverse',
    'array.avg',
    'array.sum',
    'array.min',
    'array.max',
    'array.concat',
    'array.fill',
    'array.join',
    'array.copy',
    'array.first',
    'array.last',
    'array.from',
    'array.stdev',
    'array.variance',
    'array.median',
    'array.mode',
    // Map functions
    'map.new',
    'map.put',
    'map.set',
    'map.get',
    'map.remove',
    'map.contains',
    'map.keys',
    'map.values',
    'map.size',
    'map.clear',
    // Matrix functions
    'matrix.new',
    'matrix.get',
    'matrix.set',
    'matrix.rows',
    'matrix.columns',
    'matrix.row',
    'matrix.col',
    'matrix.add',
    'matrix.mult',
    'matrix.transpose',
    'matrix.det',
    'matrix.inv',
    'matrix.sum',
    // String extras
    'str.startswith',
    'str.endswith',
    'str.substring',
    'str.trim',
    'str.repeat',
    'str.match',
    'str.pos',
    // Math extras
    'math.sin',
    'math.cos',
    'math.tan',
    'math.asin',
    'math.acos',
    'math.atan',
    'math.atan2',
    'math.todegrees',
    'math.toradians',
    // Label/Line/Box setters
    'label.set_text',
    'label.set_xy',
    'label.set_x',
    'label.set_y',
    'label.set_color',
    'label.set_textcolor',
    'label.set_style',
    'label.set_size',
    'label.set_tooltip',
    'label.set_textalign',
    'label.get_text',
    'label.get_x',
    'label.get_y',
    'line.set_xy1',
    'line.set_xy2',
    'line.set_x1',
    'line.set_y1',
    'line.set_x2',
    'line.set_y2',
    'line.set_color',
    'line.set_width',
    'line.set_style',
    'line.set_extend',
    'line.get_x1',
    'line.get_y1',
    'line.get_x2',
    'line.get_y2',
    'line.get_price',
    'box.set_left',
    'box.set_top',
    'box.set_right',
    'box.set_bottom',
    'box.set_bgcolor',
    'box.set_border_color',
    'box.set_text',
    'box.set_text_color',
    'box.get_left',
    'box.get_top',
    'box.get_right',
    'box.get_bottom',
    'table.set_position',
    'table.set_bgcolor',
    'table.set_frame_color',
    'table.set_frame_width',
    'table.set_border_color',
    'table.set_border_width',
    // Ticker
    'ticker.modify',
    // Strategy info
    'strategy.opentrades.entry_price',
    'strategy.opentrades.entry_bar_index',
    'strategy.opentrades.entry_id',
    'strategy.opentrades.entry_time',
    'strategy.opentrades.size',
    'strategy.opentrades.profit',
    'strategy.closedtrades.entry_price',
    'strategy.closedtrades.exit_price',
    'strategy.closedtrades.entry_bar_index',
    'strategy.closedtrades.exit_bar_index',
    'strategy.closedtrades.entry_id',
    'strategy.closedtrades.entry_time',
    'strategy.closedtrades.exit_time',
    'strategy.closedtrades.size',
    'strategy.closedtrades.profit',
    'strategy.closedtrades.profit_percent',
    'strategy.closedtrades.max_runup',
    'strategy.closedtrades.max_drawdown',
    // Risk management
    'strategy.risk.max_leverage',
    'strategy.risk.max_position_size_percent',
    'strategy.risk.max_total_exposure',
    'strategy.risk.allow_entry_in',
    'strategy.risk.max_cons_loss_days',
    // Time
    'timeframe.in_seconds',
    'time',
    // Other
    'int',
    'float',
    'bool',
    'string', // Type conversion functions
    'color.r',
    'color.g',
    'color.b',
    'color.t',
    'input.timeframe',
    'input.symbol',
    'input.session',
    'input.price',
    'input.text_area',
];

for (const fn of ADDITIONAL_KNOWN_FUNCTIONS) {
    ALL_KNOWN_FUNCTIONS.add(fn);
}

// Deprecated functions and their replacements
const DEPRECATED_FUNCTIONS: Record<string, string> = {
    sma: 'ta.sma',
    ema: 'ta.ema',
    rsi: 'ta.rsi',
    macd: 'ta.macd',
    atr: 'ta.atr',
    cci: 'ta.cci',
    mfi: 'ta.mfi',
    obv: 'ta.obv',
    vwap: 'ta.vwap',
    stoch: 'ta.stoch',
    bb: 'ta.bb',
    wma: 'ta.wma',
    hma: 'ta.hma',
};

// ─── Read-only built-in variables (cannot be assigned) ──────────────────────

const READONLY_BUILTINS = new Set([
    'open',
    'high',
    'low',
    'close',
    'volume',
    'time',
    'bar_index',
    'last_bar_index',
    'hl2',
    'hlc3',
    'ohlc4',
    'timenow',
    'time_close',
    'time_tradingday',
    'year',
    'month',
    'dayofmonth',
    'dayofweek',
    'weekofyear',
    'hour',
    'minute',
    'second',
    'na',
    'true',
    'false',
]);

// Built-in variable names that users might accidentally shadow
const SHADOWABLE_BUILTINS = new Set([
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
]);

// Functions that take a period argument (for zero/negative period detection)
// Maps function name → index of the period argument (0-based)
const PERIOD_ARG_INDEX: Record<string, number> = {
    'ta.sma': 1,
    'ta.ema': 1,
    'ta.wma': 1,
    'ta.vwma': 1,
    'ta.hma': 1,
    'ta.rma': 1,
    'ta.dema': 1,
    'ta.tema': 1,
    'ta.alma': 1,
    'ta.kama': 1,
    'ta.smma': 1,
    'ta.zlema': 1,
    'ta.rsi': 1,
    'ta.stdev': 1,
    'ta.variance': 1,
    'ta.mom': 1,
    'ta.roc': 1,
    'ta.change': 1,
    'ta.linreg': 1,
    'ta.median': 1,
    'ta.percentrank': 1,
    'ta.highest': 1,
    'ta.lowest': 1,
    'ta.highest_bars': 1,
    'ta.lowest_bars': 1,
    'ta.cmo': 1,
    'ta.atr': 0,
    'ta.cci': 0,
    'ta.adx': 0,
    'ta.mfi': 0,
    'ta.wpr': 0,
    'ta.cmf': 0,
    'ta.dc': 0,
    'ta.donchian': 0,
    sma: 1,
    ema: 1,
    rsi: 1,
    atr: 0,
    'input.int': 0,
    'input.float': 0, // default value check (not period, but useful)
};

// ─── Built-in variables ─────────────────────────────────────────────────────

const BUILTIN_VARS = new Set([
    'open',
    'high',
    'low',
    'close',
    'volume',
    'time',
    'bar_index',
    'last_bar_index',
    'hl2',
    'hlc3',
    'ohlc4',
    'na',
    'true',
    'false',
    'year',
    'month',
    'dayofmonth',
    'dayofweek',
    'weekofyear',
    'hour',
    'minute',
    'second',
    'timenow',
    'time_close',
    'time_tradingday',
    // barstate
    'barstate',
    'barstate.isfirst',
    'barstate.islast',
    'barstate.islastconfirmedhistory',
    'barstate.ishistory',
    'barstate.isrealtime',
    'barstate.isnew',
    'barstate.isconfirmed',
    // syminfo
    'syminfo',
    'syminfo.ticker',
    'syminfo.tickerid',
    'syminfo.root',
    'syminfo.description',
    'syminfo.currency',
    'syminfo.basecurrency',
    'syminfo.exchange',
    'syminfo.type',
    'syminfo.timezone',
    'syminfo.session',
    'syminfo.mintick',
    'syminfo.pointvalue',
    'syminfo.pricescale',
    'syminfo.volumetype',
    // timeframe
    'timeframe',
    'timeframe.period',
    'timeframe.multiplier',
    'timeframe.isseconds',
    'timeframe.isminutes',
    'timeframe.isintraday',
    'timeframe.isdaily',
    'timeframe.isweekly',
    'timeframe.ismonthly',
    'timeframe.isdwm',
    // dayofweek constants
    'dayofweek.sunday',
    'dayofweek.monday',
    'dayofweek.tuesday',
    'dayofweek.wednesday',
    'dayofweek.thursday',
    'dayofweek.friday',
    'dayofweek.saturday',
    // strategy properties (read-only)
    'strategy.position_size',
    'strategy.position_avg_price',
    'strategy.opentrades',
    'strategy.closedtrades',
    'strategy.openprofit',
    'strategy.netprofit',
    'strategy.closedprofit',
    'strategy.grossprofit',
    'strategy.grossloss',
    'strategy.wintrades',
    'strategy.losstrades',
    'strategy.eventrades',
    'strategy.percent_profitable',
    'strategy.equity',
    'strategy.initial_capital',
    'strategy.max_drawdown',
    'strategy.long',
    'strategy.short',
    // color constants
    'color',
    'color.red',
    'color.green',
    'color.blue',
    'color.white',
    'color.black',
    'color.gray',
    'color.silver',
    'color.orange',
    'color.yellow',
    'color.aqua',
    'color.lime',
    'color.fuchsia',
    'color.maroon',
    'color.navy',
    'color.olive',
    'color.purple',
    'color.teal',
    'color.green_light',
    'color.red_light',
    'color.blue_light',
    'color.yellow_light',
    'color.purple_light',
    'color.orange_light',
    // label/line/box styles
    'label.style_none',
    'label.style_xcross',
    'label.style_cross',
    'label.style_triangleup',
    'label.style_triangledown',
    'label.style_flag',
    'label.style_circle',
    'label.style_arrowup',
    'label.style_arrowdown',
    'label.style_square',
    'label.style_diamond',
    'label.style_label_up',
    'label.style_label_down',
    'label.style_label_left',
    'label.style_label_right',
    'label.style_label_center',
    'label.style_text_outline',
    'line.style_solid',
    'line.style_dashed',
    'line.style_dotted',
    'line.style_arrow_left',
    'line.style_arrow_right',
    'line.style_arrow_both',
    'extend.none',
    'extend.left',
    'extend.right',
    'extend.both',
    'xloc.bar_index',
    'xloc.bar_time',
    'yloc.price',
    'yloc.abovebar',
    'yloc.belowbar',
    'position.top_left',
    'position.top_center',
    'position.top_right',
    'position.middle_left',
    'position.middle_center',
    'position.middle_right',
    'position.bottom_left',
    'position.bottom_center',
    'position.bottom_right',
    'text.align_left',
    'text.align_center',
    'text.align_right',
    'size.auto',
    'size.tiny',
    'size.small',
    'size.normal',
    'size.large',
    'size.huge',
    'display.none',
    'display.all',
    'display.data_window',
    // Namespace roots (for member access)
    'ta',
    'math',
    'str',
    'array',
    'map',
    'matrix',
    'input',
    'strategy',
    'label',
    'line',
    'box',
    'table',
    'ticker',
    'request',
]);

// ─── Typo suggestion helper ────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
    const m = a.length,
        n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] =
                a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

function findClosestFunction(name: string): string | null {
    let best = '';
    let bestDist = Infinity;
    for (const fn of ALL_KNOWN_FUNCTIONS) {
        const dist = levenshtein(name.toLowerCase(), fn.toLowerCase());
        if (dist < bestDist && dist <= 2) {
            // Max 2 edits
            bestDist = dist;
            best = fn;
        }
    }
    return best || null;
}

// ─── Main validator ────────────────────────────────────────────────────────

export function validateSemantics(program: Program): KuriError[] {
    const issues: KuriError[] = [];
    const declaredVars = new Map<string, { line: number; column: number }>();
    const usedVars = new Set<string>();
    const inputTitles = new Map<string, number>(); // title → first line
    const entryIds = new Set<string>();
    const closeIds = new Set<string>();
    let plotCount = 0;
    let hasConditionalPlot = false;
    let scriptType: 'indicator' | 'strategy' | null = null;

    const inputVars = new Set<string>();

    const ctx: WalkContext = {
        inLoop: false,
        inFunction: false,
        inConditional: false,
        loopDepth: 0,
        issues,
        declaredVars,
        usedVars,
        inputTitles,
        inputVars,
        entryIds,
        closeIds,
        plotCount: { value: 0 },
        hasConditionalPlot: { value: false },
        scriptType: { value: null },
        declarationCount: { value: 0 },
        bareEntryCount: { value: 0 },
    };

    walkStatements(program.body, ctx);

    // ── Post-walk checks ──

    // Unused variables
    for (const [name, loc] of declaredVars) {
        if (!usedVars.has(name) && !BUILTIN_VARS.has(name)) {
            issues.push(
                createKuriError('K101', {
                    message: `Variable '${name}' is declared but never used.`,
                    line: loc.line,
                    column: loc.column,
                })
            );
        }
    }

    // Plot count pre-check
    if (ctx.plotCount.value > 64) {
        issues.push(
            createKuriError('K301', {
                message: `Script has ${ctx.plotCount.value} plot() calls — maximum is 64. Remove unused plots.`,
                line: 1,
                column: 1,
            })
        );
    } else if (ctx.plotCount.value > 50) {
        issues.push(
            createKuriError('K302', {
                message: `Script has ${ctx.plotCount.value} plot() calls — approaching the limit of 64. Consider reducing.`,
                line: 1,
                column: 1,
            })
        );
    }

    // Conditional plot warning
    if (ctx.hasConditionalPlot.value) {
        issues.push(
            createKuriError('K303', {
                message: `plot() called inside an if/else block may produce gaps. Consider using the ternary operator: plot(condition ? value : na, ...) instead.`,
                line: 1,
                column: 1,
            })
        );
    }

    // strategy.close() references unmatched entry IDs
    for (const id of closeIds) {
        if (!entryIds.has(id)) {
            issues.push(
                createKuriError('K401', {
                    message: `strategy.close("${id}") doesn't match any strategy.entry("${id}", ...). The entry ID must match exactly.`,
                    line: 1,
                    column: 1,
                })
            );
        }
    }

    // K110: Multiple script declarations
    if (ctx.declarationCount.value > 1) {
        issues.push(
            createKuriError('K110', {
                message: `Script has ${ctx.declarationCount.value} declarations (indicator/strategy). Only one is allowed per script.`,
                line: 1,
                column: 1,
            })
        );
    }

    // K100: Unused inputs (declared via input.* but never used in calculations)
    // NOTE: severity is 'warning' because the walker cannot track usage through
    // switch/match statements, ternaries in some contexts, or string interpolation.
    for (const inputVar of inputVars) {
        if (!usedVars.has(inputVar) && declaredVars.has(inputVar)) {
            const loc = declaredVars.get(inputVar)!;
            issues.push(
                createKuriError('K100', {
                    message: `Input '${inputVar}' is created but may not be used in any calculation. Users will see this setting but it may do nothing — remove it or use it.`,
                    line: loc.line,
                    column: loc.column,
                })
            );
        }
    }

    // K160: strategy.entry() without any condition (bare entry on every bar)
    if (ctx.bareEntryCount.value > 0 && ctx.scriptType.value === 'strategy') {
        issues.push(
            createKuriError('K160', {
                message: `strategy.entry() is called without any if condition — it will enter a trade on every single bar. Wrap it in an if block.`,
                line: 1,
                column: 1,
            })
        );
    }

    return issues;
}

// ─── Walk context ───────────────────────────────────────────────────────────

interface WalkContext {
    inLoop: boolean;
    inFunction: boolean;
    inConditional: boolean;
    loopDepth: number;
    issues: KuriError[];
    declaredVars: Map<string, { line: number; column: number }>;
    usedVars: Set<string>;
    inputTitles: Map<string, number>;
    inputVars: Set<string>; // Variables assigned from input.* calls
    entryIds: Set<string>;
    closeIds: Set<string>;
    plotCount: { value: number };
    hasConditionalPlot: { value: boolean };
    scriptType: { value: 'indicator' | 'strategy' | null };
    declarationCount: { value: number }; // Track indicator()/strategy() declarations
    bareEntryCount: { value: number }; // strategy.entry() not inside any if
}

// ─── AST walker ─────────────────────────────────────────────────────────────

function walkStatements(nodes: ASTNode[], ctx: WalkContext): void {
    for (const node of nodes) {
        walkNode(node, ctx);
    }
}

function walkNode(node: ASTNode, ctx: WalkContext): void {
    if (!node || !node.type) return;

    switch (node.type) {
        case 'BreakStatement':
            if (!ctx.inLoop) {
                ctx.issues.push(
                    createKuriError('K001', {
                        message: "'break' can only be used inside a for or while loop.",
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }
            break;

        case 'ContinueStatement':
            if (!ctx.inLoop) {
                ctx.issues.push(
                    createKuriError('K002', {
                        message: "'continue' can only be used inside a for or while loop.",
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }
            break;

        case 'ReturnStatement':
            if (!ctx.inFunction) {
                ctx.issues.push(
                    createKuriError('K003', {
                        message: "'return' can only be used inside a function.",
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }
            if ((node as any).value) walkNode((node as any).value, ctx);
            break;

        case 'Assignment': {
            const assign = node as any;
            if (assign.name) {
                // K120: Modifying read-only built-in variable
                if (READONLY_BUILTINS.has(assign.name)) {
                    ctx.issues.push(
                        createKuriError('K120', {
                            message: `'${assign.name}' is a built-in read-only variable (price data). You cannot assign to it. Use a different variable name.`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
                // K121: Shadowing a built-in variable
                else if (
                    SHADOWABLE_BUILTINS.has(assign.name) &&
                    !ctx.declaredVars.has(assign.name)
                ) {
                    ctx.issues.push(
                        createKuriError('K121', {
                            message: `'${assign.name}' shadows the built-in price data variable. This hides the real ${assign.name} — use a different name like my_${assign.name} or ${assign.name}_val.`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }

                // K004: Duplicate var declaration
                if (assign.isVar) {
                    const existing = ctx.declaredVars.get(assign.name);
                    if (existing) {
                        ctx.issues.push(
                            createKuriError('K004', {
                                message: `'${assign.name}' was already created on line ${existing.line}. To change its value, use ${assign.name} := newValue (not var ${assign.name} = ...).`,
                                line: node.line || 1,
                                column: node.column || 1,
                            })
                        );
                    } else {
                        ctx.declaredVars.set(assign.name, {
                            line: node.line || 1,
                            column: node.column || 1,
                        });
                    }
                } else if (!ctx.declaredVars.has(assign.name) && !BUILTIN_VARS.has(assign.name)) {
                    ctx.declaredVars.set(assign.name, {
                        line: node.line || 1,
                        column: node.column || 1,
                    });
                }

                // K071: Self-assignment (x = x)
                if (assign.value?.type === 'Identifier' && assign.value?.name === assign.name) {
                    ctx.issues.push(
                        createKuriError('K071', {
                            message: `'${assign.name} = ${assign.name}' does nothing. Did you mean '${assign.name} = ${assign.name} + 1' or something else?`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }

                // Track if this variable is assigned from an input.* call
                if (assign.value?.type === 'CallExpression') {
                    const fn = resolveFuncName(assign.value);
                    if (fn.startsWith('input')) {
                        ctx.inputVars.add(assign.name);
                    }
                }
            }
            if (assign.value) walkNode(assign.value, ctx);
            break;
        }

        case 'CallExpression': {
            const call = node as any;
            const funcName = resolveFuncName(call);
            const args = call.arguments || [];
            const positionalCount = args.filter((a: any) => a.type !== 'CallArgument').length;
            const totalCount = args.length;

            // ── K110: Detect and count script type declarations
            if (funcName === 'indicator' || funcName === 'strategy') {
                ctx.declarationCount.value++;
                if (funcName === 'indicator') ctx.scriptType.value = 'indicator';
                if (funcName === 'strategy') ctx.scriptType.value = 'strategy';
            }

            // ── K080: Indicator using strategy functions
            if (
                ctx.scriptType.value === 'indicator' &&
                (funcName === 'strategy.entry' ||
                    funcName === 'strategy.close' ||
                    funcName === 'strategy.exit' ||
                    funcName === 'strategy.order' ||
                    funcName === 'strategy.exit_sl' ||
                    funcName === 'strategy.exit_tp' ||
                    funcName === 'strategy.cancel' ||
                    funcName === 'strategy.cancel_all' ||
                    funcName === 'strategy.close_all')
            ) {
                ctx.issues.push(
                    createKuriError('K080', {
                        message: `'${funcName}()' cannot be used in indicator scripts. Change your declaration to strategy("Name") or remove this call.`,
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }

            // ── Count plots
            if (
                [
                    'plot',
                    'plotLine',
                    'plotHistogram',
                    'plotArea',
                    'plotBand',
                    'plotHLine',
                    'plotCloud',
                    'plotColumns',
                    'plotMarkers',
                    'hline',
                    'plotcandle',
                    'plotbar',
                    'plotchar',
                ].includes(funcName)
            ) {
                ctx.plotCount.value++;
                if (ctx.inConditional) ctx.hasConditionalPlot.value = true;
            }

            // ── K062/K063: Zero or negative period in indicator functions
            const periodIdx = PERIOD_ARG_INDEX[funcName];
            if (periodIdx !== undefined && args.length > periodIdx) {
                const periodArg = args[periodIdx];
                if (periodArg?.type === 'Literal' && typeof periodArg.value === 'number') {
                    if (periodArg.value === 0) {
                        ctx.issues.push(
                            createKuriError('K062', {
                                message: `'${funcName}()' period cannot be 0 — this will cause a division by zero error. Use at least 1.`,
                                line: node.line || 1,
                                column: node.column || 1,
                            })
                        );
                    } else if (periodArg.value < 0) {
                        ctx.issues.push(
                            createKuriError('K063', {
                                message: `'${funcName}()' period cannot be negative (${periodArg.value}). Periods must be positive whole numbers.`,
                                line: node.line || 1,
                                column: node.column || 1,
                            })
                        );
                    }
                }
            }

            // ── K160: strategy.entry() not inside any condition
            if (funcName === 'strategy.entry' && !ctx.inConditional && !ctx.inLoop) {
                ctx.bareEntryCount.value++;
            }

            // ── Check argument count
            const spec = BUILTIN_ARG_COUNTS[funcName];
            if (spec) {
                if (totalCount < spec.min) {
                    ctx.issues.push(
                        createKuriError('K010', {
                            message: `'${funcName}()' requires at least ${spec.min} argument${spec.min > 1 ? 's' : ''}. Usage: ${spec.name}`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                } else if (positionalCount > spec.max && totalCount > spec.max) {
                    ctx.issues.push(
                        createKuriError('K011', {
                            message: `'${funcName}()' accepts at most ${spec.max} argument${spec.max > 1 ? 's' : ''}, got ${totalCount}. Usage: ${spec.name}`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
            }

            // ── Unknown function detection with typo suggestions
            if (
                funcName &&
                !ALL_KNOWN_FUNCTIONS.has(funcName) &&
                !ctx.declaredVars.has(funcName) &&
                !ctx.usedVars.has(funcName)
            ) {
                // Skip if it looks like a member access on a user variable (e.g., myLabel.set_text)
                const isNamespacedBuiltin =
                    funcName.includes('.') && BUILTIN_VARS.has(funcName.split('.')[0]);
                if (!isNamespacedBuiltin && !funcName.includes('.')) {
                    const suggestion = findClosestFunction(funcName);
                    const msg = suggestion
                        ? `Unknown function '${funcName}()'. Did you mean '${suggestion}()'?`
                        : `Unknown function '${funcName}()'. Check spelling or define it with 'func ${funcName}(...)'`;
                    ctx.issues.push(
                        createKuriError('K012', {
                            message: msg,
                            line: node.line || 1,
                            column: node.column || 1,
                            suggestion: suggestion || undefined,
                        })
                    );
                }
            }

            // ── Deprecated function warning
            const replacement = DEPRECATED_FUNCTIONS[funcName];
            if (replacement) {
                ctx.issues.push(
                    createKuriError('K013', {
                        message: `'${funcName}()' is deprecated. Use '${replacement}()' instead.`,
                        line: node.line || 1,
                        column: node.column || 1,
                        suggestion: replacement,
                    })
                );
            }

            // ── Wrong strategy direction
            if (funcName === 'strategy.entry' && args.length >= 2) {
                const dirArg = args[1];
                if (dirArg && dirArg.type === 'Literal' && typeof dirArg.value === 'string') {
                    const dir = dirArg.value;
                    if (dir !== 'LONG' && dir !== 'SHORT') {
                        ctx.issues.push(
                            createKuriError('K020', {
                                message: `strategy.entry() direction must be "LONG" or "SHORT", got "${dir}". Use uppercase.`,
                                line: node.line || 1,
                                column: node.column || 1,
                                suggestion:
                                    dir.toUpperCase() === 'LONG' || dir.toUpperCase() === 'SHORT'
                                        ? dir.toUpperCase()
                                        : 'LONG',
                            })
                        );
                    }
                }
                // Track entry IDs
                if (args[0] && args[0].type === 'Literal' && typeof args[0].value === 'string') {
                    ctx.entryIds.add(args[0].value);
                }
            }

            // ── Track strategy.close IDs
            if (funcName === 'strategy.close' && args.length >= 1) {
                if (args[0] && args[0].type === 'Literal' && typeof args[0].value === 'string') {
                    ctx.closeIds.add(args[0].value);
                }
            }

            // ── Duplicate input titles
            if (funcName.startsWith('input') && args.length >= 2) {
                const titleArg = args[1];
                if (titleArg && titleArg.type === 'Literal' && typeof titleArg.value === 'string') {
                    const title = titleArg.value;
                    const firstLine = ctx.inputTitles.get(title);
                    if (firstLine) {
                        ctx.issues.push(
                            createKuriError('K030', {
                                message: `Duplicate input title "${title}" (first defined at line ${firstLine}). Each input must have a unique title.`,
                                line: node.line || 1,
                                column: node.column || 1,
                            })
                        );
                    } else {
                        ctx.inputTitles.set(title, node.line || 1);
                    }
                }
            }

            // ── Input range validation: min > max, default out of range
            if ((funcName === 'input.int' || funcName === 'input.float') && args.length >= 4) {
                const defval = args[0]?.type === 'Literal' ? args[0].value : null;
                const minval = args[2]?.type === 'Literal' ? args[2].value : null;
                const maxval = args[3]?.type === 'Literal' ? args[3].value : null;
                if (typeof minval === 'number' && typeof maxval === 'number' && minval > maxval) {
                    ctx.issues.push(
                        createKuriError('K031', {
                            message: `Input min (${minval}) is greater than max (${maxval}). Swap the values.`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
                if (typeof defval === 'number' && typeof minval === 'number' && defval < minval) {
                    ctx.issues.push(
                        createKuriError('K032', {
                            message: `Input default value (${defval}) is less than minimum (${minval}).`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
                if (typeof defval === 'number' && typeof maxval === 'number' && defval > maxval) {
                    ctx.issues.push(
                        createKuriError('K033', {
                            message: `Input default value (${defval}) exceeds maximum (${maxval}).`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
            }

            // Walk args
            for (const arg of args) walkNode(arg, ctx);
            break;
        }

        case 'BinaryExpression': {
            const bin = node as any;

            // na == / != comparison
            if (bin.operator === '==' || bin.operator === '!=') {
                const leftIsNa = bin.left?.type === 'Literal' && bin.left?.value === null;
                const rightIsNa = bin.right?.type === 'Literal' && bin.right?.value === null;
                if (leftIsNa || rightIsNa) {
                    const op = bin.operator;
                    ctx.issues.push(
                        createKuriError('K040', {
                            message: `Comparing with 'na' using '${op}' is ${op === '==' ? 'always false' : 'always true'}. Use 'na(value)' function instead.`,
                            line: node.line || 1,
                            column: node.column || 1,
                            suggestion: 'na(value)',
                        })
                    );
                }
            }

            // K041: Division by zero
            if (bin.operator === '/' || bin.operator === '%') {
                if (bin.right?.type === 'Literal' && bin.right?.value === 0) {
                    ctx.issues.push(
                        createKuriError('K041', {
                            message: `Dividing by zero produces Infinity. This is probably a bug — use a variable or add a zero-check.`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
            }

            // K060: String in arithmetic operation
            if (['+', '-', '*', '/', '%'].includes(bin.operator)) {
                const leftIsString =
                    bin.left?.type === 'Literal' && typeof bin.left.value === 'string';
                const rightIsString =
                    bin.right?.type === 'Literal' && typeof bin.right.value === 'string';
                const leftIsNum =
                    bin.left?.type === 'Literal' && typeof bin.left.value === 'number';
                const rightIsNum =
                    bin.right?.type === 'Literal' && typeof bin.right.value === 'number';

                if ((leftIsString && rightIsNum) || (leftIsNum && rightIsString)) {
                    if (bin.operator !== '+') {
                        // string + number is sometimes intentional for concat
                        ctx.issues.push(
                            createKuriError('K060', {
                                message: `Cannot use '${bin.operator}' between a string and a number. This produces NaN. Use str.tostring() to convert or str.tonumber() to parse.`,
                                line: node.line || 1,
                                column: node.column || 1,
                            })
                        );
                    }
                }
            }

            // K150: Comparing different types (number == string)
            if (bin.operator === '==' || bin.operator === '!=') {
                const leftIsString =
                    bin.left?.type === 'Literal' && typeof bin.left.value === 'string';
                const rightIsString =
                    bin.right?.type === 'Literal' && typeof bin.right.value === 'string';
                const leftIsNum =
                    bin.left?.type === 'Literal' && typeof bin.left.value === 'number';
                const rightIsNum =
                    bin.right?.type === 'Literal' && typeof bin.right.value === 'number';

                if ((leftIsString && rightIsNum) || (leftIsNum && rightIsString)) {
                    ctx.issues.push(
                        createKuriError('K150', {
                            message: `Comparing a number with a string using '${bin.operator}' — this is always ${bin.operator === '==' ? 'false' : 'true'}. Check your types.`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
            }

            // Dead condition: if true, if false, if 1 > 0
            if (
                bin.operator === '>' ||
                bin.operator === '<' ||
                bin.operator === '>=' ||
                bin.operator === '<='
            ) {
                if (
                    bin.left?.type === 'Literal' &&
                    bin.right?.type === 'Literal' &&
                    typeof bin.left.value === 'number' &&
                    typeof bin.right.value === 'number'
                ) {
                    let result: boolean;
                    switch (bin.operator) {
                        case '>':
                            result = bin.left.value > bin.right.value;
                            break;
                        case '<':
                            result = bin.left.value < bin.right.value;
                            break;
                        case '>=':
                            result = bin.left.value >= bin.right.value;
                            break;
                        case '<=':
                            result = bin.left.value <= bin.right.value;
                            break;
                        default:
                            result = false;
                    }
                    ctx.issues.push(
                        createKuriError('K042', {
                            message: `Condition '${bin.left.value} ${bin.operator} ${bin.right.value}' is always ${result}. This may be a logic error.`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
            }

            walkNode(bin.left, ctx);
            walkNode(bin.right, ctx);
            break;
        }

        case 'IfStatement': {
            const ifStmt = node as any;

            // Dead condition: if true / if false (skip synthetic blocks from comma-separated statements)
            if (ifStmt.condition?.type === 'Literal' && !ifStmt.condition?._synthetic) {
                const val = ifStmt.condition.value;
                if (val === true || val === false) {
                    ctx.issues.push(
                        createKuriError('K043', {
                            message: `Condition is always ${val}. ${val ? 'The else branch will never execute.' : 'The if body will never execute.'}`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
            }

            // K070: Assignment in condition (if x = 5 instead of if x == 5)
            if (ifStmt.condition?.type === 'Assignment') {
                ctx.issues.push(
                    createKuriError('K070', {
                        message: `Looks like you used '=' (assignment) instead of '==' (comparison) in the if condition. Did you mean '==' ?`,
                        line: node.line || 1,
                        column: node.column || 1,
                        suggestion: '==',
                    })
                );
            }

            // K130: Empty if body
            const consequent = ifStmt.consequent || [];
            if (Array.isArray(consequent) && consequent.length === 0) {
                ctx.issues.push(
                    createKuriError('K130', {
                        message: `Empty if body — nothing happens when this condition is true. Add code inside or remove the if.`,
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }

            walkNode(ifStmt.condition, ctx);
            if (ifStmt.consequent)
                walkStatements(ifStmt.consequent, { ...ctx, inConditional: true });
            if (ifStmt.alternate) walkStatements(ifStmt.alternate, { ...ctx, inConditional: true });
            break;
        }

        case 'ForLoop': {
            const forLoop = node as any;

            // K051: For loop with start > end (check range-style for loops)
            if (
                forLoop.start?.type === 'Literal' &&
                forLoop.end?.type === 'Literal' &&
                typeof forLoop.start.value === 'number' &&
                typeof forLoop.end.value === 'number'
            ) {
                if (forLoop.start.value > forLoop.end.value) {
                    ctx.issues.push(
                        createKuriError('K051', {
                            message: `Loop starts at ${forLoop.start.value} but ends at ${forLoop.end.value} — the body will never execute. Swap the values.`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
            }

            // K052: Nested loop depth > 3
            if (ctx.loopDepth >= 3) {
                ctx.issues.push(
                    createKuriError('K052', {
                        message: `Deeply nested loop (depth ${ctx.loopDepth + 1}). This may hit the operations-per-bar limit and crash. Consider simplifying.`,
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }

            // K131: Empty loop body
            if (!forLoop.body || forLoop.body.length === 0) {
                ctx.issues.push(
                    createKuriError('K131', {
                        message: `Empty for loop body — nothing happens inside the loop. Add code or remove it.`,
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }

            if (forLoop.init) walkNode(forLoop.init, ctx);
            if (forLoop.condition) walkNode(forLoop.condition, ctx);
            if (forLoop.increment) walkNode(forLoop.increment, ctx);
            walkStatements(forLoop.body || [], {
                ...ctx,
                inLoop: true,
                loopDepth: ctx.loopDepth + 1,
            });
            break;
        }

        case 'WhileLoop': {
            const whileLoop = node as any;

            // Infinite loop detection: while true with no break
            if (whileLoop.condition?.type === 'Literal' && whileLoop.condition.value === true) {
                const body = whileLoop.body || [];
                const hasBreak = JSON.stringify(body).includes('"BreakStatement"');
                if (!hasBreak) {
                    ctx.issues.push(
                        createKuriError('K050', {
                            message: `Infinite loop: 'while true' with no 'break'. This will hit the runtime operation limit and crash.`,
                            line: node.line || 1,
                            column: node.column || 1,
                        })
                    );
                }
            }

            // K131: Empty while loop body
            if (!whileLoop.body || whileLoop.body.length === 0) {
                ctx.issues.push(
                    createKuriError('K131', {
                        message: `Empty while loop body — nothing happens inside the loop. Add code or remove it.`,
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }

            // K052: Nested loop depth
            if (ctx.loopDepth >= 3) {
                ctx.issues.push(
                    createKuriError('K052', {
                        message: `Deeply nested loop (depth ${ctx.loopDepth + 1}). This may hit the operations-per-bar limit and crash.`,
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }

            walkNode(whileLoop.condition, ctx);
            walkStatements(whileLoop.body || [], {
                ...ctx,
                inLoop: true,
                loopDepth: ctx.loopDepth + 1,
            });
            break;
        }

        case 'FunctionDefinition': {
            const funcDef = node as any;
            if (funcDef.name) {
                ctx.usedVars.add(funcDef.name);
                // Also mark as "known" for unknown function detection
                ALL_KNOWN_FUNCTIONS.add(funcDef.name);
            }
            for (const p of funcDef.params || []) {
                const paramName = typeof p === 'string' ? p : p.name;
                if (paramName) ctx.usedVars.add(paramName);
            }
            const funcCtx: WalkContext = {
                ...ctx,
                inFunction: true,
                inConditional: false,
                declaredVars: new Map(ctx.declaredVars),
            };
            walkStatements(funcDef.body || [], funcCtx);
            break;
        }

        case 'ArrayLiteral': {
            const arr = node as any;
            for (const el of arr.elements || []) walkNode(el, ctx);
            break;
        }

        case 'IndexExpression': {
            const idx = node as any;

            // K061: Negative array/history index
            if (
                idx.index?.type === 'Literal' &&
                typeof idx.index.value === 'number' &&
                idx.index.value < 0
            ) {
                ctx.issues.push(
                    createKuriError('K061', {
                        message: `Negative index [${idx.index.value}] is not valid. Use [${Math.abs(idx.index.value)}] to look back ${Math.abs(idx.index.value)} bars. Example: close[1] = previous bar.`,
                        line: node.line || 1,
                        column: node.column || 1,
                    })
                );
            }

            walkNode(idx.object, ctx);
            walkNode(idx.index, ctx);
            break;
        }

        case 'MemberExpression': {
            const mem = node as any;
            walkNode(mem.object, ctx);
            break;
        }

        case 'DestructuringAssignment': {
            const dest = node as any;
            if (dest.targets) {
                for (const target of dest.targets) {
                    if (!ctx.declaredVars.has(target)) {
                        ctx.declaredVars.set(target, {
                            line: node.line || 1,
                            column: node.column || 1,
                        });
                    }
                }
            }
            walkNode(dest.value, ctx);
            break;
        }

        case 'CallArgument': {
            const callArg = node as any;
            if (callArg.value) walkNode(callArg.value, ctx);
            break;
        }

        case 'ExportStatement': {
            const exp = node as any;
            if (exp.declaration) walkNode(exp.declaration, ctx);
            break;
        }

        case 'Identifier': {
            const id = node as any;
            if (id.name) ctx.usedVars.add(id.name);
            break;
        }

        case 'MatchStatement': {
            const match = node as any;
            if (match.subject) walkNode(match.subject, ctx);
            if (match.cases) {
                for (const c of match.cases) {
                    if (c.pattern) walkNode(c.pattern, ctx);
                    if (c.body) for (const stmt of c.body) walkNode(stmt, ctx);
                }
            }
            if (match.defaultCase) {
                for (const stmt of match.defaultCase) walkNode(stmt, ctx);
            }
            break;
        }

        // Leaf nodes
        case 'Literal':
        case 'StructDefinition':
        case 'LibraryDefinition':
        case 'ImportStatement':
            break;
    }
}

// ─── Helper: resolve function name from call node ──────────────────────────

function resolveFuncName(call: any): string {
    if (typeof call.callee === 'string') return call.callee;
    if (call.callee?.type === 'MemberExpression') {
        const obj = call.callee.object;
        const prop = call.callee.property;
        if (typeof obj === 'string' && typeof prop === 'string') return `${obj}.${prop}`;
        if (obj?.name && typeof prop === 'string') return `${obj.name}.${prop}`;
    }
    return '';
}
