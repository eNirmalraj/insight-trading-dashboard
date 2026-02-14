/**
 * Kuri Error Diagnostic System
 * 
 * Pine Script-style error reporting with:
 * - Precise line/column tracking
 * - Clear, actionable error messages
 * - Helpful hints and suggestions
 * - Monaco editor integration
 */

/**
 * Diagnostic Severity Levels
 */
export enum DiagnosticSeverity {
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info'
}

/**
 * Diagnostic Error Code Categories
 */
export enum ErrorCode {
    // Lexer Errors (L-series)
    ILLEGAL_CHARACTER = 'L001',
    UNTERMINATED_STRING = 'L002',
    INVALID_NUMBER = 'L003',

    // Parser Errors (P-series)
    UNEXPECTED_TOKEN = 'P001',
    MISSING_SEMICOLON = 'P002',
    MISSING_CLOSING_PAREN = 'P003',
    MISSING_CLOSING_BRACKET = 'P004',
    INVALID_EXPRESSION = 'P005',

    // Semantic Errors (S-series)
    FORBIDDEN_KEYWORD = 'S001',
    BUILTIN_REASSIGNMENT = 'S002',
    UNKNOWN_FUNCTION = 'S003',
    UNDEFINED_VARIABLE = 'S004',
    WRONG_ARG_COUNT = 'S005',
    TYPE_MISMATCH = 'S006',

    // Runtime Errors (R-series)
    DIVISION_BY_ZERO = 'R001',
    SERIES_INDEX_OUT_OF_RANGE = 'R002',
    NULL_REFERENCE = 'R003'
}

/**
 * Diagnostic Position
 */
export interface DiagnosticPosition {
    line: number;      // 1-indexed
    column: number;    // 1-indexed
    offset?: number;   // Character offset in source
}

/**
 * Diagnostic Range
 */
export interface DiagnosticRange {
    start: DiagnosticPosition;
    end: DiagnosticPosition;
}

/**
 * Kuri Diagnostic
 * 
 * Represents a single diagnostic (error, warning, info)
 */
export interface KuriDiagnostic {
    code: ErrorCode | string;
    severity: DiagnosticSeverity;
    message: string;
    range: DiagnosticRange;
    hint?: string;
    suggestion?: string;
    relatedInformation?: {
        message: string;
        range?: DiagnosticRange;
    }[];
}

/**
 * Diagnostic Builder
 * 
 * Fluent API for creating diagnostics
 */
export class DiagnosticBuilder {
    private diagnostic: Partial<KuriDiagnostic> = {};

    constructor(code: ErrorCode | string) {
        this.diagnostic.code = code;
        this.diagnostic.severity = DiagnosticSeverity.ERROR;
    }

    static error(code: ErrorCode | string): DiagnosticBuilder {
        return new DiagnosticBuilder(code);
    }

    static warning(code: ErrorCode | string): DiagnosticBuilder {
        const builder = new DiagnosticBuilder(code);
        builder.diagnostic.severity = DiagnosticSeverity.WARNING;
        return builder;
    }

    static info(code: ErrorCode | string): DiagnosticBuilder {
        const builder = new DiagnosticBuilder(code);
        builder.diagnostic.severity = DiagnosticSeverity.INFO;
        return builder;
    }

    withMessage(message: string): this {
        this.diagnostic.message = message;
        return this;
    }

    withHint(hint: string): this {
        this.diagnostic.hint = hint;
        return this;
    }

    withSuggestion(suggestion: string): this {
        this.diagnostic.suggestion = suggestion;
        return this;
    }

    at(line: number, column: number): this {
        this.diagnostic.range = {
            start: { line, column },
            end: { line, column }
        };
        return this;
    }

    atRange(startLine: number, startCol: number, endLine: number, endCol: number): this {
        this.diagnostic.range = {
            start: { line: startLine, column: startCol },
            end: { line: endLine, column: endCol }
        };
        return this;
    }

