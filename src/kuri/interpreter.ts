import { ASTNode, Program, Assignment, BinaryExpression, CallExpression, Identifier, Literal } from './types';

// The Context holds the candle data arrays
export interface Context {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
    // User-defined variables are stored here too
    [key: string]: any;
}

export class Interpreter {
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    public run(ast: Program): any {
        let result: any = null;
        for (const statement of ast.body) {
            result = this.evaluate(statement);
        }
        return this.context; // Return the full context (variables)
    }

    private evaluate(node: ASTNode): any {
        switch (node.type) {
            case "Program":
                return this.run(node as Program);

            case "Assignment":
                const assign = node as Assignment;
                const value = this.evaluate(assign.value);
                this.context[assign.name] = value;
                return value;

            case "BinaryExpression":
                return this.evaluateBinary(node as BinaryExpression);

            case "CallExpression":
                return this.evaluateCall(node as CallExpression);

            case "Identifier":
                const id = node as Identifier;
                if (this.context[id.name] === undefined) {
                    throw new Error(`Undefined variable: ${id.name}`);
                }
                return this.context[id.name];

            case "Literal":
                return (node as Literal).value;

            default:
                throw new Error(`Unknown node type: ${node.type}`);
        }
    }

    private evaluateBinary(node: BinaryExpression): any {
        const left = this.evaluate(node.left);
        const right = this.evaluate(node.right);
        const op = node.operator;

        // Series Math (Vectorized Operations)
        // If either operand is an array (Series), acts element-wise or on the last element?
        // Kuri design choice: "Series" math. 
        // For simplicity v1: We operate on the *last* element (current candle) OR return a Series.
        // Let's go with "TradingView style": everything is a Series.
        // But implementing full vector math in JS arrays is slow without a library.
        // Optimization: We implement a helper `applyOp(left, right, op)`

        return this.applyOp(left, right, op);
    }

    private applyOp(left: any, right: any, op: string): any {
        // If both are numbers
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
                case 'and': return left && right;
                case 'or': return left || right;
            }
        }

        // If one is a Series (Array) and other is number
        // We handle this by taking the LAST value of the series for comparison (simplest for now)
        // OR we map the operation. Let's do the rigorous way: Map.

        const isLeftArray = Array.isArray(left);
        const isRightArray = Array.isArray(right);
        const length = isLeftArray ? left.length : (isRightArray ? right.length : 0);

        if (isLeftArray || isRightArray) {
            const result = new Array(length).fill(null);
            for (let i = 0; i < length; i++) {
                const l = isLeftArray ? left[i] : left;
                const r = isRightArray ? right[i] : right;

                // Handle nulls in series
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
                    // ... boolean ops return boolean array
                    case '==': result[i] = l === r; break;
                }
            }
            return result;
        }

        return null;
    }

    private evaluateCall(node: CallExpression): any {
        const args = node.arguments.map(arg => this.evaluate(arg));
        const funcName = node.callee.toLowerCase();

        switch (funcName) {
            case 'sma': return this.sma(args[0], args[1]);
            case 'ema': return this.ema(args[0], args[1]);
            case 'rsi': return this.rsi(args[0], args[1]);
            case 'crossover': return this.crossover(args[0], args[1]);
            case 'crossunder': return this.crossunder(args[0], args[1]);
            default: throw new Error(`Unknown function: ${funcName}`);
        }
    }

    // --- Built-in Functions ---
    // These match backend/server/src/engine/indicators.ts mostly

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
        let ema = source[period - 1]; // Simple initialization (approx) or use SMA

        // Proper init: SMA first
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
            // EMA = Price(t) * k + EMA(y) * (1 - k)
            const val = source[i] * k + prevEma * (1 - k);
            result.push(val);
            prevEma = val;
        }
        return result;
    }

    private rsi(source: number[], period: number): (number | null)[] {
        // ... (Simplified RSI implementation)
        // For brevity in this file, we can either copy pure implementation or import if possible.
        // Let's implement basic one.
        if (!source || source.length <= period) return Array(source.length).fill(null);

        const result: (number | null)[] = [];
        let avgGain = 0;
        let avgLoss = 0;

        // First calculation
        for (let i = 1; i <= period; i++) {
            const change = source[i] - source[i - 1];
            if (change > 0) avgGain += change;
            else avgLoss += Math.abs(change);
        }
        avgGain /= period;
        avgLoss /= period;

        // Push nulls
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
        // Returns boolean array where true means A crossed OVER B
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
