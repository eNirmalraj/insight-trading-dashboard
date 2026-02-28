// @insight/computation — Expression Evaluator (Pure Computation)
// Safely evaluates indicator alert expressions without eval().
// Moved from src/engine/expressionEvaluator.ts — already was pure computation.

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface EvaluationContext {
    /** Current indicator values: { rsi_line: 65, fast_ma: 1.234 } */
    indicatorValues: Record<string, number | null>;
    /** Current candle OHLCV */
    priceData: {
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number;
    };
    /** Previous indicator values (for crossover detection) */
    previousIndicatorValues?: Record<string, number | null>;
    /** Previous candle OHLC */
    previousPriceData?: {
        open: number;
        high: number;
        low: number;
        close: number;
    };
    /** User-defined parameters: { level: 70 } */
    parameters?: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────
// Main Evaluator
// ─────────────────────────────────────────────────────────────

/**
 * Evaluates a simple expression like "rsi_line > 70" or "crossover(fast_ma, slow_ma)".
 * Supports: comparisons (>, <, >=, <=, ==, !=), crossover(), crossunder(), crosses().
 */
export const evaluateExpression = (expression: string, context: EvaluationContext): boolean => {
    try {
        // Step 1: Replace {param} placeholders
        let processedExpr = expression;
        if (context.parameters) {
            for (const [key, value] of Object.entries(context.parameters)) {
                const placeholder = `{${key}}`;
                processedExpr = processedExpr.replace(
                    new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
                    String(value)
                );
            }
        }

        // Step 2: Handle special functions
        if (processedExpr.includes('crossover(')) {
            return handleCrossover(processedExpr, context, 'up');
        }
        if (processedExpr.includes('crossunder(')) {
            return handleCrossover(processedExpr, context, 'down');
        }
        if (processedExpr.includes('crosses(')) {
            return handleCrossover(processedExpr, context, 'any');
        }

        // Step 3: Evaluate comparison
        return evaluateComparison(processedExpr, context);
    } catch (error) {
        console.error('[ExpressionEvaluator] Error:', error, 'Expression:', expression);
        return false;
    }
};

// ─────────────────────────────────────────────────────────────
// Crossover Detection
// ─────────────────────────────────────────────────────────────

/**
 * Handle crossover/crossunder/crosses functions.
 */
export const handleCrossover = (
    expression: string,
    context: EvaluationContext,
    direction: 'up' | 'down' | 'any'
): boolean => {
    const match = expression.match(/(crossover|crossunder|crosses)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
    if (!match) return false;

    const [, , var1, var2] = match;
    const var1Name = var1.trim();
    const var2Name = var2.trim();

    const current1 = getValue(var1Name, context);
    const current2 = getValue(var2Name, context);
    const prev1 = getPreviousValue(var1Name, context);
    const prev2 = getPreviousValue(var2Name, context);

    if (current1 === null || current2 === null || prev1 === null || prev2 === null) {
        return false;
    }

    const wasBelow = prev1 <= prev2;
    const isAbove = current1 > current2;
    const wasAbove = prev1 >= prev2;
    const isBelow = current1 < current2;

    if (direction === 'up') return wasBelow && isAbove;
    if (direction === 'down') return wasAbove && isBelow;
    return (wasBelow && isAbove) || (wasAbove && isBelow);
};

// ─────────────────────────────────────────────────────────────
// Comparison Evaluation
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate comparison: "rsi_line > 70", "close >= slow_ma", etc.
 */
export const evaluateComparison = (expression: string, context: EvaluationContext): boolean => {
    const operators = ['>=', '<=', '==', '!=', '>', '<'];
    let matchedOp: string | null = null;
    let left = '';
    let right = '';

    for (const op of operators) {
        if (expression.includes(op)) {
            const parts = expression.split(op);
            if (parts.length === 2) {
                matchedOp = op;
                left = parts[0].trim();
                right = parts[1].trim();
                break;
            }
        }
    }

    if (!matchedOp) {
        console.warn('[ExpressionEvaluator] No operator found in:', expression);
        return false;
    }

    const leftValue = getValue(left, context);
    const rightValue = getValue(right, context);

    if (leftValue === null || rightValue === null) return false;

    switch (matchedOp) {
        case '>': return leftValue > rightValue;
        case '<': return leftValue < rightValue;
        case '>=': return leftValue >= rightValue;
        case '<=': return leftValue <= rightValue;
        case '==': return leftValue === rightValue;
        case '!=': return leftValue !== rightValue;
        default: return false;
    }
};

// ─────────────────────────────────────────────────────────────
// Value Resolution
// ─────────────────────────────────────────────────────────────

/**
 * Get current value from context (indicator, price, or literal number).
 */
export const getValue = (varName: string, context: EvaluationContext): number | null => {
    const asNumber = parseFloat(varName);
    if (!isNaN(asNumber)) return asNumber;

    if (context.indicatorValues[varName] !== undefined) return context.indicatorValues[varName];

    if (varName === 'open') return context.priceData.open;
    if (varName === 'high') return context.priceData.high;
    if (varName === 'low') return context.priceData.low;
    if (varName === 'close') return context.priceData.close;
    if (varName === 'volume') return context.priceData.volume ?? null;

    console.warn('[ExpressionEvaluator] Unknown variable:', varName);
    return null;
};

/**
 * Get previous value for crossover detection.
 */
export const getPreviousValue = (varName: string, context: EvaluationContext): number | null => {
    if (context.previousIndicatorValues?.[varName] !== undefined) {
        return context.previousIndicatorValues[varName];
    }

    if (context.previousPriceData) {
        if (varName === 'open') return context.previousPriceData.open;
        if (varName === 'high') return context.previousPriceData.high;
        if (varName === 'low') return context.previousPriceData.low;
        if (varName === 'close') return context.previousPriceData.close;
    }

    return null;
};

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

/**
 * Validate expression syntax (basic safety check).
 */
export const validateExpression = (expression: string): { valid: boolean; error?: string } => {
    if (!expression || expression.trim() === '') {
        return { valid: false, error: 'Expression is empty' };
    }

    const dangerousPatterns = [
        /eval\s*\(/,
        /Function\s*\(/,
        /setTimeout/,
        /setInterval/,
        /import\s+/,
        /require\s*\(/,
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(expression)) {
            return { valid: false, error: 'Expression contains forbidden keywords' };
        }
    }

    return { valid: true };
};
