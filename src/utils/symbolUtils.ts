
/**
 * specific precision rules for crypto symbols.
 * In a real app, this would be fetched from the exchange API (e.g. GET /api/v3/exchangeInfo).
 * For now, we use a static map for major pairs and safe defaults for others.
 */

export interface SymbolPrecision {
    stepSize: number; // For Quantity (e.g. 0.001 BTC)
    tickSize: number; // For Price (e.g. 0.01 USDT)
    minQty: number;   // Minimum order quantity
}

export const DEFAULT_PRECISION: SymbolPrecision = {
    stepSize: 0.0001,
    tickSize: 0.01,
    minQty: 0.0001
};

// Hardcoded defaults for top pairs to make paper trading realistic
export const SYMBOL_PRECISION_MAP: Record<string, SymbolPrecision> = {
    'BTCUSDT': { stepSize: 0.001, tickSize: 0.01, minQty: 0.001 },
    'ETHUSDT': { stepSize: 0.01, tickSize: 0.01, minQty: 0.01 },
    'SOLUSDT': { stepSize: 1, tickSize: 0.01, minQty: 1 },
    'BNBUSDT': { stepSize: 0.01, tickSize: 0.1, minQty: 0.01 },
    'XRPUSDT': { stepSize: 1, tickSize: 0.0001, minQty: 10 },
    'ADAUSDT': { stepSize: 1, tickSize: 0.0001, minQty: 10 },
    'DOGEUSDT': { stepSize: 1, tickSize: 0.00001, minQty: 10 },
    'DOTUSDT': { stepSize: 0.1, tickSize: 0.001, minQty: 1 },
    'LTCUSDT': { stepSize: 0.001, tickSize: 0.01, minQty: 0.001 },
    'MATICUSDT': { stepSize: 1, tickSize: 0.0001, minQty: 10 },
};

export class SymbolUtils {

    /**
     * Get precision settings for a symbol.
     * Returns hardcoded defaults if not found.
     */
    public static getPrecision(symbol: string): SymbolPrecision {
        // Normalize symbol (remove / - etc if needed, though usually standard is BTCUSDT)
        const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '');
        return SYMBOL_PRECISION_MAP[cleanSymbol] || DEFAULT_PRECISION;
    }

    /**
     * Round a quantity to the nearest stepSize.
     * Use Math.floor to avoid rounding up which might exceed balance.
     * Example: qty=1.23456, step=0.01 => 1.23
     */
    public static applyStepSize(quantity: number, stepSize: number): number {
        if (stepSize === 0) return quantity;

        // Inverse to avoid floating point issues (e.g. 1/0.0001 = 10000)
        const inverse = 1 / stepSize;
        return Math.floor(quantity * inverse) / inverse;
    }

    /**
     * Round a price to the nearest tickSize.
     * Use Math.round for prices (SL/TP).
     */
    public static applyTickSize(price: number, tickSize: number): number {
        if (tickSize === 0) return price;

        const inverse = 1 / tickSize;
        return Math.round(price * inverse) / inverse;
    }
}
