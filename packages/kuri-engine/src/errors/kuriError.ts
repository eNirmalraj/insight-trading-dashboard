// packages/kuri-engine/src/errors/kuriError.ts

export type ErrorSeverity = 'error' | 'warning' | 'info';

export type ErrorCategory =
    | 'syntax'
    | 'type'
    | 'semantic'
    | 'structure'
    | 'runtime'
    | 'limit'
    | 'security';

export interface KuriError {
    code: string;
    message: string;
    severity: ErrorSeverity;
    category: ErrorCategory;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    suggestion?: string;
}

// Backwards-compat alias — remove after all consumers migrate
export type KuriDiagnostic = KuriError;

import { ERROR_REGISTRY } from './errorRegistry';

/**
 * Factory function for creating KuriError objects.
 * Reads defaults (severity, category) from the ERROR_REGISTRY.
 * Ensures all required fields are set with safe defaults.
 *
 * No circular dependency: errorRegistry.ts only imports TYPES from this file
 * (type-only imports are erased at compile time in ESM).
 */
export function createKuriError(
    code: string,
    overrides: Partial<KuriError> & { message: string }
): KuriError {
    const def = ERROR_REGISTRY[code];

    const line = overrides.line ?? 1;
    const column = overrides.column ?? 1;

    return {
        code,
        message: overrides.message,
        severity: overrides.severity ?? def?.severity ?? 'error',
        category: overrides.category ?? def?.category ?? 'runtime',
        line,
        column,
        endLine: overrides.endLine ?? line,
        endColumn: overrides.endColumn ?? column + 1,
        suggestion: overrides.suggestion,
    };
}
