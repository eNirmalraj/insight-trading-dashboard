import {
    IR,
    IRProgram,
    IRAssign,
    IRBinaryOp,
    IRCall,
    IRVar,
    IRConst,
    IRIndex
} from './ir';
import { RUNTIME_LIMITS, RuntimeLimitError } from './runtimeLimits';

/**
 * Context interface (same as frontend)
 */
export interface Context {
    [key: string]: any;
    open?: number[];
    high?: number[];
    low?: number[];
    close?: number[];
    volume?: number[];
}

/**
 * Strategy Signal
 * Output of strategy.entry() and strategy.close() functions
 */
export interface StrategySignal {
    type: 'ENTRY' | 'EXIT';
    direction?: 'LONG' | 'SHORT';
    id: string;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    timestamp: number;
}

/**
 * Backend VM Output
 * The result of executing a Kuri strategy script
 */
export interface BackendVMOutput {
    context: Context;
    signals: StrategySignal[];
    variables: { [key: string]: any };
    stopLoss?: number;
    takeProfit?: number;
}

/**
 * Backend VM
 * 
 * Executes Kuri IR for signal generation.
 * - Supports strategy.entry() for trade signals
 * - Supports strategy.close() for exit signals
 * - Returns buy/sell signals with TP/SL
 * - Optimized for server-side execution
 */
export class BackendVM {
    private context: Context;
    private signals: StrategySignal[] = [];
    private currentIndex: number = 0;
    private stopLoss: number | undefined;
    private takeProfit: number | undefined;

    // State for Rising Edge Detection
    private strategyState: Map<string, boolean> = new Map();

    // Runtime safety counters
    private operationCount = 0;
    private strategyEntryCount = 0;
    private strategyCloseCount = 0;
    private scriptStartTime = 0;

    constructor(context: Context) {
        this.context = context;
    }

    /**
     * Execute IR Program and return signals
     */
    public run(ir: IRProgram): BackendVMOutput {
        // Check series length limit
        const seriesLength = this.context.close?.length || 0;
        if (seriesLength > RUNTIME_LIMITS.MAX_SERIES_LENGTH) {
            throw new RuntimeLimitError(
                `Series length exceeds maximum (${RUNTIME_LIMITS.MAX_SERIES_LENGTH} bars)`
            );
        }

        // Initialize execution timer
        this.scriptStartTime = Date.now();

        // Reset signals
        this.signals = [];
        this.strategyState.clear();

        // Execute for each candle (bar-by-bar execution)
        for (let i = 0; i < seriesLength; i++) {
            this.currentIndex = i;

            // Reset per-bar counters
            this.operationCount = 0;
            this.strategyEntryCount = 0;
            this.strategyCloseCount = 0;

            // Execute all statements for this bar
            for (const statement of ir.statements) {
                this.executeNode(statement as IR);
            }

            // Check total execution time
            const totalElapsed = Date.now() - this.scriptStartTime;
            if (totalElapsed > RUNTIME_LIMITS.MAX_TOTAL_EXECUTION_TIME_MS) {
                throw new RuntimeLimitError(
                    `Total execution time limit exceeded (${RUNTIME_LIMITS.MAX_TOTAL_EXECUTION_TIME_MS}ms)`
                );
            }
        }

        // Finalize output
        return {
            context: this.context,
            signals: this.signals,
            variables: { ...this.context },
            stopLoss: this.stopLoss,
            takeProfit: this.takeProfit
        };
    }

    /**
     * Execute individual IR node
     */
    private executeNode(node: IR): any {
        // Check operation limit
        this.operationCount++;
        if (this.operationCount > RUNTIME_LIMITS.MAX_OPERATIONS_PER_BAR) {
            throw new RuntimeLimitError(
                `Maximum operations per bar exceeded (${RUNTIME_LIMITS.MAX_OPERATIONS_PER_BAR})`
            );
        }

        switch (node.type) {
            case 'IR_PROGRAM':
                return this.run(node as IRProgram);

            case 'IR_ASSIGN':
                return this.executeAssign(node as IRAssign);

            case 'IR_BINARY_OP':
                return this.executeBinaryOp(node as IRBinaryOp);

            case 'IR_CALL':
                return this.executeCall(node as IRCall);

            case 'IR_VAR':
                return this.executeVar(node as IRVar);

            case 'IR_CONST':
                return (node as IRConst).value;

            case 'IR_INDEX':
                return this.executeIndex(node);

            default:
                throw new Error(`Unknown IR node type: ${(node as any).type}`);
        }
    }

