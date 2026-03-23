import {
    IR,
    IRProgram,
    IRAssign,
    IRBinaryOp,
    IRCall,
    IRVar,
    IRConst,
    IRIndex,
    IRMemberAccess,
    IRDestructuringAssign,
    IRIf,
    IRLoop,
    IRFunctionDef,
    IRReturn,
    IRBreak,
    IRContinue,
    IRArrayLiteral,
    IRStructDef,
    IRLibraryDef,
    IRExport,
    IRImport,
} from './ir';
import { RUNTIME_LIMITS, RuntimeLimitError } from './runtimeLimits';
import { Context } from './context';
import { crossover, crossunder } from './indicators/common';
import { KuriPlotBuilder, createKuriPlotFunctions } from './plotIntegration';
import { INPUT_FUNCTIONS } from './inputs/inputFunctions';
import { COLOR_CONSTANTS, ColorSystem } from './inputs/colorSystem';
import { inputSystem } from './inputs/inputSystem';
import { registerIndicatorFunctions } from './indicators/indicatorFunctions';
import { isStdlibFunction, executeStdlibFunction, getStdlibNamespaces } from './stdlib';
import { resolveBuiltinConstant, getBuiltinNamespaces, resolveTimeVar } from './builtinConstants';
import {
    DrawingManager,
    createDrawingFunctions,
    getDrawingNamespaces,
    resolveDrawingConstant,
} from './drawingObjects';
import { SecurityDataCache, resolveRequestSecurity, securityCacheKey } from './securityProvider';

/**
 * Strategy Signal
 * Output of strategy.entry() and strategy.close() functions
 */
export interface StrategySignal {
    type: 'ENTRY' | 'EXIT' | 'ORDER' | 'CANCEL' | 'CLOSE_ALL';
    direction?: 'LONG' | 'SHORT';
    id: string;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    quantity?: number;
    comment?: string;
    timestamp: number;
    limit?: number;
    stop?: number;
    trailPoints?: number;
    trailOffset?: number;
}

/**
 * Open Trade — tracks a single open position
 */
export interface OpenTrade {
    id: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    quantity: number;
    entryBar: number;
    entryTime: number;
}

/**
 * Closed Trade — tracks a completed trade
 */
export interface ClosedTrade {
    id: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    entryBar: number;
    exitBar: number;
    profit: number;
    profitPercent: number;
}

/**
 * Backend VM Output
 * The result of executing a Kuri strategy script
 */
/**
 * Risk Configuration from strategy.risk.* functions
 */
export interface RiskConfig {
    maxTotalExposure?: number;
    maxPositionSizePercent?: number;
    maxLeverage?: number;
    maxConsLossDays?: number;
    allowEntryIn?: 'long' | 'short' | 'both';
}

/**
 * Strategy Settings — configurable via strategy() declaration
 */
export interface StrategySettings {
    title?: string;
    overlay?: boolean;
    pyramiding?: number; // max number of entries in same direction (default 0 = disabled)
    default_qty_type?: 'fixed' | 'cash' | 'percent_of_equity';
    default_qty_value?: number;
    initial_capital?: number;
    currency?: string;
    commission_type?: 'percent' | 'cash_per_contract' | 'cash_per_order';
    commission_value?: number;
    slippage?: number; // in ticks
    margin_long?: number; // % margin required for longs
    margin_short?: number; // % margin required for shorts
    max_bars_back?: number;
    calc_on_every_tick?: boolean;
    calc_on_order_fills?: boolean;
    process_orders_on_close?: boolean;
    close_entries_rule?: 'FIFO' | 'ANY';
}

/**
 * Alert Condition definition from alertcondition()
 */
export interface AlertConditionDef {
    condition: any;
    title: string;
    message: string;
}

export interface BackendVMOutput {
    context: Context;
    signals: StrategySignal[];
    variables: { [key: string]: any };
    stopLoss?: number;
    takeProfit?: number;
    plots?: any[]; // For chart visualization support
    inputDefinitions?: import('./inputs/inputSystem').InputDefinition[];
    riskConfig?: RiskConfig;
    alertConditions?: AlertConditionDef[];
    openTrades?: OpenTrade[];
    closedTrades?: ClosedTrade[];
    positionSize?: number;
    drawings?: ReturnType<DrawingManager['getAllDrawings']>;
    strategySettings?: StrategySettings;
}

/**
 * Backend VM
 *
 * Executes Kuri IR for signal generation.
 * - Supports strategy.entry() for trade signals
 * - Supports strategy.close() for exit signals
 * - Returns buy/sell signals with TP/SL
 * - Optimized for server-side execution
 */
export class BackendVM {
    private context: Context;
    private signals: StrategySignal[] = [];
    private currentIndex: number = 0;
    private stopLoss: number | undefined;
    private takeProfit: number | undefined;

    // State for Rising Edge Detection
    private strategyState: Map<string, boolean> = new Map();

    // Track `var` declared variables — these maintain history across bars
    // Stored as arrays in context so that history access [1], [2] works
    private varNames: Set<string> = new Set();

    // History buffer for ALL user-assigned variables (non-var).
    // Enables history access like smoothPx[1] on per-bar computed scalars.
    private scalarHistory: Map<string, any[]> = new Map();

    // Runtime safety counters
    private operationCount = 0;
    private scriptStartTime = 0;
    private callDepth = 0;

    // Plot builder for Kuri plots
    private plotBuilder: KuriPlotBuilder = new KuriPlotBuilder();

    // Total number of bars — used to defer plot() calls to the last bar only
    private seriesLength: number = 0;

    // Indicator functions registry
    private indicatorFunctions: Record<string, Function> = {};

    // External registry for enhanced indicators (V3)
    private registry: any;

    // Cache for indicator calculations to achieve O(n) total performance
    // Limited to 256 entries to prevent unbounded memory growth
    private static readonly MAX_CACHE_SIZE = 256;
    private calculationCache: Map<string, any> = new Map();

    // Risk configuration from strategy.risk.* calls
    private riskConfig: RiskConfig = {};

    // Alert conditions from alertcondition() calls
    private alertConditions: AlertConditionDef[] = [];

    // Position tracking
    private openTrades: OpenTrade[] = [];
    private closedTrades: ClosedTrade[] = [];
    private pendingOrders: Map<string, StrategySignal> = new Map();

    // Drawing objects (table, label, line, box)
    private drawingManager: DrawingManager = new DrawingManager();
    private drawingFunctions: Record<string, Function> = {};

    // Cross-symbol security data cache (from prefetchSecurityData)
    private securityCache: SecurityDataCache = {};

    // Script type enforcement (indicator scripts cannot use strategy functions)
    private scriptType: 'indicator' | 'strategy' | undefined;

    // Strategy settings (from strategy() declaration)
    private strategySettings: StrategySettings = {
        initial_capital: 10000,
        pyramiding: 0,
        default_qty_type: 'fixed',
        default_qty_value: 1,
        commission_type: 'percent',
        commission_value: 0,
        slippage: 0,
        close_entries_rule: 'FIFO',
    };
    private equity: number = 10000;

    constructor(context: Context, registry?: any, securityCache?: SecurityDataCache) {
        this.context = context;
        this.registry = registry;
        this.securityCache = securityCache || {};
        // Register all indicator functions with the current context
        this.indicatorFunctions = registerIndicatorFunctions(context);
        // Initialize drawing functions
        this.drawingFunctions = createDrawingFunctions(this.drawingManager);
    }

    /**
     * Execute IR Program and return signals
     */
    public run(ir: IRProgram): BackendVMOutput {
        // Set script type for function enforcement
        this.scriptType = ir.scriptType;

        // Check series length limit
        const seriesLength = this.context.close?.length || 0;
        this.seriesLength = seriesLength;
        if (seriesLength > RUNTIME_LIMITS.MAX_BARS_PROCESSED) {
            throw new RuntimeLimitError(
                `Series length exceeds maximum (${RUNTIME_LIMITS.MAX_BARS_PROCESSED} bars)`,
                'K600'
            );
        }

        // Initialize execution timer
        this.scriptStartTime = Date.now();

        // Reset signals, caches, and input system
        this.signals = [];
        this.strategyState.clear();
        this.varNames.clear();
        this.scalarHistory.clear();
        this.calculationCache.clear();
        inputSystem.clear();

        // Execute for each candle (bar-by-bar execution)
        for (let i = 0; i < seriesLength; i++) {
            this.currentIndex = i;

            // Reset per-bar counters
            this.operationCount = 0;

            // Carry forward `var` variables: push previous bar's value
            // so that history access (e.g. haOpenVal[1]) works correctly.
            // On bar 0, var arrays are initialized by executeAssign.
            if (i > 0) {
                for (const varName of this.varNames) {
                    const arr = this.context[varName];
                    if (Array.isArray(arr) && arr.length === i) {
                        // Carry forward: duplicate last value for current bar
                        arr.push(arr[i - 1]);
                    }
                }
            }

            // Update indicator functions context for current bar
            this.indicatorFunctions = registerIndicatorFunctions(this.context);

            // Execute all statements for this bar
            for (const statement of ir.statements) {
                this.executeNode(statement as IR);
            }

            // Check total execution time
            const totalElapsed = Date.now() - this.scriptStartTime;
            if (totalElapsed > RUNTIME_LIMITS.MAX_EXECUTION_TIME_MS) {
                throw new RuntimeLimitError(
                    `Total execution time limit exceeded (${RUNTIME_LIMITS.MAX_EXECUTION_TIME_MS}ms)`,
                    'K602'
                );
            }
        }

        // Finalize output — indicator scripts only return plots/drawings, not strategy data
        const isIndicator = this.scriptType === 'indicator';
        return {
            context: this.context,
            signals: isIndicator ? [] : this.signals,
            variables: { ...this.context },
            stopLoss: isIndicator ? undefined : this.stopLoss,
            takeProfit: isIndicator ? undefined : this.takeProfit,
            plots: this.plotBuilder.getPlots(),
            inputDefinitions: inputSystem.getAllInputs(),
            riskConfig: isIndicator
                ? undefined
                : Object.keys(this.riskConfig).length > 0
                  ? this.riskConfig
                  : undefined,
            alertConditions: this.alertConditions.length > 0 ? this.alertConditions : undefined,
            openTrades: isIndicator
                ? undefined
                : this.openTrades.length > 0
                  ? [...this.openTrades]
                  : undefined,
            closedTrades: isIndicator
                ? undefined
                : this.closedTrades.length > 0
                  ? [...this.closedTrades]
                  : undefined,
            positionSize: isIndicator ? undefined : this.getPositionSize() || undefined,
            drawings: this.drawingManager.getAllDrawings(),
            strategySettings: isIndicator ? undefined : this.strategySettings,
        };
    }

