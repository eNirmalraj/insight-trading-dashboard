import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter } from './interpreter';
import { BackendVM, BackendVMOutput } from './backendVM';
import { TypeChecker } from './typeChecker';
import { Optimizer } from './optimizer';
import { ScriptCache } from './cache/scriptCache';
import { RUNTIME_LIMITS, RuntimeLimitError } from './runtimeLimits';
import {
    ASTNode,
    Program,
    Assignment,
    BinaryExpression,
    CallExpression,
    Identifier,
    Literal,
    IndexExpression,
    IfStatement,
    ForLoop,
    WhileLoop,
    FunctionDefinition,
    ReturnStatement,
    MemberExpression,
    StructDefinition,
    ArrayLiteral,
    DestructuringAssignment,
    LibraryDefinition,
    ExportStatement,
    ImportStatement,
    BreakStatement,
    ContinueStatement,
} from './types';
import {
    IRProgram,
    IR,
    IRAssign,
    IRBinaryOp,
    IRCall,
    IRVar,
    IRConst,
    IRIndex,
    IRIf,
    IRLoop,
    IRFunctionDef,
    IRReturn,
    IRMemberAccess,
    IRStructDef,
    IRArrayLiteral,
    IRDestructuringAssign,
    IRLibraryDef,
    IRExport,
    IRImport,
} from './ir';
import { Context } from './context';
import { SecurityDataCache, SecurityDataFetcher, prefetchSecurityData } from './securityProvider';
import { validateSemantics } from './semanticValidator';
import { validateIR } from './irValidator';
import { inputSystem } from './inputs/inputSystem';

export interface KuriOptions {
    optimizationLevel?: number;
    registry?: any;
    inputOverrides?: Record<string, any>;
    securityCache?: SecurityDataCache; // Pre-fetched cross-symbol data
    securityFetcher?: SecurityDataFetcher; // Async fetcher for cross-symbol data
}

export class Kuri {
    private static cache = new ScriptCache();

    /**
     * Legacy support / convenience alias for executeWithVM
     */
    public static executeKuri(
        script: string,
        context: Context,
        options: KuriOptions = {}
    ): BackendVMOutput {
        return this.executeWithVM(script, context, options);
    }

    /**
     * Legacy support / convenience alias for executeWithVMAsync
     */
    public static async executeKuriAsync(
        script: string,
        context: Context,
        options: KuriOptions = {}
    ): Promise<BackendVMOutput> {
        return this.executeWithVMAsync(script, context, options);
    }

    private static ensureFloat64ArrayContext(context: Context): Context {
        return {
            ...context,
            open:
                context.open instanceof Float64Array
                    ? context.open
                    : new Float64Array(context.open as number[]),
            high:
                context.high instanceof Float64Array
                    ? context.high
                    : new Float64Array(context.high as number[]),
            low:
                context.low instanceof Float64Array
                    ? context.low
                    : new Float64Array(context.low as number[]),
            close:
                context.close instanceof Float64Array
                    ? context.close
                    : new Float64Array(context.close as number[]),
            volume:
                context.volume instanceof Float64Array
                    ? context.volume
                    : new Float64Array(context.volume as number[]),
        };
    }

    /**
     * Executes a Kuri script against a set of market data using the Interpreter (AST-based).
     */
    public static execute(script: string, context: Context, _options: KuriOptions = {}): any {
        const safeContext = this.ensureFloat64ArrayContext(context);
        try {
            const lexer = new Lexer(script);
            const tokens = lexer.tokenize();
            const parser = new Parser(tokens, lexer.scriptVersion);
            const ast = parser.parse();
            const interpreter = new Interpreter(safeContext);
            return interpreter.run(ast);
        } catch (error) {
            console.error('Kuri Execution Error:', error);
            throw error;
        }
    }

    /**
     * Executes a Kuri script using the BackendVM (IR-based, Bar-by-Bar mode)
     */
    public static executeWithVM(
        script: string,
        context: Context,
        options: KuriOptions = {}
    ): BackendVMOutput {
        const safeContext = this.ensureFloat64ArrayContext(context);
        try {
            // Apply input overrides — these will be picked up during execution
            if (options.inputOverrides) {
                inputSystem.setPendingOverrides(options.inputOverrides);
            }
            const ir = this.compileIR(script, options);
            const vm = new BackendVM(safeContext, options.registry, options.securityCache);
            return vm.run(ir);
        } catch (error) {
            console.error('Kuri VM Execution Error:', error);
            throw error;
        }
    }