    /**
     * Execute Assignment
     */
    private executeAssign(node: IRAssign): void {
        const value = this.executeNode(node.value as IR);
        this.context[node.name] = value;
    }

    /**
     * Execute Binary Operation
     */
    private executeBinaryOp(node: IRBinaryOp): any {
        const left = this.executeNode(node.left as IR);
        const right = this.executeNode(node.right as IR);

        return this.applyOp(left, right, node.operator);
    }

    /**
     * Apply binary operation (vectorized - returns series)
     * Aligned with Frontend VM semantics
     */
    private applyOp(left: any, right: any, op: string): any {
        // Scalar operations (both scalars)
        if (typeof left === 'number' && typeof right === 'number') {
            switch (op) {
                case '+': return left + right;
                case '-': return left - right;
                case '*': return left * right;
                case '/': return left / right;
                case '>': return left > right;
                case '<': return left < right;
                case '==': return left === right;
                case '>=': return left >= right;
                case '<=': return left <= right;
                case '!=': return left !== right;
                case 'and': return left && right;
                case 'or': return left || right;
            }
        }

        // Series operations (vectorized - at least one operand is a series)
        const isLeftArray = Array.isArray(left);
        const isRightArray = Array.isArray(right);
        const length = isLeftArray ? left.length : (isRightArray ? right.length : 0);

        if (isLeftArray || isRightArray) {
            const result = new Array(length).fill(null);
            for (let i = 0; i < length; i++) {
                const l = isLeftArray ? left[i] : left;
                const r = isRightArray ? right[i] : right;

                if (l === null || r === null) {
                    result[i] = null;
                    continue;
                }

                switch (op) {
                    case '+': result[i] = l + r; break;
                    case '-': result[i] = l - r; break;
                    case '*': result[i] = l * r; break;
                    case '/': result[i] = l / r; break;
                    case '>': result[i] = l > r; break;
                    case '<': result[i] = l < r; break;
                    case '==': result[i] = l === r; break;
                    case '!=': result[i] = l !== r; break;
                    case '>=': result[i] = l >= r; break;
                    case '<=': result[i] = l <= r; break;
                    case 'and': result[i] = l && r; break;
                    case 'or': result[i] = l || r; break;
                }
            }
            return result;
        }

        return null;
    }

    /**
     * Execute Function Call
     */
    private executeCall(node: IRCall): any {
        const funcName = node.func.toLowerCase();

        // Check for strategy functions
        if (funcName === 'strategy.entry') {
            return this.strategyEntry(node.args);
        }
        if (funcName === 'strategy.close') {
            return this.strategyClose(node.args);
        }
        if (funcName === 'strategy.exit_sl') {
            return this.strategyExitSL(node.args);
        }
        if (funcName === 'strategy.exit_tp') {
            return this.strategyExitTP(node.args);
        }

        // Otherwise, execute built-in indicator functions
        const args = node.args.map(arg => this.executeNode(arg as IR));

        switch (funcName) {
            case 'sma': return this.sma(args[0], args[1]);
            case 'ema': return this.ema(args[0], args[1]);
            case 'rsi': return this.rsi(args[0], args[1]);
            case 'rsi': return this.rsi(args[0], args[1]);
            case 'crossover': return this.crossover(args[0], args[1]);
            case 'crossunder': return this.crossunder(args[0], args[1]);
            // V2 Indicators
            case 'macd': return this.macd(args[0], args[1], args[2], args[3]);
            case 'bollinger': return this.bollinger(args[0], args[1], args[2]);
            case 'atr': return this.atr(args[0]);
            case 'supertrend': return this.supertrend(args[0], args[1]);
            // Visuals
            case 'plot': return this.plot(args[0], args[1], args[2]);
            default: throw new Error(`Unknown function: ${funcName}`);
        }
    }

    private plot(series: any, title?: string, color?: string): void {
        // For BackendVM, we currently don't use the plots for signaling.
        // But we should support the function call to prevent crashes.
        // We could store them if we want to return them for debugging/backtesting.
        return;
    }

    /**
     * Execute Variable Reference
     */
    private executeVar(node: IRVar): any {
        if (this.context[node.name] === undefined) {
            throw new Error(`Undefined variable: ${node.name}`);
        }
        return this.context[node.name];
    }

