// @insight/computation — Alert Evaluation (Pure Computation)
// Pure math for alert condition checking — no DB, no WebSocket.

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface AlertCheckResult {
    triggered: boolean;
    reason: string;
}

export interface PriceAlertInput {
    condition: string;  // 'ABOVE', 'BELOW', 'CROSSING_UP', 'CROSSING_DOWN', 'GREATER THAN', 'LESS THAN'
    price: number;      // Target price level
}

// ─────────────────────────────────────────────────────────────
// Price Alert Evaluation
// ─────────────────────────────────────────────────────────────

/**
 * Check if a price alert condition is met (pure computation).
 * Supports: ABOVE, BELOW, CROSSING_UP, CROSSING_DOWN, GREATER THAN, LESS THAN.
 */
export const checkPriceAlert = (
    alert: PriceAlertInput,
    currentPrice: number,
    previousPrice?: number
): AlertCheckResult => {
    const condition = alert.condition.toUpperCase();

    switch (condition) {
        case 'ABOVE':
        case 'GREATER THAN':
            if (currentPrice > alert.price) {
                return { triggered: true, reason: `Price ${currentPrice} is above ${alert.price}` };
            }
            break;

        case 'BELOW':
        case 'LESS THAN':
            if (currentPrice < alert.price) {
                return { triggered: true, reason: `Price ${currentPrice} is below ${alert.price}` };
            }
            break;

        case 'CROSSING_UP':
        case 'CROSSING UP':
            if (previousPrice !== undefined && previousPrice <= alert.price && currentPrice > alert.price) {
                return { triggered: true, reason: `Price crossed above ${alert.price}` };
            }
            break;

        case 'CROSSING_DOWN':
        case 'CROSSING DOWN':
            if (previousPrice !== undefined && previousPrice >= alert.price && currentPrice < alert.price) {
                return { triggered: true, reason: `Price crossed below ${alert.price}` };
            }
            break;

        case 'CROSSING':
            if (previousPrice !== undefined) {
                if (previousPrice <= alert.price && currentPrice > alert.price) {
                    return { triggered: true, reason: `Price crossed above ${alert.price}` };
                }
                if (previousPrice >= alert.price && currentPrice < alert.price) {
                    return { triggered: true, reason: `Price crossed below ${alert.price}` };
                }
            }
            break;
    }

    return { triggered: false, reason: '' };
};

// ─────────────────────────────────────────────────────────────
// Drawing Alert Math
// ─────────────────────────────────────────────────────────────

/**
 * Calculate the price on a trendline at a given time (linear interpolation).
 */
export const getTrendlinePrice = (
    point1: { time: number; price: number },
    point2: { time: number; price: number },
    atTime: number
): number | null => {
    const timeDiff = point2.time - point1.time;
    if (timeDiff === 0) return null;

    const slope = (point2.price - point1.price) / timeDiff;
    return point1.price + slope * (atTime - point1.time);
};

/**
 * Calculate the price range for a parallel channel at a given time.
 */
export const getChannelPriceRange = (
    topLine: { point1: { time: number; price: number }; point2: { time: number; price: number } },
    bottomLine: { point1: { time: number; price: number }; point2: { time: number; price: number } },
    atTime: number
): { min: number; max: number } | null => {
    const topPrice = getTrendlinePrice(topLine.point1, topLine.point2, atTime);
    const bottomPrice = getTrendlinePrice(bottomLine.point1, bottomLine.point2, atTime);

    if (topPrice === null || bottomPrice === null) return null;

    return {
        min: Math.min(topPrice, bottomPrice),
        max: Math.max(topPrice, bottomPrice)
    };
};

/**
 * Calculate Fibonacci retracement levels.
 */
export const getFibonacciLevels = (
    highPrice: number,
    lowPrice: number,
    levels: number[] = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
): { level: number; price: number }[] => {
    const range = highPrice - lowPrice;
    return levels.map(level => ({
        level,
        price: highPrice - range * level
    }));
};

/**
 * Check if price is within a rectangle's range.
 */
export const isInRectangleRange = (
    currentPrice: number,
    topPrice: number,
    bottomPrice: number
): { inside: boolean; aboveTop: boolean; belowBottom: boolean } => {
    return {
        inside: currentPrice >= bottomPrice && currentPrice <= topPrice,
        aboveTop: currentPrice > topPrice,
        belowBottom: currentPrice < bottomPrice
    };
};