    /**
     * Executes a Kuri script using the BackendVM (Async with MTF + cross-symbol support)
     * Automatically pre-fetches required security data from request.security() calls
     */
    public static async executeWithVMAsync(
        script: string,
        context: Context,
        options: KuriOptions = {}
    ): Promise<BackendVMOutput> {
        const safeContext = this.ensureFloat64ArrayContext(context);
        try {
            if (options.inputOverrides) {
                inputSystem.setPendingOverrides(options.inputOverrides);
            }

            const ir = this.compileIR(script, options);

            // Auto-prefetch cross-symbol data if fetcher provided
            let secCache = options.securityCache || {};
            if (options.securityFetcher) {
                const prefetched = await prefetchSecurityData(
                    ir,
                    options.securityFetcher,
                    (safeContext.close?.length || 500) as number
                );
                secCache = { ...secCache, ...prefetched };
            }

            const vm = new BackendVM(safeContext, options.registry, secCache);
            return vm.run(ir);
        } catch (error) {
            console.error('Kuri VM Async Execution Error:', error);
            throw error;
        }
    }

    /**
     * Compiles a script into Intermediate Representation (IR) string.
     */
    public static compileToIR(script: string, options: KuriOptions = {}): string {
        const ir = this.compileIR(script, options);
        return JSON.stringify(ir);
    }

    /**
     * Compiles a script into Intermediate Representation (IR) object.
     */
    public static compileIR(script: string, options: KuriOptions = {}): IRProgram {
        if (script.length > RUNTIME_LIMITS.MAX_SCRIPT_SIZE_BYTES) {
            throw new RuntimeLimitError(
                `Script size exceeds maximum (${RUNTIME_LIMITS.MAX_SCRIPT_SIZE_BYTES} bytes)`
            );
        }

        const lineCount = script.split('\n').length;
        if (lineCount > RUNTIME_LIMITS.MAX_LINES) {
            throw new RuntimeLimitError(
                `Script line count exceeds maximum (${RUNTIME_LIMITS.MAX_LINES} lines)`
            );
        }

        const cached = this.cache.get(script);
        if (cached) return cached as IRProgram;

        const lexer = new Lexer(script);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens, lexer.scriptVersion);
        const ast = parser.parse();

        // Type checker is advisory — log warnings but don't block execution.
        // The checker can't fully infer types through assignments, function params,
        // and complex expressions, so it produces false positives on valid scripts.
        try {
            const checker = new TypeChecker();
            const errors = checker.check(ast);
            if (errors.length > 0) {
                console.warn(`Kuri type warnings: ${errors.join(', ')}`);
            }
        } catch (_) {
            // Type checker crash — ignore, don't block compilation
        }

        const optimizer = new Optimizer();
        const optimizedAst =
            options.optimizationLevel !== 0
                ? optimizer.optimize(ast, options.optimizationLevel || 1)
                : ast;

