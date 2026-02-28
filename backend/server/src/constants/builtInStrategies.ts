// backend/server/src/constants/builtInStrategies.ts
// Re-exports from shared packages — single source of truth.

export { TradeDirection, StrategyCategory, ExitType } from '@insight/types';
export type { ExitRule, BuiltInStrategy } from '@insight/types';
export { BUILT_IN_STRATEGIES } from '@insight/computation';
export default BUILT_IN_STRATEGIES;

// Re-import for the default export
import { BUILT_IN_STRATEGIES } from '@insight/computation';
