// src/engine/expressionEvaluator.ts
// Expression evaluator for indicator alert conditions
// Safely evaluates simple expressions without using eval()

export interface EvaluationContext {
    indicatorValues: Record<string, number | null>; // Current values: { rsi_line: 65, fast_ma: 1.234 }
    priceData: {
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number;
    };
    previousIndicatorValues?: Record<string, number | null>; // For crossover detection
    previousPriceData?: {
        open: number;
        high: number;
        low: number;
        close: number;
    };
    parameters?: Record<string, any>; // User params: { level: 70 }
}

/**
 * Evaluates a simple expression like "rsi_line > 70" or "crossover(fast_ma, slow_ma)"
 * IMPORTANT: This is NOT a full expression parser. It supports a limited safe subset.
 */
export const evaluateExpression = (expression: string, context: EvaluationContext): boolean => {
    try {
        // Step 1: Replace {param} placeholders with actual values
        let processedExpr = expression;
        if (context.parameters) {
            for (const [key, value] of Object.entries(context.parameters)) {
                const placeholder = `{${key}}`;
                processedExpr = processedExpr.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
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

        // Step 3: Evaluate simple comparison
        return evaluateComparison(processedExpr, context);
    } catch (error) {
        console.error('[ExpressionEvaluator] Error:', error, 'Expression:', expression);
        return false;
    }
};

/**
 * Handle crossover functions: crossover(a, b), crossunder(a, b), crosses(a, b)
 */
const handleCrossover = (
    expression: string,
    context: EvaluationContext,
    direction: 'up' | 'down' | 'any'
): boolean => {
    // Extract function arguments
    const match = expression.match(/(crossover|crossunder|crosses)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
    if (!match) return false;

    const [, , var1, var2] = match;
    const var1Name = var1.trim();
    const var2Name = var2.trim();

    // Get current values
    const current1 = getValue(var1Name, context);
    const current2 = getValue(var2Name, context);

    // Get previous values
    const prev1 = getPreviousValue(var1Name, context);
    const prev2 = getPreviousValue(var2Name, context);

    if (current1 === null || current2 === null || prev1 === null || prev2 === null) {
        return false; // Can't evaluate crossover without all values
    }

    // Detect crossover
    const wasBelow = prev1 <= prev2;
    const isAbove = current1 > current2;
    const wasAbove = prev1 >= prev2;
    const isBelow = current1 < current2;

    if (direction === 'up') {
        return wasBelow && isAbove; // Crossed up
    } else if (direction === 'down') {
        return wasAbove && isBelow; // Crossed down
    } else {
        return (wasBelow && isAbove) || (wasAbove && isBelow); // Either direction
    }
};

/**
 * Evaluate simple comparison: "rsi_line > 70", "close >= slow_ma", etc.
 */
const evaluateComparison = (expression: string, context: EvaluationContext): boolean => {
    // Extract operator and operands
    const operators = ['>=', '<=', '==', '!=', '>', '<'];
    let matchedOp: string | null = null;
    let left: string = '';
    let right: string = '';

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

    // Get values
    const leftValue = getValue(left, context);
    const rightValue = getValue(right, context);

    if (leftValue === null || rightValue === null) {
        return false; // Can't compare null values
    }

    // Perform comparison
    switch (matchedOp) {
        case '>':
            return leftValue > rightValue;
        case '<':
            return leftValue < rightValue;
        case '>=':
            return leftValue >= rightValue;
        case '<=':
            return leftValue <= rightValue;
        case '==':
            return leftValue === rightValue;
        case '!=':
            return leftValue !== rightValue;
        default:
            return false;
    }
};

/**
 * Get current value from context (indicator, price, or literal number)
 */
const getValue = (varName: string, context: EvaluationContext): number | null => {
    // Try as literal number
    const asNumber = parseFloat(varName);
    if (!isNaN(asNumber)) {
        return asNumber;
    }

    // Try as indicator value
    if (context.indicatorValues[varName] !== undefined) {
        return context.indicatorValues[varName];
    }

    // Try as price data
    if (varName === 'open') return context.priceData.open;
    if (varName === 'high') return context.priceData.high;
    if (varName === 'low') return context.priceData.low;
    if (varName === 'close') return context.priceData.close;
    if (varName === 'volume') return context.priceData.volume ?? null;

    console.warn('[ExpressionEvaluator] Unknown variable:', varName);
    return null;
};

/**
 * Get previous value for crossover detection
 */
const getPreviousValue = (varName: string, context: EvaluationContext): number | null => {
    // Try as indicator value
    if (context.previousIndicatorValues && context.previousIndicatorValues[varName] !== undefined) {
        return context.previousIndicatorValues[varName];
    }

    // Try as previous price data
    if (context.previousPriceData) {
        if (varName === 'open') return context.previousPriceData.open;
        if (varName === 'high') return context.previousPriceData.high;
        if (varName === 'low') return context.previousPriceData.low;
        if (varName === 'close') return context.previousPriceData.close;
    }

    return null;
};

/**
 * Validate expression syntax (basic check)
 */
export const validateExpression = (expression: string): { valid: boolean; error?: string } => {
    if (!expression || expression.trim() === '') {
        return { valid: false, error: 'Expression is empty' };
    }

    // Check for dangerous patterns (prevent code injection)
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
