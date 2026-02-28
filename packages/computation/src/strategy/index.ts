// @insight/computation — Strategy Module Barrel Export
export {
    evaluateStrategy,
    evaluateEntryRule,
    getSeries,
} from './evaluator';

export type {
    StrategyEvaluationResult,
    ExitRule,
    RiskSettings,
    StrategyInput,
} from './evaluator';

export {
    calculateStopLoss,
    calculateTakeProfit,
    calculateRiskLevels,
    resolveStopLoss,
    resolveTakeProfit,
} from './riskLevels';

export { BUILT_IN_STRATEGIES } from './builtInStrategies';
