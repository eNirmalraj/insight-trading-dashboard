
/**
 * Exchange-Grade Risk Calculator
 * 
 * Implements advanced risk management logic:
 * 1. Fee-Aware Position Sizing (Risk = Loss + Fees)
 * 2. Minimum Stop Loss Validation (0.2% check)
 * 3. Liquidation Safety Checks (Futures)
 * 4. Slippage Buffers
 */

export class RiskCalculator {

    private static readonly TAKER_FEE_RATE = 0.0006; // 0.06% Taker Fee (Conservative avg for Binance/Bybit)
    private static readonly SLIPPAGE_BUFFER = 1.05;  // 5% Buffer on SL distance checks
    private static readonly MIN_SL_PERCENT = 0.002;  // 0.2% Min SL distance

    /**
     * Calculate Quantity considering explicit Risk Amount AND Fees.
     * 
     * Standard Formula: Qty = Risk / SL_Dist
     * Fee-Aware Formula:
     * Loss = Qty * SL_Dist
     * Fees = (Qty * Entry * Fee) + (Qty * SL * Fee)
     * Risk = Loss + Fees
     * Risk = Qty * (SL_Dist + Fee*(Entry + SL))
     * Qty = Risk / (SL_Dist + Fee*(Entry + SL))
     */
    public static calculateFeeAwareQty(
        riskAmount: number,
        entryPrice: number,
        stopLossPrice: number
    ): number {
        const slDistance = Math.abs(entryPrice - stopLossPrice);
        const feesPerUnit = (entryPrice + stopLossPrice) * this.TAKER_FEE_RATE;
        const denominator = slDistance + feesPerUnit;

        if (denominator <= 0) return 0; // Should not happen given valid inputs

        return riskAmount / denominator;
    }

    /**
     * Validates if the Stop Loss is wide enough.
     * Rejects "Micro-SL" which leads to massive position sizes and guaranteed slippage stops.
     */
    public static isStopLossValid(entryPrice: number, stopLossPrice: number): { isValid: boolean, reason?: string } {
        const slDistance = Math.abs(entryPrice - stopLossPrice);
        const slPercent = slDistance / entryPrice;

        if (slPercent < this.MIN_SL_PERCENT) {
            return {
                isValid: false,
                reason: `Stop Loss ${slPercent.toFixed(4)}% is too tight. Minimum ${this.MIN_SL_PERCENT * 100}% required.`
            };
        }
        return { isValid: true };
    }

    /**
     * Check if Liquidation Price is too close to Stop Loss.
     * SL should trigger BEFORE Liquidation with a safety buffer.
     * 
     * Liq Price Estimation (Isolated, Long): Entry * (1 - 1/Lev)
     * Liq Price Estimation (Isolated, Short): Entry * (1 + 1/Lev)
     */
    public static checkLiquidationSafety(
        entryPrice: number,
        stopLossPrice: number,
        leverage: number,
        direction: 'buy' | 'sell'
    ): { isSafe: boolean, liquidationPrice: number, reason?: string } {
        if (leverage <= 1) return { isSafe: true, liquidationPrice: 0 }; // Spot is safe

        let liquidationPrice = 0;

        // Simplified Maintenance Margin model (Maintenance Margin ~0.5%)
        // Real exchange logic is complex, but this is a safe approximation
        // Liq distance ~= Entry / Leverage

        if (direction === 'buy') {
            const liqDistance = entryPrice / leverage;
            liquidationPrice = entryPrice - liqDistance;

            // Check: SL must be HIGHER than Liq
            if (stopLossPrice <= liquidationPrice * this.SLIPPAGE_BUFFER) {
                return {
                    isSafe: false,
                    liquidationPrice,
                    reason: `Unsafe Leverage! Liquidation ($${liquidationPrice.toFixed(2)}) is too close to SL ($${stopLossPrice}).`
                };
            }
        } else {
            const liqDistance = entryPrice / leverage;
            liquidationPrice = entryPrice + liqDistance;

            // Check: SL must be LOWER than Liq
            if (stopLossPrice >= liquidationPrice / this.SLIPPAGE_BUFFER) {
                return {
                    isSafe: false,
                    liquidationPrice,
                    reason: `Unsafe Leverage! Liquidation ($${liquidationPrice.toFixed(2)}) is too close to SL ($${stopLossPrice}).`
                };
            }
        }

        return { isSafe: true, liquidationPrice };
    }
}
