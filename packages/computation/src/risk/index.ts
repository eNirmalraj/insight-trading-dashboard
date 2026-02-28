// @insight/computation — Risk Module Barrel Export
export {
    calculateFeeAwareQty,
    isStopLossValid,
    checkLiquidationSafety,
    checkTradeRisk,
} from './calculator';

export type {
    StopLossValidation,
    LiquidationSafety,
    RiskDecision,
    RiskConfig,
} from './calculator';
