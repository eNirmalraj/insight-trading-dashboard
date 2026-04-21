// backend/server/src/services/positionSizer.ts
// Shared position sizing for all brokers. Paper broker uses the simple
// lotSize × leverage from Phase 0; live brokers use this calculator.

export type SizingMode = 'fixed_notional' | 'risk_pct' | 'risk_fixed' | 'fixed_qty';

export interface SizingInput {
    mode: SizingMode;
    notional?: number;      // for fixed_notional (USDT)
    riskPct?: number;       // for risk_pct (e.g. 1 = 1%)
    riskFixed?: number;     // for risk_fixed (USDT)
    fixedQty?: number;      // for fixed_qty (base asset units)
    leverage: number;
    entryPrice: number;
    stopLoss: number;
    balance: number;        // available quote balance in USDT
}

export function computeQty(input: SizingInput): number {
    if (input.entryPrice <= 0) throw new Error('entryPrice must be positive');
    const stopDistance = Math.abs(input.entryPrice - input.stopLoss);

    switch (input.mode) {
        case 'fixed_notional': {
            if (!input.notional || input.notional <= 0) throw new Error('notional must be positive');
            return (input.notional * input.leverage) / input.entryPrice;
        }
        case 'risk_pct': {
            if (!input.riskPct || input.riskPct <= 0) throw new Error('riskPct must be positive');
            if (stopDistance === 0) throw new Error('stopDistance cannot be 0 for risk_pct');
            if (input.balance <= 0) throw new Error('balance must be positive for risk_pct');
            return (input.balance * input.riskPct / 100) / stopDistance;
        }
        case 'risk_fixed': {
            if (!input.riskFixed || input.riskFixed <= 0) throw new Error('riskFixed must be positive');
            if (stopDistance === 0) throw new Error('stopDistance cannot be 0 for risk_fixed');
            return input.riskFixed / stopDistance;
        }
        case 'fixed_qty': {
            if (!input.fixedQty || input.fixedQty <= 0) throw new Error('fixedQty must be positive');
            return input.fixedQty;
        }
    }
}