    build(): KuriDiagnostic {
        if (!this.diagnostic.message) {
            throw new Error('Diagnostic must have a message');
        }
        if (!this.diagnostic.range) {
            // Default to line 1, column 1
            this.diagnostic.range = {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 }
            };
        }
        return this.diagnostic as KuriDiagnostic;
    }
}

/**
 * Diagnostic Collection
 * 
 * Manages a collection of diagnostics for a script
 */
export class DiagnosticCollection {
    private diagnostics: KuriDiagnostic[] = [];

    add(diagnostic: KuriDiagnostic): void {
        this.diagnostics.push(diagnostic);
    }

    addAll(diagnostics: KuriDiagnostic[]): void {
        this.diagnostics.push(...diagnostics);
    }

    clear(): void {
        this.diagnostics = [];
    }

    getAll(): KuriDiagnostic[] {
        return [...this.diagnostics];
    }

    getErrors(): KuriDiagnostic[] {
        return this.diagnostics.filter(d => d.severity === DiagnosticSeverity.ERROR);
    }

    getWarnings(): KuriDiagnostic[] {
        return this.diagnostics.filter(d => d.severity === DiagnosticSeverity.WARNING);
    }

    hasErrors(): boolean {
        return this.getErrors().length > 0;
    }

    /**
     * Format diagnostics for console display (Pine Script style)
     */
    formatForConsole(): string[] {
        return this.diagnostics.map(d => {
            const prefix = d.severity === DiagnosticSeverity.ERROR ? '❌' :
                d.severity === DiagnosticSeverity.WARNING ? '⚠️' : 'ℹ️';

            const location = `line ${d.range.start.line}:${d.range.start.column}`;
            const message = `${prefix} ${location}: ${d.message}`;

            const parts = [message];

            if (d.hint) {
                parts.push(`   💡 Hint: ${d.hint}`);
            }

            if (d.suggestion) {
                parts.push(`   ✨ Suggestion: ${d.suggestion}`);
            }

            return parts.join('\n');
        });
    }

    /**
     * Convert to Monaco-compatible diagnostics
     */
    toMonacoMarkers(): any[] {
        return this.diagnostics.map(d => ({
            severity: d.severity === DiagnosticSeverity.ERROR ? 8 : // monaco.MarkerSeverity.Error
                d.severity === DiagnosticSeverity.WARNING ? 4 : // monaco.MarkerSeverity.Warning
                    1, // monaco.MarkerSeverity.Hint
            startLineNumber: d.range.start.line,
            startColumn: d.range.start.column,
            endLineNumber: d.range.end.line,
            endColumn: d.range.end.column,
            message: `[${d.code}] ${d.message}${d.hint ? `\n💡 ${d.hint}` : ''}`,
            code: d.code
        }));
    }
}

/**
 * Common Diagnostic Templates
 */
export class DiagnosticTemplates {
    static undefinedVariable(varName: string, line: number, col: number): KuriDiagnostic {
        return DiagnosticBuilder
            .error(ErrorCode.UNDEFINED_VARIABLE)
            .withMessage(`Undeclared identifier '${varName}'`)
            .withHint('Variables must be assigned before use')
            .withSuggestion(`Did you forget to assign ${varName}? Example: ${varName} = close`)
            .at(line, col)
            .build();
    }

    static unknownFunction(funcName: string, line: number, col: number, allowed: string[]): KuriDiagnostic {
        return DiagnosticBuilder
            .error(ErrorCode.UNKNOWN_FUNCTION)
            .withMessage(`Cannot call unknown function '${funcName}'`)
            .withHint(`Available functions: ${allowed.join(', ')}`)
            .at(line, col)
            .build();
    }

    static wrongArgCount(funcName: string, expected: number, got: number, line: number, col: number): KuriDiagnostic {
        return DiagnosticBuilder
            .error(ErrorCode.WRONG_ARG_COUNT)
            .withMessage(`Function '${funcName}()' expects ${expected} argument${expected !== 1 ? 's' : ''}, but got ${got}`)
            .withHint(`Check the function signature and ensure you're passing the correct number of arguments`)
            .at(line, col)
            .build();
    }