    /**
     * Execute Index Expression (History Access)
     */
    private executeIndex(node: any): any {
        // node is IRIndex
        const obj = this.executeNode(node.object);
        const indexVal = this.executeNode(node.index);

        if (!Array.isArray(obj)) {
            throw new Error('Index access only supported on arrays/series');
        }

        if (typeof indexVal !== 'number') {
            throw new Error('Index must be a number');
        }

        // Kuri V2 History Access: obj[1] means "previous value"
        // So we access obj[currentIndex - indexVal]
        const targetIndex = this.currentIndex - indexVal;

        if (targetIndex < 0 || targetIndex >= obj.length) {
            return null; // Return null for out of bounds (e.g. before start of data)
        }

        return obj[targetIndex];
    }

    /**
     * strategy.entry() function - NEW!
     * strategy.entry(id, direction, condition, stopLoss?, takeProfit?)
     */
    private strategyEntry(args: IR[]): void {
        if (args.length < 3) {
            throw new Error('strategy.entry() expects at least 3 arguments: entry(id, direction, condition)');
        }

        const id = String(this.executeNode(args[0] as IR));
        const direction = String(this.executeNode(args[1] as IR)).toUpperCase() as 'LONG' | 'SHORT';
        const condition = this.executeNode(args[2] as IR);

        // Rising Edge Detection
        const currentCondition = Array.isArray(condition)
            ? !!condition[this.currentIndex]
            : !!condition;

        const prevState = this.strategyState.get(id) || false;

        if (currentCondition && !prevState) {
            const signal: StrategySignal = {
                type: 'ENTRY',
                direction,
                id,
                price: this.context.close![this.currentIndex],
                timestamp: this.currentIndex
            };

            // Optional stop loss and take profit
            if (args.length >= 4) {
                signal.stopLoss = Number(this.executeNode(args[3] as IR));
            }
            if (args.length >= 5) {
                signal.takeProfit = Number(this.executeNode(args[4] as IR));
            }

            this.signals.push(signal);
        }

        // Update state
        this.strategyState.set(id, currentCondition);
    }

    /**
     * strategy.close() function - NEW!
     * strategy.close(id, condition)
     */
    private strategyClose(args: IR[]): void {
        if (args.length < 2) {
            throw new Error('strategy.close() expects 2 arguments: close(id, condition)');
        }

        const id = String(this.executeNode(args[0] as IR));
        const condition = this.executeNode(args[1] as IR);

        // Only trigger if condition is true (vectorized)
        const currentCondition = Array.isArray(condition)
            ? !!condition[this.currentIndex]
            : !!condition;

        if (currentCondition) {
            this.signals.push({
                type: 'EXIT',
                id,
                price: this.context.close![this.currentIndex],
                timestamp: this.currentIndex
            });
        }
    }

    /**
     * strategy.exit_sl() - Set default stop loss
     */
    private strategyExitSL(args: IR[]): void {
        if (args.length < 1) return;
        this.stopLoss = Number(this.executeNode(args[0] as IR));
    }

    /**
     * strategy.exit_tp() - Set default take profit
     */
    private strategyExitTP(args: IR[]): void {
        if (args.length < 1) return;
        this.takeProfit = Number(this.executeNode(args[0] as IR));
    }

    // --- Built-in Functions (same as Frontend VM) ---

    private sma(source: number[], period: number): (number | null)[] {
        if (!source || source.length < period) return [];
        const result: (number | null)[] = [];
        for (let i = 0; i < source.length; i++) {
            if (i < period - 1) {
                result.push(null);
                continue;
            }
            let sum = 0;
            for (let j = 0; j < period; j++) sum += source[i - j];
            result.push(sum / period);
        }
        return result;
    }

    private ema(source: number[], period: number): (number | null)[] {
        if (!source || source.length < period) return [];
        const result: (number | null)[] = [];
        const k = 2 / (period + 1);

        let sum = 0;
        for (let j = 0; j < period; j++) sum += source[period - 1 - j];
        let prevEma = sum / period;

        for (let i = 0; i < source.length; i++) {
            if (i < period - 1) {
                result.push(null);
                continue;
            }
            if (i === period - 1) {
                result.push(prevEma);
                continue;
            }
            const val = source[i] * k + prevEma * (1 - k);
            result.push(val);
            prevEma = val;
        }
        return result;
    }

