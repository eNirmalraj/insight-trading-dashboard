import {
    IR,
    IRProgram,
    IRAssign,
    IRBinaryOp,
    IRCall,
    IRVar,
    IRConst
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

        return {
            context: this.context,
            signals: this.signals,
            variables: { ...this.context }
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

        // Otherwise, execute built-in indicator functions
        const args = node.args.map(arg => this.executeNode(arg as IR));

        switch (funcName) {
            case 'sma': return this.sma(args[0], args[1]);
            case 'ema': return this.ema(args[0], args[1]);
            case 'rsi': return this.rsi(args[0], args[1]);
            case 'crossover': return this.crossover(args[0], args[1]);
            case 'crossunder': return this.crossunder(args[0], args[1]);
            default: throw new Error(`Unknown function: ${funcName}`);
        }
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

        // Only trigger if condition is true
        if (condition === true) {
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

        // Only trigger if condition is true
        if (condition === true) {
            this.signals.push({
                type: 'EXIT',
                id,
                price: this.context.close![this.currentIndex],
                timestamp: this.currentIndex
            });
        }
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
}
