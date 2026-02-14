import {
    IR,
    IRProgram,
    IRAssign,
    IRBinaryOp,
    IRCall,
    IRVar,
    IRConst
} from './ir';

import { Context } from './interpreter';

/**
 * IR Interpreter
 * 
 * Executes optimized Intermediate Representation.
 * Simpler and faster than AST interpretation due to pre-optimization.
 */
export class IRInterpreter {
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    /**
     * Execute IR Program
     */
    public run(ir: IRProgram): Context {
        for (const statement of ir.statements) {
            this.executeNode(statement as IR);
        }
        return this.context;
    }

    /**
     * Execute individual IR node
     */
    private executeNode(node: IR): any {
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
     * Apply binary operation (same logic as Interpreter)
     */
    private applyOp(left: any, right: any, op: string): any {
        // Scalar operations
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

        // Series operations (vectorized)
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
        const args = node.args.map(arg => this.executeNode(arg as IR));
        const funcName = node.func.toLowerCase();

        // Delegate to built-in functions
        // (Import from interpreter or re-implement here)
        switch (funcName) {
            case 'sma': return this.sma(args[0], args[1]);
            case 'ema': return this.ema(args[0], args[1]);
            case 'rsi': return this.rsi(args[0], args[1]);
            case 'crossover': return this.crossover(args[0], args[1]);
            case 'crossunder': return this.crossunder(args[0], args[1]);

            // NEW Indicators
            case 'macd': return this.macd(args[0], args[1], args[2], args[3]).macdLine;
            case 'macd_signal': return this.macd(args[0], args[1], args[2], args[3]).signalLine;
            case 'macd_hist': return this.macd(args[0], args[1], args[2], args[3]).histogram;

            case 'bb_upper': return this.bollinger_bands(args[0], args[1], args[2]).upper;
            case 'bb_lower': return this.bollinger_bands(args[0], args[1], args[2]).lower;

            case 'stoch_k': return this.stoch(args[0], args[1], args[2], args[3], args[4], args[5]).k;
            case 'stoch_d': return this.stoch(args[0], args[1], args[2], args[3], args[4], args[5]).d;

            case 'supertrend': return this.supertrend(args[0], args[1], args[2], args[3], args[4]);

            case 'vwap': return this.vwap(args[0], args[1], args[2], args[3]);
            case 'cci': return this.cci(args[0], args[1], args[2], args[3]);
            case 'mfi': return this.mfi(args[0], args[1], args[2], args[3], args[4]);
            case 'obv': return this.obv(args[0], args[1]);

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

    // --- Built-in Functions (copied from Interpreter) ---

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
    // --- Extended Built-in Indicators ---

    private macd(source: number[], fastLen: number, slowLen: number, sigLen: number): { macdLine: (number | null)[], signalLine: (number | null)[], histogram: (number | null)[] } {
        const fastEMA = this.ema(source, fastLen);
        const slowEMA = this.ema(source, slowLen);
        const macdLine: (number | null)[] = [];

        for (let i = 0; i < source.length; i++) {
            if (fastEMA[i] === null || slowEMA[i] === null) {
                macdLine.push(null);
            } else {
                macdLine.push((fastEMA[i] as number) - (slowEMA[i] as number));
            }
        }

        const signalLine = this.calculateEmaSafe(macdLine, sigLen);
        const histogram: (number | null)[] = [];

        for (let i = 0; i < source.length; i++) {
            if (macdLine[i] === null || signalLine[i] === null) {
                histogram.push(null);
            } else {
                histogram.push((macdLine[i] as number) - (signalLine[i] as number));
            }
        }

        return { macdLine, signalLine, histogram };
    }

    private bollinger_bands(source: number[], period: number, mult: number): { upper: (number | null)[], middle: (number | null)[], lower: (number | null)[] } {
        const middle = this.sma(source, period);
        const upper: (number | null)[] = [];
        const lower: (number | null)[] = [];

        for (let i = 0; i < source.length; i++) {
            if (middle[i] === null) {
                upper.push(null);
                lower.push(null);
                continue;
            }

            let sumSq = 0;
            let count = 0;
            for (let j = 0; j < period; j++) {
                const val = source[i - j];
                sumSq += Math.pow(val - (middle[i] as number), 2);
            }
            const stdDev = Math.sqrt(sumSq / period);
            upper.push((middle[i] as number) + stdDev * mult);
            lower.push((middle[i] as number) - stdDev * mult);
        }

        return { upper, middle, lower };
    }

    private stoch(high: number[], low: number[], close: number[], kPeriod: number, dPeriod: number, slowing: number): { k: (number | null)[], d: (number | null)[] } {
        const rawK: (number | null)[] = [];

        for (let i = 0; i < close.length; i++) {
            if (i < kPeriod - 1) {
                rawK.push(null);
                continue;
            }

            let highest = -Infinity;
            let lowest = Infinity;

            for (let j = 0; j < kPeriod; j++) {
                if (high[i - j] > highest) highest = high[i - j];
                if (low[i - j] < lowest) lowest = low[i - j];
            }

            const kVal = highest === lowest ? 50 : ((close[i] - lowest) / (highest - lowest)) * 100;
            rawK.push(kVal);
        }

        const smoothK = this.calculateSmaSafe(rawK, slowing);
        const d = this.calculateSmaSafe(smoothK, dPeriod);

        return { k: smoothK, d };
    }

    private supertrend(high: number[], low: number[], close: number[], period: number, multiplier: number): (number | null)[] {
        const tr: number[] = [];
        for (let i = 0; i < close.length; i++) {
            if (i === 0) {
                tr.push(high[i] - low[i]);
            } else {
                const hl = high[i] - low[i];
                const hc = Math.abs(high[i] - close[i - 1]);
                const lc = Math.abs(low[i] - close[i - 1]);
                tr.push(Math.max(hl, hc, lc));
            }
        }

        const atr = this.calculateRma(tr, period);

        const supertrend: (number | null)[] = new Array(close.length).fill(null);
        let trend = 1;
        let upperBand = 0;
        let lowerBand = 0;

        for (let i = 0; i < close.length; i++) {
            if (atr[i] === null) continue;

            const distinctAtr = atr[i] as number;
            const src = (high[i] + low[i]) / 2;
            const basicUpper = src + (multiplier * distinctAtr);
            const basicLower = src - (multiplier * distinctAtr);

            if (i === 0 || supertrend[i - 1] === null) {
                upperBand = basicUpper;
                lowerBand = basicLower;
                supertrend[i] = basicUpper;
                continue;
            }

            const prevUpper = upperBand;
            const prevLower = lowerBand;
            const prevClose = close[i - 1];

            if (basicUpper < prevUpper || prevClose > prevUpper) {
                upperBand = basicUpper;
            } else {
                upperBand = prevUpper;
            }

            if (basicLower > prevLower || prevClose < prevLower) {
                lowerBand = basicLower;
            } else {
                lowerBand = prevLower;
            }

            if (trend === 1) {
                if (close[i] < lowerBand) {
                    trend = -1;
                    supertrend[i] = upperBand;
                } else {
                    supertrend[i] = lowerBand;
                }
            } else {
                if (close[i] > upperBand) {
                    trend = 1;
                    supertrend[i] = lowerBand;
                } else {
                    supertrend[i] = upperBand;
                }
            }
        }

        return supertrend;
    }

    private vwap(high: number[], low: number[], close: number[], volume: number[]): (number | null)[] {
        const result: (number | null)[] = [];
        let sumSrcVol = 0;
        let sumVol = 0;

        for (let i = 0; i < close.length; i++) {
            const src = (high[i] + low[i] + close[i]) / 3;
            const vol = volume[i];

            sumSrcVol += src * vol;
            sumVol += vol;

            if (sumVol === 0) result.push(src);
            else result.push(sumSrcVol / sumVol);
        }
        return result;
    }

    private cci(high: number[], low: number[], close: number[], period: number): (number | null)[] {
        const tp: number[] = [];
        for (let i = 0; i < close.length; i++) tp.push((high[i] + low[i] + close[i]) / 3);

        const smaTp = this.calculateSmaSafe(tp, period);
        const result: (number | null)[] = [];

        for (let i = 0; i < close.length; i++) {
            if (smaTp[i] === null) {
                result.push(null);
                continue;
            }

            let meanDev = 0;
            for (let j = 0; j < period; j++) {
                meanDev += Math.abs(tp[i - j] - (smaTp[i] as number));
            }
            meanDev /= period;

            if (meanDev === 0) result.push(0);
            else result.push((tp[i] - (smaTp[i] as number)) / (0.015 * meanDev));
        }
        return result;
    }

    private mfi(high: number[], low: number[], close: number[], volume: number[], period: number): (number | null)[] {
        const tp: number[] = [];
        for (let i = 0; i < close.length; i++) tp.push((high[i] + low[i] + close[i]) / 3);

        const result: (number | null)[] = [];

        for (let i = 0; i < close.length; i++) {
            if (i < period) {
                result.push(null);
                continue;
            }

            let posFlow = 0;
            let negFlow = 0;

            for (let j = 0; j < period; j++) {
                const currIdx = i - j;
                const prevIdx = i - j - 1;

                if (tp[currIdx] > tp[prevIdx]) posFlow += tp[currIdx] * volume[currIdx];
                else if (tp[currIdx] < tp[prevIdx]) negFlow += tp[currIdx] * volume[currIdx];
            }

            if (negFlow === 0) result.push(100);
            else {
                const mr = posFlow / negFlow;
                result.push(100 - (100 / (1 + mr)));
            }
        }
        return result;
    }

    private obv(close: number[], volume: number[]): (number | null)[] {
        const result: (number | null)[] = [];
        let currentObv = 0;
        result.push(currentObv);

        for (let i = 1; i < close.length; i++) {
            if (close[i] > close[i - 1]) currentObv += volume[i];
            else if (close[i] < close[i - 1]) currentObv -= volume[i];
            result.push(currentObv);
        }
        return result;
    }

    // --- Helpers ---

    private calculateSmaSafe(data: (number | null)[], period: number): (number | null)[] {
        const result: (number | null)[] = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
                continue;
            }
            let sum = 0;
            let count = 0;
            for (let j = 0; j < period; j++) {
                const val = data[i - j];
                if (val !== null) {
                    sum += val;
                    count++;
                }
            }
            if (count > 0) result.push(sum / count);
            else result.push(null);
        }
        return result;
    }

    private calculateEmaSafe(data: (number | null)[], period: number): (number | null)[] {
        const result: (number | null)[] = [];
        const k = 2 / (period + 1);
        let prevEma: number | null = null;
        let firstValidIdx = -1;

        for (let i = 0; i < data.length; i++) {
            if (data[i] !== null && firstValidIdx === -1) firstValidIdx = i;
        }

        if (firstValidIdx === -1) return new Array(data.length).fill(null);

        for (let i = 0; i < firstValidIdx; i++) result.push(null);

        let sum = 0;
        if (data.length - firstValidIdx < period) return new Array(data.length).fill(null);

        for (let i = 0; i < period; i++) sum += (data[firstValidIdx + i] as number);
        prevEma = sum / period;

        for (let i = 0; i < period - 1; i++) result.push(null);
        result.push(prevEma);

        for (let i = firstValidIdx + period; i < data.length; i++) {
            const val = data[i];
            if (val !== null && prevEma !== null) {
                const curr = val * k + prevEma * (1 - k);
                result.push(curr);
                prevEma = curr;
            } else {
                result.push(null);
                // prevEma = null; // Keep prevEma? Or reset? Std EMA usually spans gaps.
            }
        }

        // Ensure length match by simple padding check (simplified from complex logic)
        while (result.length < data.length) result.push(null);
        return result.slice(0, data.length);
    }

    private calculateRma(data: number[], period: number): (number | null)[] {
        const result: (number | null)[] = [];
        const alpha = 1 / period;
        let prevVal: number | null = null;

        for (let i = 0; i < data.length; i++) {
            const val = data[i];
            if (i < period - 1) {
                result.push(null);
                continue;
            }

            if (prevVal === null) {
                let sum = 0;
                for (let j = 0; j < period; j++) sum += data[i - j];
                prevVal = sum / period;
                result.push(prevVal);
            } else {
                prevVal = alpha * val + (1 - alpha) * prevVal;
                result.push(prevVal);
            }
        }
        return result;
    }

}