    /** Format error with source location from IR node meta */
    private sourceError(
        message: string,
        node?: IR | { meta?: { line?: number; column?: number } }
    ): Error {
        if (node?.meta?.line) {
            return new Error(
                `${message} at line ${node.meta.line}${node.meta.column ? ', column ' + node.meta.column : ''}`
            );
        }
        return new Error(message);
    }

    /**
     * Execute individual IR node
     */
    private executeNode(node: IR): any {
        // Check operation limit
        this.operationCount++;
        if (this.operationCount > RUNTIME_LIMITS.MAX_OPERATIONS_PER_BAR) {
            throw new RuntimeLimitError(
                `Maximum operations per bar exceeded (${RUNTIME_LIMITS.MAX_OPERATIONS_PER_BAR})`,
                'K601'
            );
        }

        switch (node.type) {
            case 'IR_PROGRAM':
                return this.run(node as IRProgram);

            case 'IR_ASSIGN':
                return this.executeAssign(node as IRAssign);

            case 'IR_BINARY_OP':
                return this.executeBinaryOp(node as IRBinaryOp);

            case 'IR_CALL':
                return this.executeCall(node as IRCall);

            case 'IR_VAR':
                return this.executeVar(node as IRVar);

            case 'IR_CONST':
                return (node as IRConst).value;

            case 'IR_INDEX':
                return this.executeIndex(node);
            case 'IR_MEMBER_ACCESS':
                return this.executeMemberAccess(node as IRMemberAccess);

            case 'IR_DESTRUCTURING_ASSIGN':
                return this.executeDestructuringAssign(node as IRDestructuringAssign);

            case 'IR_CALL_ARGUMENT':
                return {
                    name: (node as any).name,
                    value: this.executeNode((node as any).value),
                };

            case 'IR_IF':
                return this.executeIf(node as IRIf);

            case 'IR_LOOP':
                return this.executeLoop(node as IRLoop);

            case 'IR_BREAK':
                throw { __break: true };

            case 'IR_CONTINUE':
                throw { __continue: true };

            case 'IR_FUNCTION_DEF':
                return this.executeFunctionDef(node as IRFunctionDef);

            case 'IR_RETURN':
                throw {
                    __return: true,
                    value: (node as IRReturn).value
                        ? this.executeNode((node as IRReturn).value!)
                        : undefined,
                };

            case 'IR_ARRAY_LITERAL':
                return (node as IRArrayLiteral).elements.map((el) => this.executeNode(el));

            case 'IR_ARRAY_GET': {
                const arr = this.executeNode((node as any).array);
                const idx = this.executeNode((node as any).index);
                return Array.isArray(arr) ? (arr[idx] ?? null) : null;
            }

            case 'IR_ARRAY_SET': {
                const arr = this.executeNode((node as any).array);
                const idx = this.executeNode((node as any).index);
                const val = this.executeNode((node as any).value);
                if (Array.isArray(arr)) arr[idx] = val;
                return val;
            }

            case 'IR_STRUCT_DEF': {
                // Register struct as a callable constructor
                const structName = (node as IRStructDef).name;
                const structFields = (node as IRStructDef).fields;
                this.context[structName] = (...args: any[]) => {
                    const instance: Record<string, any> = { _type: structName };
                    structFields.forEach((field, i) => {
                        instance[field.name] = args[i] ?? null;
                    });
                    return instance;
                };
                return;
            }

            case 'IR_LIBRARY_DEF':
                // Store library metadata
                this.context['__library__'] = {
                    name: (node as IRLibraryDef).name,
                    version: (node as IRLibraryDef).version,
                };
                return;

            case 'IR_EXPORT':
                // Execute the definition and mark as exported
                this.executeNode((node as IRExport).definition as IR);
                return;

            case 'IR_IMPORT':
                // Store import alias (library resolution happens externally)
                this.context[(node as IRImport).alias] = {
                    __import: (node as IRImport).libraryName,
                };
                return;

            case 'IR_FUNCTION_CALL': {
                const fc = node as any;
                const funcName = fc.funcName.toLowerCase();
                const args = fc.args.map((a: IR) => this.executeNode(a));
                return this.executeBuiltinFunction(funcName, args);
            }

            default:
                throw this.sourceError(`Unknown IR node type: ${(node as any).type}`, node);
        }
    }

    /**
     * Execute Assignment
     */
    private executeAssign(node: IRAssign): void {
        if (node.isVar) {
            // `var` declaration: initialize as a history array on bar 0 only.
            // On subsequent bars, the carry-forward in the bar loop handles persistence.
            if (this.currentIndex === 0) {
                let value = this.executeNode(node.value as IR);
                // If initial value is a series, extract bar 0's scalar
                if (Array.isArray(value) || value instanceof Float64Array) {
                    value = value[0] ?? null;
                }
                this.varNames.add(node.name);
                this.context[node.name] = [value]; // Store as array for history access
            }
            // Bar > 0: skip — value was carried forward by the bar loop
            return;
        }

        if (node.isReassignment && this.varNames.has(node.name)) {
            // `:=` reassignment on a `var` variable — update current bar in the history array
            let value = this.executeNode(node.value as IR);
            // If value is a series (array/Float64Array), extract current bar's scalar
            if (Array.isArray(value) || value instanceof Float64Array) {
                value = value[this.currentIndex] ?? null;
            }
            const arr = this.context[node.name];
            if (Array.isArray(arr)) {
                arr[this.currentIndex] = value;
            } else {
                this.context[node.name] = value;
            }
            return;
        }

        // Regular assignment (non-var)
        const value = this.executeNode(node.value as IR);
        this.context[node.name] = value;

        // Track scalar values in history so that variable[1] works for per-bar computed values.
        // Series (arrays) already support indexing natively, so only track scalars.
        if (typeof value === 'number' || value === null || typeof value === 'boolean') {
            let hist = this.scalarHistory.get(node.name);
            if (!hist) {
                hist = [];
                this.scalarHistory.set(node.name, hist);
            }
            // Pad with nulls for any skipped bars
            while (hist.length < this.currentIndex) {
                hist.push(null);
            }
            hist[this.currentIndex] = value;
        }
    }

    /**
     * Execute If/Else
     */
    private executeIf(node: IRIf): any {
        const condition = this.executeNode(node.condition as IR);
        // Resolve condition — if it's a series, use current bar value
        const condValue = Array.isArray(condition) ? !!condition[this.currentIndex] : !!condition;

        let lastResult: any;
        if (condValue) {
            for (const stmt of node.consequent) {
                lastResult = this.executeNode(stmt as IR);
            }
        } else if (node.alternate) {
            for (const stmt of node.alternate) {
                lastResult = this.executeNode(stmt as IR);
            }
        }
        return lastResult;
    }

    /**
     * Execute Loop (for / while / for...in)
     */
    private executeLoop(node: IRLoop): any {
        let lastResult: any;
        const maxIterations = RUNTIME_LIMITS.MAX_OPERATIONS_PER_BAR;

        if (node.loopType === 'for_in') {
            // for element in collection { body }
            const iterVar = node.iterVar || '_item';
            const collection = node.iterable ? this.executeNode(node.iterable as IR) : [];

            if (collection == null) {
                return null; // Nothing to iterate
            }

            const items = Array.isArray(collection)
                ? collection
                : collection instanceof Map
                  ? Array.from(collection.entries())
                  : typeof collection === 'number'
                    ? [] // Can't iterate a number
                    : typeof collection === 'string'
                      ? collection.split('')
                      : [];

            const prevVal = this.context[iterVar];
            let iterations = 0;
            for (const item of items) {
                if (iterations++ > maxIterations) {
                    throw new RuntimeLimitError('Maximum loop iterations exceeded', 'K601');
                }
                this.context[iterVar] = item;
                try {
                    for (const stmt of node.body) {
                        lastResult = this.executeNode(stmt as IR);
                    }
                } catch (e: any) {
                    if (e?.__break) break;
                    if (e?.__continue) {
                        /* continue */
                    } else throw e;
                }
            }
            // Restore previous value
            if (prevVal === undefined) delete this.context[iterVar];
            else this.context[iterVar] = prevVal;
        } else if (node.loopType === 'for') {
            // for (init; condition; increment) { body }
            if (node.init) this.executeNode(node.init as IR);

            let iterations = 0;
            while (true) {
                if (iterations++ > maxIterations) {
                    throw new RuntimeLimitError('Maximum loop iterations exceeded', 'K601');
                }

                const cond = this.executeNode(node.condition as IR);
                const condVal = Array.isArray(cond) ? !!cond[this.currentIndex] : !!cond;
                if (!condVal) break;

                try {
                    for (const stmt of node.body) {
                        lastResult = this.executeNode(stmt as IR);
                    }
                } catch (e: any) {
                    if (e?.__break) break;
                    if (e?.__continue) {
                        /* continue */
                    } else throw e;
                }

                if (node.increment) this.executeNode(node.increment as IR);
            }
        } else {
            // while loop
            let iterations = 0;
            while (true) {
                if (iterations++ > maxIterations) {
                    throw new RuntimeLimitError('Maximum loop iterations exceeded', 'K601');
                }

                const cond = this.executeNode(node.condition as IR);
                const condVal = Array.isArray(cond) ? !!cond[this.currentIndex] : !!cond;
                if (!condVal) break;

                try {
                    for (const stmt of node.body) {
                        lastResult = this.executeNode(stmt as IR);
                    }
                } catch (e: any) {
                    if (e?.__break) break;
                    if (e?.__continue) {
                        /* continue */
                    } else throw e;
                }
            }
        }

        return lastResult;
    }

