// @insight/kuri-engine — Public API
// The universal Kuri language engine for Insight Trading Platform

// Compiler pipeline
export { Lexer } from './lexer';
export { Parser } from './parser';
export { Interpreter } from './interpreter';
export { Kuri } from './kuri';
export type { KuriOptions } from './kuri';

// VM
export { BackendVM } from './backendVM';
export type {
    BackendVMOutput,
    StrategySignal,
    RiskConfig,
    AlertConditionDef,
    OpenTrade,
    ClosedTrade,
    StrategySettings,
} from './backendVM';

// Standard Library
export {
    isStdlibFunction,
    executeStdlibFunction,
    getStdlibNamespaces,
    STDLIB_FUNCTIONS,
} from './stdlib';

// Drawing Objects (table, label, line, box)
export {
    DrawingManager,
    createDrawingFunctions,
    getDrawingNamespaces,
    resolveDrawingConstant,
    DRAWING_CONSTANTS,
} from './drawingObjects';
export type {
    LabelObject,
    LineObject,
    BoxObject,
    TableObject,
    DrawingObject,
} from './drawingObjects';

// Security Provider (cross-symbol request.security support)
export {
    prefetchSecurityData,
    scanSecurityRequests,
    resolveRequestSecurity,
    candlesToContext,
    securityCacheKey,
} from './securityProvider';
export type {
    SecurityCandle,
    SecurityRequest,
    SecurityDataCache,
    SecurityDataFetcher,
} from './securityProvider';

// Built-in Constants (syminfo, barstate, timeframe, time, session)
export {
    resolveBuiltinConstant,
    resolveSyminfo,
    resolveBarstate,
    resolveTimeframe,
    resolveTimeVar,
    getBuiltinNamespaces,
    SESSION_CONSTANTS,
    STRATEGY_CONSTANTS,
    DAYOFWEEK_CONSTANTS,
} from './builtinConstants';

// Input system
export type { InputDefinition } from './inputs/inputSystem';

// Indicators - REMOVED
export * from './indicators';

// IR
export type { IR, IRProgram } from './ir';

// Types (Kuri-internal AST types)
export type {
    ASTNode,
    Program,
    Assignment,
    BinaryExpression,
    CallExpression,
    Identifier,
    Literal,
    IfStatement,
    ForLoop,
    WhileLoop,
    FunctionDefinition,
    ReturnStatement,
    StructDefinition,
    ArrayLiteral,
    TupleLiteral,
    DestructuringAssignment,
    MemberExpression,
    IndexExpression,
    LibraryDefinition,
    ExportStatement,
    ImportStatement,
    ArrayValue,
    MapValue,
    Token,
    BreakStatement,
    ContinueStatement,
    VariableSnapshot,
    CallFrame,
    DebugSessionState,
    Position as KuriPosition,
} from './types';
export { TokenType } from './types';

// Type system
export { TypeChecker } from './typeChecker';
export type { KuriType } from './typeSystem';

// Scope management
export { ScopeManager } from './scopeManager';

// Context
export type { Context } from './context';

// Optimizer
export { Optimizer } from './optimizer';

// Runtime safety
export { RUNTIME_LIMITS, RuntimeLimitError } from './runtimeLimits';

// Error handling
export { KuriRuntimeError, createError } from './kuriError';

// Module system
export { LibraryRegistry } from './libraryRegistry';

// Safety
export { SafetyMonitor } from './safetyMonitor';
export { SandboxedVM, BLOCKED_GLOBALS } from './sandbox';

// New unified error system
export { createKuriError, ERROR_REGISTRY, getErrorInfo } from './errors';
export type {
    KuriError,
    KuriDiagnostic,
    ErrorSeverity,
    ErrorCategory,
    ErrorDefinition,
} from './errors';
