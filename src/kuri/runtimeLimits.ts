/**
 * Kuri v1 Runtime Safety Limits
 * 
 * Configurable limits to protect VM execution without changing language semantics.
 */

export const RUNTIME_LIMITS = {
    /** Maximum IR operations per bar execution (prevents infinite loops) */
    MAX_OPERATIONS_PER_BAR: 10_000,

    /** Maximum series length in bars (prevents excessive memory usage) */
    MAX_SERIES_LENGTH: 100_000,

    /** Maximum strategy.entry() calls per bar */
    MAX_STRATEGY_ENTRY_CALLS_PER_BAR: 10,

    /** Maximum strategy.close() calls per bar */
    MAX_STRATEGY_CLOSE_CALLS_PER_BAR: 10,

    /** Maximum execution time per bar in milliseconds */
    MAX_EXECUTION_TIME_PER_BAR_MS: 5000,

    /** Maximum total execution time for entire script in milliseconds */
    MAX_TOTAL_EXECUTION_TIME_MS: 30_000,
} as const;

/**
 * Runtime Limit Error
 * Thrown when a safety limit is exceeded during execution
 */
export class RuntimeLimitError extends Error {
    constructor(message: string) {
        super(`RuntimeError: ${message}`);
        this.name = 'RuntimeLimitError';
    }
}