    static forbiddenKeyword(keyword: string, line: number, col: number): KuriDiagnostic {
        // Categorize the keyword for better error messages
        const loopKeywords = ['for', 'while', 'do', 'loop'];
        const conditionalKeywords = ['if', 'else', 'elif', 'elseif', 'switch', 'case'];
        const functionKeywords = ['function', 'def', 'fn', 'lambda', 'return'];
        const asyncKeywords = ['async', 'await', 'promise', 'then', 'catch'];
        const classKeywords = ['class', 'new', 'this', 'super', 'extends', 'implements', 'interface', 'constructor'];
        const moduleKeywords = ['import', 'export', 'require', 'module', 'from'];
        const dangerousKeywords = ['eval', 'with', 'delete'];
        const globalKeywords = ['global', 'window', 'document', 'process', 'console', 'setTimeout', 'setInterval', 'fetch', 'XMLHttpRequest'];

        let message = `Forbidden keyword '${keyword}'`;
        let hint = '';
        let suggestion = '';

        if (loopKeywords.includes(keyword)) {
            message += ' - Kuri v1 does not support loops';
            hint = 'Use vectorized operations instead. All operations are automatically applied to entire series.';
            suggestion = 'Use built-in functions like sma(), ema(), and boolean expressions';
        } else if (conditionalKeywords.includes(keyword)) {
            message += ' - Kuri v1 conditionals are not yet implemented';
            hint = 'Use boolean expressions for conditional logic';
            suggestion = 'Example: signal = close > open (instead of if/else)';
        } else if (functionKeywords.includes(keyword)) {
            message += ' - Kuri v1 does not support user-defined functions';
            hint = 'Only built-in functions (sma, ema, rsi, etc.) are allowed';
            suggestion = 'Use variable assignments to compose logic';
        } else if (asyncKeywords.includes(keyword)) {
            message += ' - Kuri v1 does not support async operations';
            hint = 'Kuri executes synchronously with provided candle data';
        } else if (classKeywords.includes(keyword)) {
            message += ' - Kuri v1 does not support object-oriented programming';
            hint = 'Use simple variable assignments and function calls';
        } else if (moduleKeywords.includes(keyword)) {
            message += ' - Kuri v1 does not support imports or modules';
            hint = 'Kuri is a sandboxed language with only built-in functions';
        } else if (dangerousKeywords.includes(keyword)) {
            message += ' - This operation violates sandbox security';
            hint = 'Kuri does not allow code evaluation or dangerous operations';
        } else if (globalKeywords.includes(keyword)) {
            message += ' - Cannot access global objects (sandbox violation)';
            hint = 'Kuri runs in a secure sandbox with no external access';
        } else {
            message += ' - Not supported in Kuri v1';
            hint = 'Kuri supports only: variable assignments, arithmetic, comparisons, and built-in function calls';
        }

        return DiagnosticBuilder
            .error(ErrorCode.FORBIDDEN_KEYWORD)
            .withMessage(message)
            .withHint(hint)
            .withSuggestion(suggestion || undefined)
            .at(line, col)
            .build();
    }

    static builtinReassignment(varName: string, line: number, col: number): KuriDiagnostic {
        return DiagnosticBuilder
            .error(ErrorCode.BUILTIN_REASSIGNMENT)
            .withMessage(`Cannot reassign built-in variable '${varName}'`)
            .withHint('Built-in variables (open, high, low, close, volume) are read-only')
            .withSuggestion(`Use a different variable name, e.g., my_${varName}`)
            .at(line, col)
            .build();
    }

    static unexpectedToken(token: string, expected: string, line: number, col: number): KuriDiagnostic {
        return DiagnosticBuilder
            .error(ErrorCode.UNEXPECTED_TOKEN)
            .withMessage(`Unexpected token '${token}'`)
            .withHint(`Expected: ${expected}`)
            .at(line, col)
            .build();
    }
}