    private rsi(source: number[], period: number): (number | null)[] {
        if (!source || source.length <= period) return Array(source.length).fill(null);

        const result: (number | null)[] = [];
        let avgGain = 0;
        let avgLoss = 0;

        for (let i = 1; i <= period; i++) {
            const change = source[i] - source[i - 1];
            if (change > 0) avgGain += change;
            else avgLoss += Math.abs(change);
        }
        avgGain /= period;
        avgLoss /= period;

        for (let k = 0; k < period; k++) result.push(null);

        let rs = avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));

        for (let i = period + 1; i < source.length; i++) {
            const change = source[i] - source[i - 1];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            if (avgLoss === 0) {
                result.push(100);
            } else {
                rs = avgGain / avgLoss;
                result.push(100 - (100 / (1 + rs)));
            }
        }
        return result;
    }

    private crossover(seriesA: number[], seriesB: number[]): boolean[] {
        const result = new Array(seriesA.length).fill(false);
        for (let i = 1; i < seriesA.length; i++) {
            const aCurr = seriesA[i];
            const bCurr = seriesB[i];
            const aPrev = seriesA[i - 1];
            const bPrev = seriesB[i - 1];

            if (aPrev <= bPrev && aCurr > bCurr) {
                result[i] = true;
            }
        }
        return result;
    }

    private crossunder(seriesA: number[], seriesB: number[]): boolean[] {
        const result = new Array(seriesA.length).fill(false);
        for (let i = 1; i < seriesA.length; i++) {
            const aCurr = seriesA[i];
            const bCurr = seriesB[i];
            const aPrev = seriesA[i - 1];
            const bPrev = seriesB[i - 1];

            if (aPrev >= bPrev && aCurr < bCurr) {
                result[i] = true;
            }
        }
        return result;
    }

    // --- V2 Standard Library ---

    private macd(source: number[], fastLen: number, slowLen: number, signalLen: number): (number | null)[] {
        const fastMA = this.ema(source, fastLen);
        const slowMA = this.ema(source, slowLen);
        const macdLine: (number | null)[] = [];

        for (let i = 0; i < source.length; i++) {
            if (fastMA[i] === null || slowMA[i] === null) macdLine.push(null);
            else macdLine.push(fastMA[i]! - slowMA[i]!);
        }

        return macdLine;
    }

    private bollinger(source: number[], period: number, stdDevMult: number): (number | null)[] {
        const sma = this.sma(source, period);
        const upper: (number | null)[] = [];

        for (let i = 0; i < source.length; i++) {
            if (sma[i] === null) {
                upper.push(null);
                continue;
            }

            let sumSqDiff = 0;
            let count = 0;
            for (let j = 0; j < period; j++) {
                if (i - j >= 0) {
                    const diff = source[i - j] - sma[i]!;
                    sumSqDiff += diff * diff;
                    count++;
                }
            }
            const stdev = Math.sqrt(sumSqDiff / count);
            upper.push(sma[i]! + stdev * stdDevMult);
        }
        return upper;
    }

    private atr(period: number): (number | null)[] {
        const high = this.context.high || [];
        const low = this.context.low || [];
        const close = this.context.close || [];

        if (high.length < period) return [];

        const tr: number[] = [0];
        for (let i = 1; i < high.length; i++) {
            const val1 = high[i] - low[i];
            const val2 = Math.abs(high[i] - close[i - 1]);
            const val3 = Math.abs(low[i] - close[i - 1]);
            tr.push(Math.max(val1, val2, val3));
        }

        return this.sma(tr, period);
    }

    private supertrend(period: number, multiplier: number): (number | null)[] {
        const atr = this.atr(period);
        const high = this.context.high!;
        const low = this.context.low!;
        const close = this.context.close!;

        const supertrend: (number | null)[] = [];
        let trend = 1;
        let upperBandBasic = 0;
        let lowerBandBasic = 0;
        let upperBand = 0;
        let lowerBand = 0;

        for (let i = 0; i < close.length; i++) {
            if (atr[i] === null) {
                supertrend.push(null);
                continue;
            }

            const hl2 = (high[i] + low[i]) / 2;
            upperBandBasic = hl2 + multiplier * atr[i]!;
            lowerBandBasic = hl2 - multiplier * atr[i]!;

            if (i > 0) {
                upperBand = (upperBandBasic < upperBand || close[i - 1] > upperBand) ? upperBandBasic : upperBand;
                lowerBand = (lowerBandBasic > lowerBand || close[i - 1] < lowerBand) ? lowerBandBasic : lowerBand;

                let prevTrend = trend;
                if (prevTrend === 1) {
                    if (close[i] < lowerBand) trend = -1;
                } else {
                    if (close[i] > upperBand) trend = 1;
                }
            } else {
                upperBand = upperBandBasic;
                lowerBand = lowerBandBasic;
            }

            supertrend.push(trend === 1 ? lowerBand : upperBand);
        }

        return supertrend;
    }
}
