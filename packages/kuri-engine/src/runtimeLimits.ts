/**
 * Kuri v1 Runtime Safety Limits
 *
 * Configurable limits to protect VM execution without changing language semantics.
 */

export const RUNTIME_LIMITS = {
    // Execution
    MAX_OPERATIONS_PER_BAR: 10000,
    MAX_BARS_PROCESSED: 50000,
    MAX_EXECUTION_TIME_MS: 30000, // Total script execution time
    MAX_RECURSION_DEPTH: 100,

    // Memory
    MAX_HEAP_SIZE_MB: 128,
    MAX_ARRAY_LENGTH: 100000,
    MAX_STRING_LENGTH: 10000,
    MAX_VARIABLES: 1000,

    // Strategy
    MAX_ORDERS_PER_SCRIPT: 500,
    MAX_ALERTS_PER_SCRIPT: 100,
    MAX_PLOTS_PER_SCRIPT: 64,

    // Script Size
    MAX_SCRIPT_SIZE_BYTES: 50000,
    MAX_LINES: 5000,
} as const;

/**
 * Runtime Limit Error
 * Thrown when a safety limit is exceeded during execution
 */
export class RuntimeLimitError extends Error {
    public code: string;

    constructor(message: string, code: string = 'K600') {
        super(`RuntimeError: ${message}`);
        this.name = 'RuntimeLimitError';
        this.code = code;
    }
}
