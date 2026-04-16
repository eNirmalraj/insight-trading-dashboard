/**
 * RiskManager
 * Enterprise risk controls for trading operations
 */

export interface RiskDecision {
    allowed: boolean;
    reason?: string;
}

export interface RiskConfig {
    MAX_DAILY_LOSS: number; // USD
    MAX_SYMBOL_EXPOSURE: number; // % of total capital
    MAX_VOLATILITY: number; // ATR threshold
    MAX_POSITION_SIZE: number; // USD
}

export class RiskManager {
    private config: RiskConfig = {
        MAX_DAILY_LOSS: 5000,
        MAX_SYMBOL_EXPOSURE: 0.25, // 25%
        MAX_VOLATILITY: 0.05, // 5% ATR
        MAX_POSITION_SIZE: 10000,
    };

    private dailyPnL: number = 0;
    private symbolExposure: Map<string, number> = new Map();

    /**
     * Check if a trade is allowed based on risk rules
     */
    checkTrade(trade: { symbol: string; quantity: number; price: number }): RiskDecision {
        // 1. Daily loss limit
        if (this.dailyPnL < -this.config.MAX_DAILY_LOSS) {
            return {
                allowed: false,
                reason: 'Daily loss limit reached',
            };
        }

        // 2. Position size limit
        const tradeValue = trade.quantity * trade.price;
        if (tradeValue > this.config.MAX_POSITION_SIZE) {
            return {
                allowed: false,
                reason: 'Position size exceeds limit',
            };
        }

        // 3. Symbol concentration limit
        const currentExposure = this.symbolExposure.get(trade.symbol) || 0;
        const newExposure = currentExposure + tradeValue;
        const totalCapital = this.getTotalCapital();

        if (newExposure / totalCapital > this.config.MAX_SYMBOL_EXPOSURE) {
            return {
                allowed: false,
                reason: 'Symbol exposure limit exceeded',
            };
        }

        return { allowed: true };
    }

    /**
     * Update daily PnL
     */
    updateDailyPnL(pnl: number): void {
        this.dailyPnL += pnl;
    }

    /**
     * Reset daily counters (call at start of each trading day)
     */
    resetDaily(): void {
        this.dailyPnL = 0;
    }

    /**
     * Get total capital across all positions
     */
    private getTotalCapital(): number {
        // TODO: Implement portfolio value calculation
        return 100000; // Mock value
    }
}

export const riskManager = new RiskManager();