    /**
     * Execute Function Definition — stores function in context
     */
    private executeFunctionDef(node: IRFunctionDef): void {
        // Store the function as a callable in context
        this.context[node.name] = (...args: any[]) => {
            // Recursion depth check
            this.callDepth++;
            if (this.callDepth > RUNTIME_LIMITS.MAX_RECURSION_DEPTH) {
                this.callDepth--;
                throw new RuntimeLimitError(
                    `Maximum recursion depth exceeded (${RUNTIME_LIMITS.MAX_RECURSION_DEPTH}). Check for infinite recursion in function '${node.name}'.`,
                    'K603'
                );
            }

            // Snapshot all context keys before execution
            const snapshot: Record<string, any> = {};
            const existingKeys = new Set(Object.keys(this.context));

            // Set parameters (with default value support)
            node.params.forEach((param, i) => {
                snapshot[param] = this.context[param];
                if (i < args.length && args[i] !== undefined) {
                    this.context[param] = args[i];
                } else if (node.paramDefaults && node.paramDefaults[i]) {
                    this.context[param] = this.executeNode(node.paramDefaults[i] as IR);
                } else {
                    this.context[param] = args[i];
                }
            });

            let result: any;
            try {
                for (const stmt of node.body) {
                    result = this.executeNode(stmt as IR);
                }
            } catch (e: any) {
                if (e?.__return) {
                    result = e.value;
                } else {
                    this.callDepth--;
                    throw e;
                }
            }

            this.callDepth--;

            // Restore parameters
            node.params.forEach((param) => {
                if (snapshot[param] === undefined && !existingKeys.has(param)) {
                    delete this.context[param];
                } else {
                    this.context[param] = snapshot[param];
                }
            });

            // Clean up any new variables created inside the function body
            const newKeys = Object.keys(this.context);
            for (const key of newKeys) {
                if (!existingKeys.has(key) && !node.params.includes(key)) {
                    delete this.context[key];
                }
            }

            return result;
        };
    }

    /**
     * Execute Binary Operation
     */
    private executeBinaryOp(node: IRBinaryOp): any {
        let left = this.executeNode(node.left as IR);
        let right = this.executeNode(node.right as IR);

        // In bar-by-bar mode: resolve series to current bar scalar for arithmetic.
        // This matches Pine Script where `close - prev` gives a per-bar scalar.
        left = this.resolveToScalar(left);
        right = this.resolveToScalar(right);

        return this.applyOp(left, right, node.operator);
    }

    /**
     * In bar-by-bar mode, extract the current bar's value from a series.
     * Returns the value as-is if it's already a scalar.
     */
    private resolveToScalar(value: any): any {
        if (Array.isArray(value) || value instanceof Float64Array) {
            return value[this.currentIndex] ?? null;
        }
        return value;
    }

    /**
     * Apply binary operation (vectorized - returns series)
     * Aligned with Frontend VM semantics
     */
    private applyOp(left: any, right: any, op: string): any {
        // Unary NOT (right will be null for unary ops)
        if (op === 'not') {
            if (Array.isArray(left)) {
                return left.map((v) => (v === null ? null : !v));
            }
            return !left;
        }

        // Null-coalescing: x ?? default
        if (op === '??') {
            return left === null || left === undefined || (typeof left === 'number' && isNaN(left))
                ? right
                : left;
        }

        // Modulo
        if (op === '%') {
            if (typeof left === 'number' && typeof right === 'number') {
                return right === 0 ? null : left % right;
            }
        }

        // Scalar operations (both scalars)
        if (typeof left === 'number' && typeof right === 'number') {
            switch (op) {
                case '+': {
                    const r = left + right;
                    return isFinite(r) ? r : null;
                }
                case '-': {
                    const r = left - right;
                    return isFinite(r) ? r : null;
                }
                case '*': {
                    const r = left * right;
                    return isFinite(r) ? r : null;
                }
                case '/':
                    if (right === 0) return null;
                    {
                        const r = left / right;
                        return isFinite(r) ? r : null;
                    }
                case '>':
                    return left > right;
                case '<':
                    return left < right;
                case '==':
                    return left === right;
                case '>=':
                    return left >= right;
                case '<=':
                    return left <= right;
                case '!=':
                    return left !== right;
                case 'and':
                    return left && right;
                case 'or':
                    return left || right;
            }
        }

        // Series operations (vectorized - at least one operand is a series)
        const isLeftArray = Array.isArray(left);
        const isRightArray = Array.isArray(right);
        const length = isLeftArray ? left.length : isRightArray ? right.length : 0;

        if (isLeftArray || isRightArray) {
            const result = new Array(length).fill(null);
            for (let i = 0; i < length; i++) {
                const l = isLeftArray ? left[i] : left;
                const r = isRightArray ? right[i] : right;

                if (l == null || r == null) {
                    result[i] = null;
                    continue;
                }

                switch (op) {
                    case '+': {
                        const v = l + r;
                        result[i] = isFinite(v) ? v : null;
                        break;
                    }
                    case '-': {
                        const v = l - r;
                        result[i] = isFinite(v) ? v : null;
                        break;
                    }
                    case '*': {
                        const v = l * r;
                        result[i] = isFinite(v) ? v : null;
                        break;
                    }
                    case '/':
                        result[i] = r === 0 ? null : isFinite(l / r) ? l / r : null;
                        break;
                    case '>':
                        result[i] = l > r;
                        break;
                    case '<':
                        result[i] = l < r;
                        break;
                    case '==':
                        result[i] = l === r;
                        break;
                    case '!=':
                        result[i] = l !== r;
                        break;
                    case '>=':
                        result[i] = l >= r;
                        break;
                    case '<=':
                        result[i] = l <= r;
                        break;
                    case 'and':
                        result[i] = l && r;
                        break;
                    case 'or':
                        result[i] = l || r;
                        break;
                    case '%':
                        result[i] = r === 0 ? null : l % r;
                        break;
                }
            }
            return result;
        }

        return null;
    }

