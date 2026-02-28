// backend/server/src/services/riskManager.ts
// Risk Manager — Delegates to @insight/computation for pure risk checks.

import { checkTradeRisk } from '@insight/computation';
import type { RiskDecision, RiskConfig } from '@insight/computation';

// Re-export types for backward compatibility
export type { RiskDecision, RiskConfig };

/**
 * RiskManager — Stateful wrapper around @insight/computation's pure checkTradeRisk.
 * Maintains daily PnL and exposure state; delegates math to shared package.
 */
export class RiskManager {
    private config: RiskConfig = {
        MAX_DAILY_LOSS: 5000,
        MAX_SYMBOL_EXPOSURE: 0.25,
        MAX_VOLATILITY: 0.05,
        MAX_POSITION_SIZE: 10000
    };

    private dailyPnL: number = 0;
    private symbolExposure: Map<string, number> = new Map();

    /**
     * Check if a trade is allowed based on risk rules.
     * Uses @insight/computation pure function with current state.
     */
    checkTrade(trade: { symbol: string; quantity: number; price: number }): RiskDecision {
        return checkTradeRisk(trade, {
            dailyPnL: this.dailyPnL,
            symbolExposure: this.symbolExposure,
            totalCapital: this.getTotalCapital()
        }, this.config);
    }

    updateDailyPnL(pnl: number): void {
        this.dailyPnL += pnl;
    }

    resetDaily(): void {
        this.dailyPnL = 0;
    }

    private getTotalCapital(): number {
        return 100000; // TODO: Implement portfolio value calculation
    }
}

export const riskManager = new RiskManager();
