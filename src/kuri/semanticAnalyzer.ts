import { ASTNode, Program, Assignment, BinaryExpression, CallExpression, Identifier, Literal } from './types';
import {
    KuriDiagnostic,
    DiagnosticCollection,
    DiagnosticTemplates,
    DiagnosticBuilder,
    ErrorCode,
    DiagnosticSeverity
} from './diagnostics';

/**
 * Validation Result Interface
 * Returned by the semantic analyzer after validation
 */
export interface ValidationResult {
    valid: boolean;
    diagnostics: DiagnosticCollection;
}

/**
 * Semantic Analyzer for Kuri Language
 * 
 * Enforces language constraints and validates AST before execution:
 * - Blocks forbidden constructs (loops, user-defined functions, async)
 * - Validates function calls against whitelist
 * - Checks variable scoping and undefined references
 * - Type checking for series vs scalar operations
 * 
 * Now with Pine Script-style diagnostics!
 */
export class SemanticAnalyzer {
    private diagnostics: DiagnosticCollection = new DiagnosticCollection();
    private definedVariables: Set<string> = new Set();

    /**
     * Whitelist of allowed built-in functions
     * Any function call not in this list will be rejected
     */
    private allowedFunctions: Set<string> = new Set([
        // Technical indicators
        'sma',
        'ema',
        'rsi',
        'crossover',
        'crossunder',
        // NEW: Extended Built-in Indicators
        'macd', 'macd_signal', 'macd_hist',
        'bb_upper', 'bb_lower', // bb_middle is just sma
        'stoch_k', 'stoch_d',
        'supertrend',
        'vwap',
        'cci',
        'mfi',
        'obv',

        // Visualization (Frontend VM)
        'plot',
        'plotshape',
        'bgcolor',
        // Strategy functions (Backend VM)
        'strategy.entry',
        'strategy.close'
    ]);

    // ... (rest of class)

    /**
     * Validate function call signatures
     */
    private validateFunctionSignature(funcName: string, args: ASTNode[], line: number, col: number): void {
        // Define expected argument counts for each function
        const signatures: { [key: string]: { min: number; max: number } } = {
            'sma': { min: 2, max: 2 },       // sma(source, period)
            'ema': { min: 2, max: 2 },       // ema(source, period)
            'rsi': { min: 2, max: 2 },       // rsi(source, period)
            'crossover': { min: 2, max: 2 }, // crossover(seriesA, seriesB)
            'crossunder': { min: 2, max: 2 },// crossunder(seriesA, seriesB)

            // NEW Indicators
            'macd': { min: 4, max: 4 },        // macd(source, fast, slow, signal)
            'macd_signal': { min: 4, max: 4 }, // macd_signal(source, fast, slow, signal)
            'macd_hist': { min: 4, max: 4 },   // macd_hist(source, fast, slow, signal)

            'bb_upper': { min: 3, max: 3 },    // bb_upper(source, period, mult)
            'bb_lower': { min: 3, max: 3 },    // bb_lower(source, period, mult)

            'stoch_k': { min: 6, max: 6 },     // stoch_k(h, l, c, kPer, dPer, slow)
            'stoch_d': { min: 6, max: 6 },     // stoch_d(h, l, c, kPer, dPer, slow)

            'supertrend': { min: 5, max: 5 },  // supertrend(h, l, c, period, mult)

            'vwap': { min: 4, max: 4 },        // vwap(h, l, c, v)
            'cci': { min: 4, max: 4 },         // cci(h, l, c, period)
            'mfi': { min: 5, max: 5 },         // mfi(h, l, c, v, period)
            'obv': { min: 2, max: 2 },         // obv(close, volume)

            'plot': { min: 1, max: 3 },      // plot(series, title?, color?)
            'strategy.entry': { min: 3, max: 5 }, // strategy.entry(id, direction, condition, sl?, tp?)
            'strategy.close': { min: 2, max: 2 }  // strategy.close(id, condition)
        };

        const sig = signatures[funcName];
        if (!sig) return; // Unknown function (already caught)

        const argCount = args.length;

        if (argCount < sig.min || argCount > sig.max) {
            const expected = sig.min === sig.max
                ? sig.min
                : sig.max;

            this.diagnostics.add(
                DiagnosticTemplates.wrongArgCount(funcName, expected, argCount, line, col)
            );
        }
    }
}
