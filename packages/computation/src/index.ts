// @insight/computation — Main Barrel Export
// Single import point for all shared computation modules.
//
// Usage:
//   import { evaluateStrategy } from '@insight/computation';
//   import { checkPriceAlert } from '@insight/computation';
//   import { calculateFeeAwareQty } from '@insight/computation';
//   import { sma, ema, rsi } from '@insight/computation';

// Strategy Evaluation
export {
    evaluateStrategy,
    evaluateEntryRule,
    getSeries,
    calculateStopLoss,
    calculateTakeProfit,
    calculateRiskLevels,
    resolveStopLoss,
    resolveTakeProfit,
    BUILT_IN_STRATEGIES,
} from './strategy';

export type {
    StrategyEvaluationResult,
    ExitRule,
    RiskSettings,
    StrategyInput,
} from './strategy';

// Alert Evaluation
export {
    checkPriceAlert,
    getTrendlinePrice,
    getChannelPriceRange,
    getFibonacciLevels,
    isInRectangleRange,
} from './alert';

export type { AlertCheckResult, PriceAlertInput } from './alert';

// Expression Evaluation
export {
    evaluateExpression,
    handleCrossover,
    evaluateComparison,
    getValue,
    getPreviousValue,
    validateExpression,
} from './expression';

export type { EvaluationContext } from './expression';

// Risk Calculation
export {
    calculateFeeAwareQty,
    isStopLossValid,
    checkLiquidationSafety,
    checkTradeRisk,
} from './risk';

export type {
    StopLossValidation,
    LiquidationSafety,
    RiskDecision,
    RiskConfig,
} from './risk';

// Signal Status Evaluation
export {
    evaluateSignalAtPrice,
    evaluateSignalAtCandle,
    checkEntryTrigger,
    calculatePnlPercent,
} from './signal';

export type { SignalInput, SignalStatusResult } from './signal';

// Trading Math
export {
    calculatePositionSize,
    calculateRiskAmount,
    calculateRiskRewardRatio,
    calculatePnlUsd,
    calculateROE,
    getTimeframeSeconds,
    normalizeSymbol,
    isSymbolInScope,
    TIMEFRAME_SECONDS,
} from './math';

// Indicators (Pure Math)
export * from './indicators';
