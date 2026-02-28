// src/constants/builtInStrategies.ts
// Re-exports from shared package — single source of truth.

import { BUILT_IN_STRATEGIES } from '@insight/computation';
import { Strategy, StrategyCategory } from '../types';

// Re-export the shared strategies adapted to frontend's Strategy type
export const FRONTEND_BUILT_IN_STRATEGIES: Strategy[] = BUILT_IN_STRATEGIES.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: 'STRATEGY' as const,
    category: s.category as StrategyCategory,
    symbolScope: [],
    timeframe: '1H',
    isActive: true,
    indicators: s.indicators || [],
    entryRules: s.entryRules || [],
    exitRules: s.exitRules || [],
    parameters: [],
    content: {}
}));

// Backward-compatible default export
export const BUILT_IN_STRATEGIES_FRONTEND = FRONTEND_BUILT_IN_STRATEGIES;
export { BUILT_IN_STRATEGIES } from '@insight/computation';