    /**
     * Execute Function Call
     */
    private executeCall(node: IRCall): any {
        const positionalArgs: any[] = [];
        const namedArgs: Record<string, any> = {};

        node.args.forEach((arg) => {
            if (arg.type === 'IR_CALL_ARGUMENT') {
                const val = this.executeNode(arg as IR);
                namedArgs[val.name] = val.value;
            } else {
                positionalArgs.push(this.executeNode(arg as IR));
            }
        });

        // Check for user-defined functions first (preserve original casing)
        const userFunc = this.context[node.func];
        if (typeof userFunc === 'function') {
            return userFunc(...positionalArgs);
        }

        const funcName = node.func.toLowerCase();

        // Script type enforcement: block strategy functions in indicator scripts
        if (this.scriptType === 'indicator' && funcName.startsWith('strategy')) {
            throw new Error(
                `[K506] '${funcName}()' is not allowed in indicator scripts. Use strategy() declaration to create a strategy script.`
            );
        }

        // strategy() declaration — configures strategy settings
        if (funcName === 'strategy') {
            return this.strategyDeclare(positionalArgs, namedArgs);
        }

        // Check for strategy functions (support both positional and named args)
        if (funcName === 'strategy.entry') {
            return this.strategyEntry(positionalArgs, namedArgs);
        }
        if (funcName === 'strategy.close') {
            return this.strategyClose(positionalArgs, namedArgs);
        }
        if (funcName === 'strategy.exit_sl') {
            return this.strategyExitSL(positionalArgs);
        }
        if (funcName === 'strategy.exit_tp') {
            return this.strategyExitTP(positionalArgs);
        }
        if (funcName === 'strategy.exit') {
            return this.strategyExit(positionalArgs, namedArgs);
        }
        if (funcName === 'strategy.order') {
            return this.strategyOrder(positionalArgs, namedArgs);
        }
        if (funcName === 'strategy.cancel') {
            return this.strategyCancel(positionalArgs);
        }
        if (funcName === 'strategy.cancel_all') {
            return this.strategyCancelAll();
        }
        if (funcName === 'strategy.close_all') {
            return this.strategyCloseAll(positionalArgs);
        }

        // Strategy info accessors
        if (funcName === 'strategy.opentrades.entry_price') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.openTrades[idx]?.entryPrice ?? null;
        }
        if (funcName === 'strategy.opentrades.entry_bar_index') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.openTrades[idx]?.entryBar ?? null;
        }
        if (funcName === 'strategy.opentrades.entry_id') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.openTrades[idx]?.id ?? null;
        }
        if (funcName === 'strategy.opentrades.size') {
            const idx = Number(positionalArgs[0] ?? 0);
            const trade = this.openTrades[idx];
            if (!trade) return 0;
            return trade.direction === 'LONG' ? trade.quantity : -trade.quantity;
        }
        if (funcName === 'strategy.opentrades.profit') {
            const idx = Number(positionalArgs[0] ?? 0);
            const trade = this.openTrades[idx];
            if (!trade) return 0;
            const currentPrice = Array.isArray(this.context.close)
                ? this.context.close[this.currentIndex]
                : 0;
            return trade.direction === 'LONG'
                ? (currentPrice - trade.entryPrice) * trade.quantity
                : (trade.entryPrice - currentPrice) * trade.quantity;
        }
        if (funcName === 'strategy.closedtrades.entry_price') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.closedTrades[idx]?.entryPrice ?? null;
        }
        if (funcName === 'strategy.closedtrades.exit_price') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.closedTrades[idx]?.exitPrice ?? null;
        }
        if (funcName === 'strategy.closedtrades.profit') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.closedTrades[idx]?.profit ?? 0;
        }
        if (funcName === 'strategy.closedtrades.profit_percent') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.closedTrades[idx]?.profitPercent ?? 0;
        }
        if (funcName === 'strategy.closedtrades.size') {
            const idx = Number(positionalArgs[0] ?? 0);
            const trade = this.closedTrades[idx];
            if (!trade) return 0;
            return trade.direction === 'LONG' ? trade.quantity : -trade.quantity;
        }
        if (funcName === 'strategy.closedtrades.entry_bar_index') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.closedTrades[idx]?.entryBar ?? null;
        }
        if (funcName === 'strategy.closedtrades.exit_bar_index') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.closedTrades[idx]?.exitBar ?? null;
        }

        // Missing opentrades accessors
        if (funcName === 'strategy.opentrades.entry_time') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.openTrades[idx]?.entryTime ?? null;
        }

        // Missing closedtrades accessors
        if (funcName === 'strategy.closedtrades.entry_id') {
            const idx = Number(positionalArgs[0] ?? 0);
            return this.closedTrades[idx]?.id ?? null;
        }
        if (funcName === 'strategy.closedtrades.entry_time') {
            const idx = Number(positionalArgs[0] ?? 0);
            const trade = this.closedTrades[idx];
            if (!trade) return null;
            // Estimate from entryBar using context.time
            return this.context.time ? this.context.time[trade.entryBar] : trade.entryBar;
        }
        if (funcName === 'strategy.closedtrades.exit_time') {
            const idx = Number(positionalArgs[0] ?? 0);
            const trade = this.closedTrades[idx];
            if (!trade) return null;
            return this.context.time ? this.context.time[trade.exitBar] : trade.exitBar;
        }
        if (funcName === 'strategy.closedtrades.max_runup') {
            const idx = Number(positionalArgs[0] ?? 0);
            const trade = this.closedTrades[idx];
            if (!trade) return 0;
            // Approximate: use profit as max runup (exact would need bar-by-bar tracking)
            return Math.max(0, trade.profit);
        }
        if (funcName === 'strategy.closedtrades.max_drawdown') {
            const idx = Number(positionalArgs[0] ?? 0);
            const trade = this.closedTrades[idx];
            if (!trade) return 0;
            return Math.min(0, trade.profit);
        }

        // Strategy risk management functions
        if (funcName === 'strategy.risk.max_total_exposure') {
            this.riskConfig.maxTotalExposure = Number(positionalArgs[0]);
            return;
        }
        if (funcName === 'strategy.risk.max_position_size_percent') {
            this.riskConfig.maxPositionSizePercent = Number(positionalArgs[0]);
            return;
        }
        if (funcName === 'strategy.risk.max_leverage') {
            this.riskConfig.maxLeverage = Number(positionalArgs[0]);
            return;
        }
        if (funcName === 'strategy.risk.allow_entry_in') {
            this.riskConfig.allowEntryIn = String(positionalArgs[0]).toLowerCase() as any;
            return;
        }
        if (funcName === 'strategy.risk.max_cons_loss_days') {
            this.riskConfig.maxConsLossDays = Number(positionalArgs[0]);
            return;
        }
        if (funcName === 'strategy.convert_to_account') {
            // Convert currency amount to account currency (stub — returns as-is)
            return positionalArgs[0] ?? 0;
        }
        if (funcName === 'strategy.convert_to_symbol') {
            return positionalArgs[0] ?? 0;
        }
        if (funcName === 'strategy.margin_liquidation_price') {
            // Estimate liquidation price based on leverage, computed per-direction
            const leverage = this.riskConfig.maxLeverage || 1;
            if (this.openTrades.length === 0) return 0;

            // Separate long and short trades
            const longs = this.openTrades.filter((t) => t.direction === 'LONG');
            const shorts = this.openTrades.filter((t) => t.direction === 'SHORT');

            const longQty = longs.reduce((s, t) => s + t.quantity, 0);
            const shortQty = shorts.reduce((s, t) => s + t.quantity, 0);
            const netSize = longQty - shortQty;

            if (netSize > 0) {
                // Net long — weighted avg of long entries only
                const avgLong = longs.reduce((s, t) => s + t.entryPrice * t.quantity, 0) / longQty;
                return avgLong * (1 - 1 / leverage);
            } else if (netSize < 0) {
                // Net short — weighted avg of short entries only
                const avgShort =
                    shorts.reduce((s, t) => s + t.entryPrice * t.quantity, 0) / shortQty;
                return avgShort * (1 + 1 / leverage);
            }
            return 0; // Fully hedged — no liquidation
        }

        // timeframe.in_seconds(tf?) — convert timeframe string to seconds
        if (funcName === 'timeframe.in_seconds') {
            const tf =
                positionalArgs.length > 0
                    ? String(positionalArgs[0])
                    : this.context.timeframe || '1h';
            return this.timeframeToSeconds(tf);
        }

        // Request functions (multi-timeframe)
        if (funcName === 'request.security' || funcName === 'request.security_lower_tf') {
            // request.security(symbol, timeframe, expression)
            const symbol = String(positionalArgs[0] || '');
            const timeframe = String(positionalArgs[1] || '');
            const expression = positionalArgs[2];

            // Try cross-symbol resolution from pre-fetched cache
            const resolved = resolveRequestSecurity(
                symbol,
                timeframe,
                expression,
                this.securityCache,
                this.context
            );
            if (resolved !== expression) return resolved;

            // Fallback: same-symbol MTF resampling
            if (Array.isArray(expression)) {
                const currentTF = this.context.timeframe || '1h';
                const ratio = this.estimateTFRatio(timeframe, currentTF);
                if (ratio > 1) {
                    const result: (number | null)[] = [];
                    for (let i = 0; i < expression.length; i++) {
                        const htfIdx = Math.floor(i / ratio) * ratio + (ratio - 1);
                        result.push(
                            htfIdx < expression.length
                                ? expression[htfIdx]
                                : expression[expression.length - 1]
                        );
                    }
                    return result;
                }
            }
            return expression ?? null;
        }
        if (funcName === 'request.financial') {
            // request.financial(symbol, financial_id, period, gaps)
            // Stub — returns null, environment can override
            return null;
        }
        if (funcName === 'request.economic') {
            // request.economic(country_code, field, gaps)
            return null;
        }
        if (funcName === 'request.dividends') {
            // Returns dividends data (stub)
            return null;
        }
        if (funcName === 'request.splits') {
            // Returns splits data (stub)
            return null;
        }
        if (funcName === 'request.quandl') {
            // External data source (stub)
            return null;
        }

        // Ticker functions
        if (funcName === 'ticker.new') {
            // ticker.new(prefix, ticker) → "PREFIX:TICKER"
            const prefix = String(positionalArgs[0] || '');
            const ticker = String(positionalArgs[1] || '');
            return prefix ? `${prefix}:${ticker}` : ticker;
        }
        if (funcName === 'ticker.modify') {
            // ticker.modify(tickerid, session, adjustment)
            const tickerid = String(positionalArgs[0] || '');
            return tickerid; // pass-through for now
        }
        if (funcName === 'ticker.standard') {
            // Standardize ticker symbol
            const tickerid = String(positionalArgs[0] || '');
            return tickerid.toUpperCase();
        }

        // Alert condition
        if (funcName === 'alertcondition') {
            this.alertConditions.push({
                condition: positionalArgs[0],
                title: positionalArgs[1] || namedArgs.title || 'Alert',
                message: positionalArgs[2] || namedArgs.message || '',
            });
            return;
        }

        if (funcName.startsWith('color.')) {
            return this.executeColorFunction(funcName, positionalArgs, namedArgs);
        }

        // Check drawing functions (label.*, line.*, box.*, table.*)
        if (funcName in this.drawingFunctions) {
            return this.drawingFunctions[funcName](...positionalArgs);
        }

        // For math.* and str.* functions, resolve series args to current bar scalars.
        // These functions expect scalar inputs, unlike ta.* which need full series.
        if (
            funcName.startsWith('math.') ||
            funcName.startsWith('str.') ||
            funcName === 'int' ||
            funcName === 'float' ||
            funcName === 'bool' ||
            funcName === 'string'
        ) {
            const scalarArgs = positionalArgs.map((a) => this.resolveToScalar(a));
            if (isStdlibFunction(funcName)) {
                return executeStdlibFunction(funcName, scalarArgs);
            }
        }

        // Bar-aware stdlib overrides: nz/na need to handle series in bar-by-bar mode
        if (funcName === 'nz') {
            let value = positionalArgs[0];
            let replacement = positionalArgs[1] ?? 0;
            // Extract current bar value if arguments are series
            if (Array.isArray(value) || value instanceof Float64Array) {
                value = value[this.currentIndex] ?? null;
            }
            if (Array.isArray(replacement) || replacement instanceof Float64Array) {
                replacement = replacement[this.currentIndex] ?? 0;
            }
            return value === null ||
                value === undefined ||
                (typeof value === 'number' && isNaN(value))
                ? replacement
                : value;
        }
        if (funcName === 'na') {
            let value = positionalArgs[0];
            if (Array.isArray(value) || value instanceof Float64Array) {
                value = value[this.currentIndex] ?? null;
            }
            return (
                value === null || value === undefined || (typeof value === 'number' && isNaN(value))
            );
        }

        // Check stdlib before builtins
        if (isStdlibFunction(funcName)) {
            return executeStdlibFunction(funcName, positionalArgs);
        }

        return this.executeBuiltinFunction(funcName, positionalArgs, namedArgs);
    }

    private executeColorFunction(
        funcName: string,
        args: any[],
        namedArgs: Record<string, any>
    ): any {
        switch (funcName) {
            case 'color.new': {
                const baseColor = args[0] || (namedArgs.color as string);
                const transparency = args[1] ?? (namedArgs.transp as number) ?? 0;
                return ColorSystem.new(baseColor, transparency);
            }
            case 'color.rgb': {
                const r = args[0] ?? (namedArgs.r as number);
                const g = args[1] ?? (namedArgs.g as number);
                const b = args[2] ?? (namedArgs.b as number);
                const a = args[3] ?? (namedArgs.a as number) ?? 255;
                return ColorSystem.rgb(r, g, b, a);
            }
            case 'color.hsl': {
                const h = args[0] ?? (namedArgs.h as number);
                const s = args[1] ?? (namedArgs.s as number);
                const l = args[2] ?? (namedArgs.l as number);
                const a = args[3] ?? (namedArgs.a as number) ?? 1;
                return ColorSystem.hsl(h, s, l, a);
            }
            case 'color.from_gradient': {
                const value = args[0] ?? (namedArgs.value as number);
                const minVal = args[1] ?? (namedArgs.minVal as number);
                const maxVal = args[2] ?? (namedArgs.maxVal as number);
                const color1 = args[3] ?? (namedArgs.color1 as string);
                const color2 = args[4] ?? (namedArgs.color2 as string);

                const range = maxVal - minVal;
                const ratio =
                    range === 0 ? 0.5 : Math.max(0, Math.min(1, (value - minVal) / range));
                return ColorSystem.blend(color1, color2, ratio);
            }
        }

        // Return color constant if it exists
        return COLOR_CONSTANTS[funcName] || funcName;
    }

    // Side-effect functions that must NEVER be cached.
    // These produce output (plots, drawings) as a side effect — caching them
    // prevents the side effect from running on the last bar where it matters.
    private static UNCACHEABLE_FUNCTIONS = new Set([
        'plot',
        'plotline',
        'plotarea',
        'plothistogram',
        'plotband',
        'plothline',
        'plotvline',
        'plotmarkers',
        'plotcloud',
        'plotcolumns',
        'plotarrow',
        'plottrendline',
        'plotray',
        'plotlabel',
        'plotshape',
        'plotchar',
        'plotbar',
        'plotcandle',
        'hline',
        'bgcolor',
        'fill',
        'barcolor',
        'alert',
    ]);

    private executeBuiltinFunction(
        funcName: string,
        args: any[],
        namedArgs: Record<string, any> = {}
    ): any {
        // Create a unique cache key for this function call
        // We use function name and stringified arguments (with safety for circular refs / large args)
        // IMPORTANT: Side-effect functions (plot, hline, etc.) must NOT be cached
        // because they need to execute on the last bar to produce output.
        let cacheKey: string = '';
        if (!BackendVM.UNCACHEABLE_FUNCTIONS.has(funcName)) {
            try {
                cacheKey = `${funcName}(${JSON.stringify(args)},${JSON.stringify(namedArgs)})`;
            } catch {
                // Circular reference or unstringifiable args — skip caching
                cacheKey = '';
            }
        }
        if (cacheKey && this.calculationCache.has(cacheKey)) {
            return this.calculationCache.get(cacheKey);
        }

        let result: any;

        // Check for input functions (input.int, etc.)
        if (funcName in INPUT_FUNCTIONS) {
            // Some input functions might need named arguments or special handling
            // For now, we just call them with positional arguments
            result = (INPUT_FUNCTIONS as any)[funcName](...args, namedArgs);
            if (cacheKey) {
                if (this.calculationCache.size >= BackendVM.MAX_CACHE_SIZE) {
                    // Evict oldest entry
                    const firstKey = this.calculationCache.keys().next().value;
                    if (firstKey !== undefined) this.calculationCache.delete(firstKey);
                }
                this.calculationCache.set(cacheKey, result);
            }
            return result;
        }

        // NEW: Try Indicator Registry first if available
        if (this.registry) {
            const indicator = this.registry.getIndicator(funcName);
            if (indicator) {
                try {
                    // Map positional args to named args based on indicator definition
                    const params = { ...namedArgs };
                    indicator.parameters.forEach((param: any, i: number) => {
                        if (args[i] !== undefined && params[param.name] === undefined) {
                            params[param.name] = args[i];
                        }
                    });

                    // Calculate using registry
                    // We pass this.context as the data source provider
                    result = this.registry.calculate(indicator.id, params, this.context);
                    if (result !== undefined && result !== null) {
                        if (cacheKey) {
                            if (this.calculationCache.size >= BackendVM.MAX_CACHE_SIZE) {
                                // Evict oldest entry
                                const firstKey = this.calculationCache.keys().next().value;
                                if (firstKey !== undefined) this.calculationCache.delete(firstKey);
                            }
                            this.calculationCache.set(cacheKey, result);
                        }
                        return result;
                    }
                } catch (error) {
                    console.warn(`Registry calculation failed for ${funcName}:`, error);
                }
            }
        }

        // Fallback to legacy functions
        if (funcName in this.indicatorFunctions) {
            result = this.indicatorFunctions[funcName](...args);
            if (cacheKey) {
                if (this.calculationCache.size >= BackendVM.MAX_CACHE_SIZE) {
                    // Evict oldest entry
                    const firstKey = this.calculationCache.keys().next().value;
                    if (firstKey !== undefined) this.calculationCache.delete(firstKey);
                }
                this.calculationCache.set(cacheKey, result);
            }
            return result;
        }

        // Check for input functions
        if (funcName in INPUT_FUNCTIONS) {
            return (INPUT_FUNCTIONS as any)[funcName](...args);
        }

        // Check for color constants (handle color.red, color.blue, etc.)
        if (funcName.startsWith('color.')) {
            if (funcName in COLOR_CONSTANTS) {
                return COLOR_CONSTANTS[funcName];
            }
            // Check for color functions
            const colorFunc = funcName.replace('color.', '');
            if (colorFunc === 'new') return ColorSystem.new(args[0], args[1]);
            if (colorFunc === 'rgb') return ColorSystem.rgb(args[0], args[1], args[2], args[3]);
            if (colorFunc === 'hsl') return ColorSystem.hsl(args[0], args[1], args[2], args[3]);
        }

        // Handle time-related variables used as functions (e.g., time(), bar_index())
        const timeVal = resolveTimeVar(funcName, this.context, this.currentIndex);
        if (timeVal !== undefined) {
            return timeVal;
        }

        // Handle utility functions
        switch (funcName) {
            case 'crossover':
                return crossover(args[0], args[1]);
            case 'crossunder':
                return crossunder(args[0], args[1]);
            // ============ PLOT FUNCTIONS ============
            case 'plot':
                return this.plot(
                    args[0],
                    args[1] !== undefined ? args[1] : namedArgs.title,
                    args[2] !== undefined ? args[2] : namedArgs.color
                );

            // Specific plot types — all deferred to last bar only
            case 'plotline':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotLine(args[0], args[1], args[2]);
                return;
            case 'plotarea':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotArea(args[0], args[1], args[2]);
                return;
            case 'plothistogram':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotHistogram(args[0], args[1], args[2]);
                return;
            case 'plotband':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotBand(args[0], args[1], args[2], args[3], args[4]);
                return;
            case 'plothline':
                // HLine is a constant price level — only emit once on first bar
                if (this.currentIndex === 0)
                    return this.plotBuilder.plotHLine(args[0], args[1], args[2]);
                return;
            case 'plotvline':
                return this.plotBuilder.plotVLine(args[0], args[1], args[2]);
            case 'plotmarkers':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotMarkers(args[0], args[1], args[2]);
                return;
            case 'plotcloud':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotCloud(args[0], args[1], args[2], args[3]);
                return;
            case 'plotcolumns':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotColumns(args[0], args[1], args[2]);
                return;
            case 'plotarrow':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotArrow(args[0], args[1], args[2], args[3]);
                return;
            case 'plottrendline':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotTrendLine(args[0], args[1], args[2], args[3]);
                return;
            case 'plotray':
                if (this.currentIndex === this.seriesLength - 1)
                    return this.plotBuilder.plotRay(args[0], args[1], args[2], args[3]);
                return;
            case 'plotlabel':
                // Labels are per-bar drawing objects — always emit
                return this.plotBuilder.plotLabel(args[0], args[1], {
                    ...args[2],
                    barIndex: this.currentIndex,
                });
            case 'plotshape':
                // Shapes are per-bar drawing objects — always emit
                return this.plotBuilder.plotShape(args[0], args[1], {
                    ...args[2],
                    barIndex: this.currentIndex,
                });

            // Pine Script-compatible plot stubs — deferred to last bar
            case 'plotchar':
                // Per-bar drawing — always emit
                return this.plotBuilder.plotLabel(args[0], args[1] || '', args[2]);
            case 'plotbar':
            case 'plotcandle':
                if (this.currentIndex === this.seriesLength - 1) {
                    return this.plotBuilder.plotCandle(
                        args[0],
                        args[1],
                        args[2],
                        args[3],
                        namedArgs.title || args[4],
                        namedArgs.color || args[5],
                        namedArgs.wickcolor || args[6],
                        namedArgs.bordercolor || args[7]
                    );
                }
                return;
            case 'hline':
                // HLine is a constant price level — only emit once
                if (this.currentIndex === 0)
                    return this.plotBuilder.plotHLine(args[0], args[1], args[2]);
                return;
            case 'bgcolor': {
                // Background color fill — only on last bar
                if (this.currentIndex !== this.seriesLength - 1) return;
                const color = args[0];
                if (color) {
                    this.plotBuilder.plotArea(
                        Array.isArray(this.context.close)
                            ? Array(this.context.close.length).fill(0)
                            : [],
                        args[1] || 'bgcolor',
                        { fillColor: color, fillOpacity: 0.1 }
                    );
                }
                return;
            }
            case 'fill':
                // Fill between two plots — only on last bar
                if (this.currentIndex !== this.seriesLength - 1) return;
                if (Array.isArray(args[0]) && Array.isArray(args[1])) {
                    this.plotBuilder.plotCloud(args[0], args[1], args[3] || 'fill', {
                        bullishColor: args[2],
                        bearishColor: args[2],
                    });
                }
                return;
            case 'barcolor':
                // Change bar color — store as metadata, no-op for signal generation
                return;

            // Standalone rgba() function — Pine Script compatibility
            case 'rgba':
                return ColorSystem.rgb(args[0], args[1], args[2], args[3] ?? 255);

            // Color extraction functions
            case 'color.t': {
                // Get transparency from rgba string
                const c = String(args[0] || '');
                const match = c.match(/[\d.]+(?=\)$)/);
                return match ? Math.round((1 - parseFloat(match[0])) * 100) : 0;
            }
            case 'color.r': {
                const c = String(args[0] || '');
                const m = c.match(/\d+/);
                return m ? parseInt(m[0]) : 0;
            }
            case 'color.g': {
                const c = String(args[0] || '');
                const parts = c.match(/\d+/g);
                return parts && parts.length >= 2 ? parseInt(parts[1]) : 0;
            }
            case 'color.b': {
                const c = String(args[0] || '');
                const parts = c.match(/\d+/g);
                return parts && parts.length >= 3 ? parseInt(parts[2]) : 0;
            }
        }

        // Try loading indicator from registry (if available in browser context)
        try {
            const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;
            const win = g.window || g;
            if (win && win.__INDICATOR_REGISTRY__) {
                const registry = win.__INDICATOR_REGISTRY__;
                const indicator = registry.getIndicator(funcName);
                if (!indicator)
                    throw new Error(`[K504] Indicator '${funcName}' not found in registry`);
                try {
                    // Map positional args to named args based on indicator definition
                    const params = { ...namedArgs };
                    const indicatorParams = indicator.parameters || [];

                    indicatorParams.forEach((param: any, i: number) => {
                        const name = param.name;
                        if (params[name] === undefined && i < args.length) {
                            params[name] = args[i];
                        }
                    });

                    let result = registry.calculate(indicator.id, params);

                    // If result is an object and we have multiple outputs,
                    // convert to array to support [a, b] = func() destructuring
                    if (result && typeof result === 'object' && !Array.isArray(result)) {
                        const outputs = indicator.outputs || [];
                        if (outputs.length > 1) {
                            const arrayResult = outputs.map((out: any) => result[out.name]);
                            return arrayResult;
                        }
                        // If single output, maybe just return it or the whole object?
                        if (outputs.length === 1 && result[outputs[0].name] !== undefined) {
                            return result[outputs[0].name];
                        }
                    }

                    return result;
                } catch (error) {
                    // If registry calculation fails, re-throw or handle as needed
                    console.warn(
                        `Registry calculation failed for ${funcName} in browser context:`,
                        error
                    );
                    // Fall through to error below if not handled
                }
            }
        } catch (error) {
            // If registry fails, fall through to error
            console.warn(`Failed to load indicator from registry: ${funcName}`, error);
        }

        throw new Error(`[K504] Unknown function: ${funcName}`);
    }

    private plot(series: any, title?: string, color?: string): void {
        const isScalar = typeof series === 'number' || series === null || series === undefined;
        const lastBar = this.currentIndex === this.seriesLength - 1;

        if (isScalar) {
            // Scalar value (bar-by-bar accumulation, e.g. var count = 0; count := count + 1)
            // Must call plotBuilder on EVERY bar so it accumulates the full series.
            this.plotBuilder.plot(series, title, { color });
            return;
        }

        // Full arrays (from ta.sma/ema/etc) — only plot on last bar to avoid duplication
        if (!lastBar) return;

        // Convert Float64Array to regular array for the plot builder
        let data: any = series;
        if (series instanceof Float64Array) {
            data = Array.from(series);
        } else if (Array.isArray(series)) {
            data = series.slice(); // Copy to avoid mutation
        }

        this.plotBuilder.plot(data, title, { color });
    }

    /**
     * Execute Variable Reference
     */
    private executeVar(node: IRVar): any {
        if (this.context[node.name] === undefined) {
            // Handle namespaces
            const allNamespaces = [
                'color',
                'input',
                'ta',
                'strategy',
                'math',
                'array',
                'map',
                'str',
                'matrix',
                'ticker',
                ...getBuiltinNamespaces(),
                ...getDrawingNamespaces(),
            ];
            if (allNamespaces.includes(node.name)) {
                return node.name;
            }

            // Check top-level time variables (time, bar_index, year, month, etc.)
            const timeVal = resolveTimeVar(node.name, this.context, this.currentIndex);
            if (timeVal !== undefined) {
                return timeVal;
            }

            // Handle flattened dotted names (V3 namespaces)
            if (node.name.includes('.')) {
                const namespace = node.name.split('.')[0];
                if (allNamespaces.includes(namespace)) {
                    // Check color constants
                    if (namespace === 'color') {
                        return COLOR_CONSTANTS[node.name] || node.name;
                    }
                    // Check live strategy properties (blocked in indicator mode)
                    if (namespace === 'strategy') {
                        if (this.scriptType === 'indicator') {
                            throw new Error(
                                `[K506] '${node.name}' is not available in indicator scripts. Use strategy() declaration for strategy features.`
                            );
                        }
                        const liveVal = this.resolveStrategyProperty(node.name);
                        if (liveVal !== undefined) return liveVal;
                    }
                    // Check drawing constants (label.style_*, line.style_*, position.*, etc.)
                    const drawingConst = resolveDrawingConstant(node.name);
                    if (drawingConst.found) {
                        return drawingConst.value;
                    }
                    // Check builtin constants (syminfo.*, barstate.*, etc.)
                    const totalBars = this.context.close?.length || 0;
                    const resolved = resolveBuiltinConstant(
                        node.name,
                        this.context,
                        this.currentIndex,
                        totalBars
                    );
                    if (resolved.found) {
                        return resolved.value;
                    }
                    return node.name;
                }
            }

            // Derived price variables (Pine Script built-ins)
            if (node.name === 'hlc3' || node.name === 'hl2' || node.name === 'ohlc4') {
                const h = this.context.high;
                const l = this.context.low;
                const c = this.context.close;
                const o = this.context.open;
                if (h && l && c) {
                    const len = c.length;
                    const result = new Float64Array(len);
                    if (node.name === 'hlc3') {
                        for (let i = 0; i < len; i++) result[i] = (h[i] + l[i] + c[i]) / 3;
                    } else if (node.name === 'hl2') {
                        for (let i = 0; i < len; i++) result[i] = (h[i] + l[i]) / 2;
                    } else if (node.name === 'ohlc4' && o) {
                        for (let i = 0; i < len; i++) result[i] = (o[i] + h[i] + l[i] + c[i]) / 4;
                    }
                    return result;
                }
            }

            throw this.sourceError(`Undefined variable: ${node.name}`, node);
        }

        // For `var` variables stored as history arrays, return the current bar's value
        if (this.varNames.has(node.name)) {
            const arr = this.context[node.name];
            if (Array.isArray(arr)) {
                return arr[this.currentIndex] ?? arr[arr.length - 1] ?? null;
            }
        }

        return this.context[node.name];
    }

    /**
     * Execute Member Access
     */
    private executeMemberAccess(node: IRMemberAccess): any {
        const object = this.executeNode(node.object as IR);
        const property = node.property;

        // Safe navigation (?.) — return null if object is null/undefined
        if ((node as any).optional && (object === null || object === undefined)) {
            return null;
        }

        // Handle namespaces like 'color' or 'input' or 'strategy'
        const allNamespaces = [
            'color',
            'input',
            'ta',
            'strategy',
            'math',
            'array',
            'map',
            'str',
            'matrix',
            'ticker',
            ...getBuiltinNamespaces(),
            ...getDrawingNamespaces(),
        ];
        if (typeof object === 'string' && allNamespaces.includes(object)) {
            const fullName = `${object}.${property}`;

            // Check color constants
            if (object === 'color') {
                return COLOR_CONSTANTS[fullName] || fullName;
            }

            // Check live strategy properties (blocked in indicator mode)
            if (object === 'strategy') {
                if (this.scriptType === 'indicator') {
                    throw new Error(
                        `[K506] '${fullName}' is not available in indicator scripts. Use strategy() declaration for strategy features.`
                    );
                }
                const liveVal = this.resolveStrategyProperty(fullName);
                if (liveVal !== undefined) return liveVal;
            }

            // Check drawing constants
            const drawingConst = resolveDrawingConstant(fullName);
            if (drawingConst.found) {
                return drawingConst.value;
            }

            // Check builtin constants (syminfo.*, barstate.*, timeframe.*, etc.)
            const builtinNs = getBuiltinNamespaces();
            if (builtinNs.includes(object)) {
                const totalBars = this.context.close?.length || 0;
                const resolved = resolveBuiltinConstant(
                    fullName,
                    this.context,
                    this.currentIndex,
                    totalBars
                );
                if (resolved.found) {
                    return resolved.value;
                }
            }

            // For others, return the full name as a reference
            return fullName;
        }

        // Handle arrays — support .length, .size, etc.
        if (Array.isArray(object)) {
            if (property === 'length' || property === 'size') return object.length;
            return null;
        }

        // Handle objects/structs
        if (object && typeof object === 'object') {
            return object[property] ?? null;
        }

        return null;
    }

    /**
     * Execute Index Expression (History Access)
     */
    private executeIndex(node: any): any {
        // node is IRIndex
        const indexVal = this.executeNode(node.index);

        // For `var` variables, bypass executeVar (which returns scalar)
        // and use the raw history array directly for [n] access.
        if (node.object?.type === 'IR_VAR' && this.varNames.has(node.object.name)) {
            const arr = this.context[node.object.name];
            if (Array.isArray(arr)) {
                if (typeof indexVal !== 'number' || isNaN(indexVal)) {
                    return null;
                }
                const targetIndex = this.currentIndex - indexVal;
                if (targetIndex < 0 || targetIndex >= arr.length) {
                    return null;
                }
                return arr[targetIndex];
            }
        }

        const obj = this.executeNode(node.object);

        if (!Array.isArray(obj) && !(obj instanceof Float64Array)) {
            // Check scalar history for per-bar computed variables
            if (node.object?.type === 'IR_VAR' && typeof indexVal === 'number') {
                const hist = this.scalarHistory.get(node.object.name);
                if (hist) {
                    const targetIndex = this.currentIndex - indexVal;
                    if (targetIndex < 0 || targetIndex >= hist.length) return null;
                    return hist[targetIndex] ?? null;
                }
            }
            // Scalar value: index 0 returns the value itself, anything else returns null
            if (typeof obj === 'number') {
                return indexVal === 0 ? obj : null;
            }
            return null;
        }

        if (typeof indexVal !== 'number' || isNaN(indexVal)) {
            throw new Error(
                `[K502] Index must be a number, got ${typeof indexVal === 'number' ? 'NaN' : typeof indexVal}`
            );
        }

        // Kuri V2 History Access: obj[1] means "previous value"
        // So we access obj[currentIndex - indexVal]
        const targetIndex = this.currentIndex - indexVal;

        if (targetIndex < 0 || targetIndex >= obj.length) {
            return null; // Return null for out of bounds (e.g. before start of data)
        }

        return obj[targetIndex];
    }

    /**
     * strategy.entry() function - NEW!
     * strategy.entry(id, direction, condition, stopLoss?, takeProfit?)
     */
    private strategyEntry(args: any[], namedArgs: Record<string, any> = {}): void {
        const id = String(args[0] ?? namedArgs.id ?? '');
        const direction = String(args[1] ?? namedArgs.direction ?? 'LONG').toUpperCase() as
            | 'LONG'
            | 'SHORT';
        const condition = args[2] ?? namedArgs.condition ?? namedArgs.when;

        if (!id || condition === undefined) {
            throw new Error('[K505] strategy.entry() requires id and condition');
        }

        // Rising Edge Detection
        const currentCondition = Array.isArray(condition)
            ? !!condition[this.currentIndex]
            : !!condition;

        const prevState = this.strategyState.get(id) || false;

        if (currentCondition && !prevState) {
            const signal: StrategySignal = {
                type: 'ENTRY',
                direction,
                id,
                price: Array.isArray(this.context.close)
                    ? this.context.close[this.currentIndex]
                    : this.context.close![this.currentIndex],
                timestamp: this.currentIndex,
            };

            // Optional stop loss and take profit (positional or named)
            const sl = args[3] ?? namedArgs.stop ?? namedArgs.stopLoss;
            const tp = args[4] ?? namedArgs.limit ?? namedArgs.takeProfit;
            if (sl !== undefined) signal.stopLoss = Number(sl);
            if (tp !== undefined) signal.takeProfit = Number(tp);

            this.signals.push(signal);
        }

        // Update state
        this.strategyState.set(id, currentCondition);
    }

    /**
     * strategy.close() function
     * strategy.close(id, condition)
     */
    private strategyClose(args: any[], namedArgs: Record<string, any> = {}): void {
        const id = String(args[0] ?? namedArgs.id ?? '');
        const condition = args[1] ?? namedArgs.condition ?? namedArgs.when;

        if (condition === undefined) {
            throw new Error('[K505] strategy.close() requires a condition');
        }

        // Only trigger if condition is true (vectorized)
        const currentCondition = Array.isArray(condition)
            ? !!condition[this.currentIndex]
            : !!condition;

        if (currentCondition) {
            this.signals.push({
                type: 'EXIT',
                id,
                price: Array.isArray(this.context.close)
                    ? this.context.close[this.currentIndex]
                    : this.context.close![this.currentIndex],
                timestamp: this.currentIndex,
            });
        }
    }

    /**
     * strategy.exit_sl() - Set default stop loss
     */
    private strategyExitSL(args: any[]): void {
        if (args.length < 1) return;
        this.stopLoss = Number(args[0]);
    }

    /**
     * strategy() - Declaration function, sets strategy settings
     */
    private strategyDeclare(args: any[], namedArgs: Record<string, any>): void {
        if (args[0]) this.strategySettings.title = String(args[0]);
        if (namedArgs.title) this.strategySettings.title = namedArgs.title;
        if (namedArgs.overlay !== undefined)
            this.strategySettings.overlay = Boolean(namedArgs.overlay);
        if (namedArgs.pyramiding !== undefined)
            this.strategySettings.pyramiding = Number(namedArgs.pyramiding);
        if (namedArgs.default_qty_type !== undefined)
            this.strategySettings.default_qty_type = namedArgs.default_qty_type;
        if (namedArgs.default_qty_value !== undefined)
            this.strategySettings.default_qty_value = Number(namedArgs.default_qty_value);
        if (namedArgs.initial_capital !== undefined) {
            this.strategySettings.initial_capital = Number(namedArgs.initial_capital);
            this.equity = Number(namedArgs.initial_capital);
        }
        if (namedArgs.currency !== undefined) this.strategySettings.currency = namedArgs.currency;
        if (namedArgs.commission_type !== undefined)
            this.strategySettings.commission_type = namedArgs.commission_type;
        if (namedArgs.commission_value !== undefined)
            this.strategySettings.commission_value = Number(namedArgs.commission_value);
        if (namedArgs.slippage !== undefined)
            this.strategySettings.slippage = Number(namedArgs.slippage);
        if (namedArgs.margin_long !== undefined)
            this.strategySettings.margin_long = Number(namedArgs.margin_long);
        if (namedArgs.margin_short !== undefined)
            this.strategySettings.margin_short = Number(namedArgs.margin_short);
        if (namedArgs.calc_on_every_tick !== undefined)
            this.strategySettings.calc_on_every_tick = Boolean(namedArgs.calc_on_every_tick);
        if (namedArgs.process_orders_on_close !== undefined)
            this.strategySettings.process_orders_on_close = Boolean(
                namedArgs.process_orders_on_close
            );
        if (namedArgs.close_entries_rule !== undefined)
            this.strategySettings.close_entries_rule = namedArgs.close_entries_rule;
        if (namedArgs.max_bars_back !== undefined)
            this.strategySettings.max_bars_back = Number(namedArgs.max_bars_back);
        if (namedArgs.calc_on_order_fills !== undefined)
            this.strategySettings.calc_on_order_fills = Boolean(namedArgs.calc_on_order_fills);
    }

    /**
     * strategy.exit_tp() - Set default take profit
     */
    private strategyExitTP(args: any[]): void {
        if (args.length < 1) return;
        this.takeProfit = Number(args[0]);
    }

    /**
     * strategy.exit() - Exit with named SL/TP
     * strategy.exit(id, from_entry, profit?, loss?, trail_points?, trail_offset?, comment?)
     */
    private strategyExit(args: any[], namedArgs: Record<string, any>): void {
        const id = String(args[0] || namedArgs.id || '');
        const fromEntry = String(args[1] || namedArgs.from_entry || '');
        const profit = args[2] ?? namedArgs.profit;
        const loss = args[3] ?? namedArgs.loss;
        const trailPoints = args[4] ?? namedArgs.trail_points;
        const trailOffset = args[5] ?? namedArgs.trail_offset;
        const comment = args[6] ?? namedArgs.comment ?? '';

        // Find matching open trade
        const tradeIdx = this.openTrades.findIndex((t) => t.id === fromEntry || t.id === id);
        if (tradeIdx === -1) return;

        const trade = this.openTrades[tradeIdx];
        const currentPrice = Array.isArray(this.context.close)
            ? this.context.close[this.currentIndex]
            : 0;

        let shouldExit = false;

        // Check profit target (in price units)
        if (profit !== undefined && profit !== null) {
            const pnl =
                trade.direction === 'LONG'
                    ? currentPrice - trade.entryPrice
                    : trade.entryPrice - currentPrice;
            if (pnl >= profit) shouldExit = true;
        }

        // Check stop loss (in price units)
        if (loss !== undefined && loss !== null) {
            const pnl =
                trade.direction === 'LONG'
                    ? currentPrice - trade.entryPrice
                    : trade.entryPrice - currentPrice;
            if (pnl <= -loss) shouldExit = true;
        }

        if (shouldExit) {
            this.closeTradeAtIndex(tradeIdx, currentPrice, comment);
        }
    }

    /**
     * strategy.order() - Place a non-conditional order
     * strategy.order(id, direction, qty?, limit?, stop?, comment?)
     */
    private strategyOrder(args: any[], namedArgs: Record<string, any>): void {
        const id = String(args[0] || namedArgs.id || '');
        const direction = String(args[1] || namedArgs.direction || 'LONG').toUpperCase() as
            | 'LONG'
            | 'SHORT';
        const qty = args[2] ?? namedArgs.qty ?? 1;
        const limit = args[3] ?? namedArgs.limit;
        const stop = args[4] ?? namedArgs.stop;
        const comment = args[5] ?? namedArgs.comment ?? '';

        const currentPrice = Array.isArray(this.context.close)
            ? this.context.close[this.currentIndex]
            : 0;

        const signal: StrategySignal = {
            type: 'ORDER',
            direction,
            id,
            price: currentPrice,
            quantity: qty,
            comment,
            timestamp: this.currentIndex,
            limit: limit ?? undefined,
            stop: stop ?? undefined,
        };

        // Enforce max orders limit
        if (this.signals.length >= RUNTIME_LIMITS.MAX_ORDERS_PER_SCRIPT) {
            throw new RuntimeLimitError(
                `Maximum orders per script exceeded (${RUNTIME_LIMITS.MAX_ORDERS_PER_SCRIPT}). Reduce the number of strategy.entry() calls.`,
                'K606'
            );
        }

        // If no limit/stop, execute immediately
        if (limit === undefined && stop === undefined) {
            this.signals.push(signal);
            this.openTrades.push({
                id,
                direction,
                entryPrice: currentPrice,
                quantity: qty,
                entryBar: this.currentIndex,
                entryTime: this.context.time ? this.context.time[this.currentIndex] : Date.now(),
            });
        } else {
            // Store as pending order
            this.pendingOrders.set(id, signal);
        }
    }

    /**
     * strategy.cancel() - Cancel a pending order
     */
    private strategyCancel(args: any[]): void {
        const id = String(args[0] || '');
        if (!id || !this.pendingOrders.has(id)) return; // No-op if order doesn't exist
        this.pendingOrders.delete(id);
        this.signals.push({
            type: 'CANCEL',
            id,
            timestamp: this.currentIndex,
        });
    }

    /**
     * strategy.cancel_all() - Cancel all pending orders
     */
    private strategyCancelAll(): void {
        this.pendingOrders.clear();
        this.signals.push({
            type: 'CANCEL',
            id: '__ALL__',
            timestamp: this.currentIndex,
        });
    }

    /**
     * strategy.close_all() - Close all open positions
     */
    private strategyCloseAll(args: any[]): void {
        const comment = String(args[0] || '');
        const currentPrice = Array.isArray(this.context.close)
            ? this.context.close[this.currentIndex]
            : 0;

        // Close all open trades
        while (this.openTrades.length > 0) {
            this.closeTradeAtIndex(0, currentPrice, comment);
        }

        this.signals.push({
            type: 'CLOSE_ALL',
            id: '__ALL__',
            comment,
            timestamp: this.currentIndex,
        });
    }

    /**
     * Helper: close a trade at a given index
     */
    private closeTradeAtIndex(tradeIdx: number, exitPrice: number, comment?: string): void {
        const trade = this.openTrades[tradeIdx];
        if (!trade) return;

        const profit =
            trade.direction === 'LONG'
                ? (exitPrice - trade.entryPrice) * trade.quantity
                : (trade.entryPrice - exitPrice) * trade.quantity;
        const profitPercent =
            trade.entryPrice !== 0
                ? ((exitPrice - trade.entryPrice) / trade.entryPrice) *
                  100 *
                  (trade.direction === 'LONG' ? 1 : -1)
                : 0;

        this.closedTrades.push({
            id: trade.id,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            exitPrice,
            quantity: trade.quantity,
            entryBar: trade.entryBar,
            exitBar: this.currentIndex,
            profit,
            profitPercent,
        });

        this.signals.push({
            type: 'EXIT',
            id: trade.id,
            price: exitPrice,
            comment,
            timestamp: this.currentIndex,
        });

        this.openTrades.splice(tradeIdx, 1);
    }

    /**
     * Resolve live strategy.* properties from position state
     */
    private resolveStrategyProperty(name: string): any {
        const currentPrice = Array.isArray(this.context.close)
            ? this.context.close[this.currentIndex]
            : 0;

        switch (name) {
            case 'strategy.position_size':
                return this.getPositionSize();
            case 'strategy.position_avg_price': {
                if (this.openTrades.length === 0) return 0;
                const totalQty = this.openTrades.reduce((s, t) => s + t.quantity, 0);
                const totalCost = this.openTrades.reduce(
                    (s, t) => s + t.entryPrice * t.quantity,
                    0
                );
                return totalQty > 0 ? totalCost / totalQty : 0;
            }
            case 'strategy.opentrades':
                return this.openTrades.length;
            case 'strategy.closedtrades':
                return this.closedTrades.length;
            case 'strategy.openprofit': {
                return this.openTrades.reduce((total, trade) => {
                    const pnl =
                        trade.direction === 'LONG'
                            ? (currentPrice - trade.entryPrice) * trade.quantity
                            : (trade.entryPrice - currentPrice) * trade.quantity;
                    return total + pnl;
                }, 0);
            }
            case 'strategy.closedprofit':
            case 'strategy.netprofit':
                return this.closedTrades.reduce((s, t) => s + t.profit, 0);
            case 'strategy.grossprofit':
                return this.closedTrades
                    .filter((t) => t.profit > 0)
                    .reduce((s, t) => s + t.profit, 0);
            case 'strategy.grossloss':
                return this.closedTrades
                    .filter((t) => t.profit < 0)
                    .reduce((s, t) => s + t.profit, 0);
            case 'strategy.wintrades':
                return this.closedTrades.filter((t) => t.profit > 0).length;
            case 'strategy.losstrades':
                return this.closedTrades.filter((t) => t.profit < 0).length;
            case 'strategy.eventrades':
                return this.closedTrades.filter((t) => t.profit === 0).length;
            case 'strategy.percent_profitable':
                if (this.closedTrades.length === 0) return 0;
                return (
                    (this.closedTrades.filter((t) => t.profit > 0).length /
                        this.closedTrades.length) *
                    100
                );
            case 'strategy.equity':
                return this.equity + this.closedTrades.reduce((s, t) => s + t.profit, 0);
            case 'strategy.initial_capital':
                return this.strategySettings.initial_capital || 10000;
            case 'strategy.max_drawdown': {
                let peak = 0;
                let maxDD = 0;
                let equity = 0;
                for (const trade of this.closedTrades) {
                    equity += trade.profit;
                    if (equity > peak) peak = equity;
                    const dd = peak - equity;
                    if (dd > maxDD) maxDD = dd;
                }
                return maxDD;
            }
            case 'strategy.long':
                return 'LONG';
            case 'strategy.short':
                return 'SHORT';
            default:
                return undefined;
        }
    }

    /**
     * Estimate the ratio between two timeframes (e.g., 4h / 1h = 4)
     */
    private estimateTFRatio(higherTF: string, lowerTF: string): number {
        const toMinutes = (tf: string): number => {
            const t = tf.toLowerCase().trim();
            const num = parseInt(t) || 1;
            if (t.endsWith('s')) return num / 60;
            if (t.endsWith('h')) return num * 60;
            if (t.endsWith('d') || t === 'D') return num * 1440;
            if (t.endsWith('w') || t === 'W') return num * 10080;
            if (t.endsWith('M')) return num * 43200;
            return num; // assume minutes
        };
        const higher = toMinutes(higherTF);
        const lower = toMinutes(lowerTF);
        return lower > 0 ? Math.max(1, Math.round(higher / lower)) : 1;
    }

    /**
     * Convert a timeframe string to seconds (PineScript-compatible)
     */
    private timeframeToSeconds(tf: string): number {
        const t = tf.toLowerCase().trim();
        const num = parseInt(t) || 1;
        if (t.endsWith('s')) return num;
        if (t.endsWith('h')) return num * 3600;
        if (t.endsWith('d') || t === 'd') return num * 86400;
        if (t.endsWith('w') || t === 'w') return num * 604800;
        if (t.endsWith('m') && !t.endsWith('M')) return num * 60; // minutes
        if (tf.endsWith('M')) return num * 2592000; // ~30 days
        return num * 60; // default: assume minutes
    }

    /**
     * Get current position size (positive = long, negative = short, 0 = flat)
     */
    private getPositionSize(): number {
        return this.openTrades.reduce((total, trade) => {
            return total + (trade.direction === 'LONG' ? trade.quantity : -trade.quantity);
        }, 0);
    }

    /**
     * Execute Destructuring Assignment
     */
    private executeDestructuringAssign(node: IRDestructuringAssign): void {
        const value = this.executeNode(node.value);

        if (Array.isArray(value)) {
            node.targets.forEach((target, i) => {
                if (i < value.length) {
                    this.context[target] = value[i];
                }
            });
        }
    }
}
