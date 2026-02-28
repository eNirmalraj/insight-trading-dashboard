// src/engine/expressionEvaluator.ts
// Re-exports from @insight/computation — single source of truth.
// This file preserved for backward compatibility of existing imports.

export {
    evaluateExpression,
    validateExpression,
} from '@insight/computation';

export type { EvaluationContext } from '@insight/computation';