        const ir = this.transformToIR(optimizedAst);
        this.cache.set(script, ir);
        return ir;
    }

    public static transformToIR(program: Program): IRProgram {
        const irProgram: IRProgram = {
            type: 'IR_PROGRAM',
            statements: program.body.map((stmt) => this.transformNode(stmt)),
        };

        // Pass through script metadata
        if (program.scriptVersion) {
            irProgram.scriptVersion = program.scriptVersion;
        }

        if (program.scriptDeclaration) {
            const decl = program.scriptDeclaration;
            if (decl.type === 'IndicatorDeclaration') {
                irProgram.scriptType = 'indicator';
                irProgram.metadata = {
                    title: decl.title,
                    shorttitle: decl.shorttitle,
                    overlay: decl.overlay,
                    format: decl.format,
                    precision: decl.precision,
                };
            } else if (decl.type === 'StrategyDeclaration') {
                irProgram.scriptType = 'strategy';
                irProgram.metadata = {
                    title: decl.title,
                    shorttitle: decl.shorttitle,
                    overlay: decl.overlay,
                    format: decl.format,
                    precision: decl.precision,
                    initial_capital: decl.initial_capital,
                    pyramiding: decl.pyramiding,
                    default_qty_type: decl.default_qty_type,
                    default_qty_value: decl.default_qty_value,
                };
            }
        }

        return irProgram;
    }

    private static transformNode(node: ASTNode): IR {
        let ir: IR;
        switch (node.type) {
            case 'Assignment': {
                const assign = node as Assignment;
                ir = {
                    type: 'IR_ASSIGN',
                    name: assign.name,
                    value: this.transformNode(assign.value),
                    isVar: assign.isVar || false,
                    isReassignment: assign.isReassignment || false,
                };
                break;
            }
            case 'BinaryExpression': {
                const binary = node as BinaryExpression;
                ir = {
                    type: 'IR_BINARY_OP',
                    operator: binary.operator as any,
                    left: this.transformNode(binary.left),
                    right: this.transformNode(binary.right),
                };
                break;
            }
            case 'CallExpression': {
                const call = node as CallExpression;
                ir = {
                    type: 'IR_CALL',
                    func: this.flattenCallee(call.callee as any),
                    args: call.arguments.map((arg: any) => this.transformNode(arg)),
                };
                break;
            }
            case 'CallArgument': {
                const callArg = node as any;
                ir = {
                    type: 'IR_CALL_ARGUMENT',
                    name: callArg.name,
                    value: this.transformNode(callArg.value),
                } as any;
                break;
            }
            case 'Identifier': {
                const id = node as Identifier;
                ir = {
                    type: 'IR_VAR',
                    name: id.name,
                };
                break;
            }
            case 'Literal': {
                const lit = node as Literal;
                ir = {
                    type: 'IR_CONST',
                    value: lit.value,
                };
                break;
            }
            case 'IndexExpression': {
                const indexExpr = node as IndexExpression;
                ir = {
                    type: 'IR_INDEX',
                    object: this.transformNode(indexExpr.object),
                    index: this.transformNode(indexExpr.index),
                };
                break;
            }
            case 'IfStatement': {
                const ifStmt = node as IfStatement;
                ir = {
                    type: 'IR_IF',
                    condition: this.transformNode(ifStmt.condition),
                    consequent: ifStmt.consequent.map((s: ASTNode) => this.transformNode(s)),
                    alternate: ifStmt.alternate
                        ? ifStmt.alternate.map((s: ASTNode) => this.transformNode(s))
                        : undefined,
                };
                break;
            }
            case 'ForLoop': {
                const forLoop = node as ForLoop;
                if ((forLoop as any).forIn) {
                    // for...in loop: for element in collection { body }
                    // For for-in loops, the iterable is stored in init.value (parser stores it there)
                    // condition contains a dummy __forin_var__ identifier, NOT the iterable
                    const iterableNode = forLoop.init?.value
                        ? this.transformNode((forLoop.init as any).value)
                        : forLoop.condition
                          ? this.transformNode(forLoop.condition)
                          : undefined;
                    ir = {
                        type: 'IR_LOOP',
                        loopType: 'for_in',
                        condition: { type: 'IR_CONST', value: true } as any,
                        body: forLoop.body.map((s: ASTNode) => this.transformNode(s)),
                        iterVar: (forLoop as any).iterVar || (forLoop.init as any)?.name,
                        iterable: iterableNode,
                    } as IRLoop;
                } else {
                    // Standard for loop
                    ir = {
                        type: 'IR_LOOP',
                        loopType: 'for',
                        init: forLoop.init
                            ? (this.transformNode(forLoop.init) as IRAssign)
                            : undefined,
                        condition: forLoop.condition
                            ? this.transformNode(forLoop.condition)
                            : (undefined as any),
                        increment: forLoop.increment
                            ? (this.transformNode(forLoop.increment) as IRAssign)
                            : undefined,
                        body: forLoop.body.map((s: ASTNode) => this.transformNode(s)),
                    } as IRLoop;
                }
                break;
            }
            case 'WhileLoop': {
                const whileLoop = node as WhileLoop;
                ir = {
                    type: 'IR_LOOP',
                    loopType: 'while',
                    condition: this.transformNode(whileLoop.condition),
                    body: whileLoop.body.map((s: ASTNode) => this.transformNode(s)),
                };
                break;
            }
            case 'BreakStatement':
                ir = { type: 'IR_BREAK' };
                break;
            case 'ContinueStatement':
                ir = { type: 'IR_CONTINUE' };
                break;
            case 'FunctionDefinition': {
                const funcDef = node as FunctionDefinition;
                const hasDefaults = funcDef.params.some((p: any) => p.defaultValue);
                ir = {
                    type: 'IR_FUNCTION_DEF',
                    name: funcDef.name,
                    params: funcDef.params.map((p: any) => p.name),
                    paramDefaults: hasDefaults
                        ? funcDef.params.map((p: any) =>
                              p.defaultValue ? this.transformNode(p.defaultValue) : null
                          )
                        : undefined,
                    body: funcDef.body.map((s: ASTNode) => this.transformNode(s)),
                };
                break;
            }
            case 'ReturnStatement': {
                const ret = node as ReturnStatement;
                ir = {
                    type: 'IR_RETURN',
                    value: ret.value ? this.transformNode(ret.value) : undefined,
                };
                break;
            }
            case 'MemberExpression': {
                const member = node as MemberExpression;
                ir = {
                    type: 'IR_MEMBER_ACCESS',
                    object: this.transformNode(member.object),
                    property: member.property,
                    optional: (member as any).optional || false,
                };
                break;
            }
            case 'StructDefinition': {
                const structDef = node as StructDefinition;
                ir = {
                    type: 'IR_STRUCT_DEF',
                    name: structDef.name,
                    fields: structDef.fields.map((f) => ({
                        name: f.name,
                        type: String(f.fieldType),
                    })),
                };
                break;
            }
            case 'ArrayLiteral': {
                const arrLit = node as ArrayLiteral;
                ir = {
                    type: 'IR_ARRAY_LITERAL',
                    elements: arrLit.elements.map((e: ASTNode) => this.transformNode(e)),
                };
                break;
            }
            case 'DestructuringAssignment': {
                const destAssign = node as DestructuringAssignment;
                ir = {
                    type: 'IR_DESTRUCTURING_ASSIGN',
                    targets: destAssign.targets,
                    value: this.transformNode(destAssign.value),
                    isVar: destAssign.isVar || false,
                };
                break;
            }
            case 'LibraryDefinition': {
                const libDef = node as LibraryDefinition;
                ir = {
                    type: 'IR_LIBRARY_DEF',
                    name: libDef.name,
                    version: libDef.version,
                    overlay: libDef.overlay,
                    metadata: libDef.metadata,
                };
                break;
            }
            case 'ExportStatement': {
                const exportStmt = node as ExportStatement;
                const declaration = this.transformNode(exportStmt.declaration) as
                    | IRFunctionDef
                    | IRAssign;
                ir = {
                    type: 'IR_EXPORT',
                    name: (declaration as any).name,
                    definition: declaration,
                };
                break;
            }
            case 'ImportStatement': {
                const importStmt = node as ImportStatement;
                ir = {
                    type: 'IR_IMPORT',
                    libraryName: importStmt.libraryName,
                    alias: importStmt.alias || importStmt.libraryName,
                };
                break;
            }
            case 'MatchStatement': {
                const matchStmt = node as import('./types').MatchStatement;
                const subjectIR = this.transformNode(matchStmt.subject);
                const defaultBody = matchStmt.defaultCase
                    ? matchStmt.defaultCase.map((s: ASTNode) => this.transformNode(s))
                    : undefined;
                let currentIR: IR | undefined;
                for (let i = matchStmt.cases.length - 1; i >= 0; i--) {
                    const c = matchStmt.cases[i];
                    const condIR: IR = {
                        type: 'IR_BINARY_OP',
                        operator: '==',
                        left: subjectIR,
                        right: this.transformNode(c.pattern),
                    } as any;
                    const bodyIR = c.body.map((s: ASTNode) => this.transformNode(s));
                    currentIR = {
                        type: 'IR_IF',
                        condition: condIR,
                        consequent: bodyIR,
                        alternate: currentIR ? [currentIR] : defaultBody,
                    } as any;
                }
                ir = currentIR || ({ type: 'IR_CONST', value: null } as IRConst);
                break;
            }

            default:
                throw new Error(`Unknown AST node type: ${node.type}`);
        }

        if (node.line !== undefined) {
            ir.meta = {
                line: node.line,
                column: node.column,
            };
        }
        return ir;
    }

    public static getVarValue(name: string, context: Context): any {
        return context[name];
    }

    private static flattenCallee(node: any): string {
        if (node.type === 'Identifier') {
            return node.name;
        }
        if (node.type === 'MemberExpression') {
            return `${this.flattenCallee(node.object)}.${node.property}`;
        }
        return String(node);
    }

    /**
     * Provide diagnostics (errors/warnings) for a Kuri script without executing it.
     * Returns structured error info with line/column for Monaco marker integration.
     */
    public static provideDiagnostics(script: string): KuriDiagnostic[] {
        const diagnostics: KuriDiagnostic[] = [];

        if (!script || script.trim().length === 0) return diagnostics;

        // Check script size limits
        if (script.length > RUNTIME_LIMITS.MAX_SCRIPT_SIZE_BYTES) {
            diagnostics.push({
                line: 1,
                column: 1,
                endLine: 1,
                endColumn: 1,
                message: `Script size exceeds maximum (${RUNTIME_LIMITS.MAX_SCRIPT_SIZE_BYTES} bytes)`,
                severity: 'error',
            });
            return diagnostics;
        }

        const lineCount = script.split('\n').length;
        if (lineCount > RUNTIME_LIMITS.MAX_LINES) {
            diagnostics.push({
                line: 1,
                column: 1,
                endLine: 1,
                endColumn: 1,
                message: `Script exceeds maximum line count (${RUNTIME_LIMITS.MAX_LINES} lines)`,
                severity: 'error',
            });
            return diagnostics;
        }

        // Phase 1: Lexer
        let tokens;
        try {
            const lexer = new Lexer(script);
            tokens = lexer.tokenize();
        } catch (e: any) {
            const loc = this.extractErrorLocation(e.message, script);
            diagnostics.push({
                ...loc,
                message: e.message,
                severity: 'error',
            });
            return diagnostics;
        }

        // Phase 2: Parser
        let ast;
        try {
            const lexer = new Lexer(script);
            const parser = new Parser(tokens, lexer.scriptVersion);
            ast = parser.parse();
        } catch (e: any) {
            const loc = this.extractErrorLocation(e.message, script);
            diagnostics.push({
                ...loc,
                message: e.message,
                severity: 'error',
            });
            return diagnostics;
        }

        // Phase 3: Type checker — errors are real errors, not warnings
        try {
            const checker = new TypeChecker();
            const errors = checker.check(ast);
            for (const err of errors) {
                diagnostics.push({
                    line: err.line,
                    column: err.column,
                    endLine: err.endLine,
                    endColumn: err.endColumn,
                    message: err.message,
                    severity: err.severity,
                });
            }
        } catch (e: any) {
            // Type checker crash — report as warning (checker itself broke, not the script)
            diagnostics.push({
                line: 1,
                column: 1,
                endLine: 1,
                endColumn: 1,
                message: `Type checker error: ${e.message}`,
                severity: 'warning',
            });
        }

        // Phase 4: IR transformation + validation
        let ir: IRProgram | null = null;
        try {
            ir = this.transformToIR(ast);
        } catch (e: any) {
            const loc = this.extractErrorLocation(e.message, script);
            diagnostics.push({
                ...loc,
                message: e.message,
                severity: 'error',
            });
        }

        // Phase 4b: IR structural validation
        if (ir) {
            try {
                const irIssues = validateIR(ir);
                for (const issue of irIssues) {
                    diagnostics.push({
                        line: issue.line || 1,
                        column: issue.column || 1,
                        endLine: issue.line || 1,
                        endColumn: (issue.column || 1) + 1,
                        message: issue.message,
                        severity: issue.severity,
                    });
                }
            } catch (_) {
                // IR validator crash — don't block
            }
        }

        // Phase 5: Semantic validation — break/continue outside loop, return outside func,
        // na comparison, duplicate vars, argument count validation
        try {
            const semanticIssues = validateSemantics(ast);
            for (const issue of semanticIssues) {
                const lines = script.split('\n');
                const lineContent = lines[issue.line - 1] || '';
                diagnostics.push({
                    line: issue.line,
                    column: issue.column,
                    endLine: issue.line,
                    endColumn: lineContent.length + 1,
                    message: issue.code ? `[${issue.code}] ${issue.message}` : issue.message,
                    severity: issue.severity,
                    code: issue.code,
                    suggestion: issue.suggestion,
                });
            }
        } catch (e: any) {
            // Semantic validator crash — report as warning, don't block
            diagnostics.push({
                line: 1,
                column: 1,
                endLine: 1,
                endColumn: 1,
                message: `Semantic validation error: ${e.message}`,
                severity: 'warning',
            });
        }

        // Phase 6: Script structure validation
        // Check for missing declaration and required output
        const scriptText = script.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
        const hasIndicatorDecl = /\bindicator\s*\(/.test(scriptText);
        const hasStrategyDecl = /\bstrategy\s*\(/.test(scriptText);

        if (!hasIndicatorDecl && !hasStrategyDecl) {
            diagnostics.push({
                line: 1,
                column: 1,
                endLine: 1,
                endColumn: 1,
                message:
                    'Missing script declaration. Start with indicator("Name") or strategy("Name").',
                severity: 'error',
            });
        }

        if (hasIndicatorDecl && !hasStrategyDecl) {
            // Indicator must have at least one visual output: plot(), drawing functions (line.new, label.new, box.new), or plotshape/plotchar
            const hasVisualOutput =
                /\bplot\s*\(|\bplotLine\s*\(|\bplotHistogram\s*\(|\bplotArea\s*\(|\bplotBand\s*\(|\bplotHLine\s*\(|\bplotCloud\s*\(|\bplotColumns\s*\(|\bhline\s*\(|\bline\.new\s*\(|\blabel\.new\s*\(|\bbox\.new\s*\(|\bplotshape\s*\(|\bplotchar\s*\(/.test(
                    scriptText
                );
            if (!hasVisualOutput) {
                diagnostics.push({
                    line: 1,
                    column: 1,
                    endLine: 1,
                    endColumn: 1,
                    message:
                        'Indicator scripts must have at least one plot() or drawing call (line.new, label.new) to display on the chart.',
                    severity: 'error',
                });
            }
        }

        if (hasStrategyDecl && !hasIndicatorDecl) {
            // Strategy must have at least one strategy.entry() call
            const hasEntry = /\bstrategy\.(entry|order)\s*\(/.test(scriptText);
            if (!hasEntry) {
                diagnostics.push({
                    line: 1,
                    column: 1,
                    endLine: 1,
                    endColumn: 1,
                    message:
                        'Strategy scripts must have at least one strategy.entry() call to generate signals.',
                    severity: 'error',
                });
            }
        }

        return diagnostics;
    }

    /**
     * Extract line/column from error message patterns like "at line 5" or "line 5, column 10"
     */
    private static extractErrorLocation(
        message: string,
        script: string
    ): { line: number; column: number; endLine: number; endColumn: number } {
        // Try to match "at line N" pattern (used by parser)
        const lineMatch = message.match(/at line (\d+)/);
        if (lineMatch) {
            const line = parseInt(lineMatch[1], 10);
            const lines = script.split('\n');
            const lineContent = lines[line - 1] || '';
            return {
                line,
                column: 1,
                endLine: line,
                endColumn: lineContent.length + 1,
            };
        }

        // Try to match "line N, column M" pattern
        const fullMatch = message.match(/line (\d+),?\s*column (\d+)/);
        if (fullMatch) {
            const line = parseInt(fullMatch[1], 10);
            const col = parseInt(fullMatch[2], 10);
            return { line, column: col, endLine: line, endColumn: col + 1 };
        }

        // Default: mark the first line
        return { line: 1, column: 1, endLine: 1, endColumn: 1 };
    }
}

export interface KuriDiagnostic {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    code?: string; // Error code (K001, K010, etc.)
    suggestion?: string; // Suggested fix
}
