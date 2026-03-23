import {
    ASTNode,
    Program,
    Assignment,
    BinaryExpression,
    CallExpression,
    Identifier,
    Literal,
    IndexExpression,
    MemberExpression,
    StructDefinition,
    ArrayLiteral,
} from './types';
import {
    KuriType,
    TypeInfo,
    isSeries,
    getSeriesType,
    getScalarType,
    isTypeCompatible,
} from './typeSystem';
import { createKuriError } from './errors';
import type { KuriError } from './errors';

export class TypeChecker {
    private symbolTable: Map<string, KuriType> = new Map();
    private structRegistry: Map<string, { name: string; fields: Map<string, KuriType> }> =
        new Map();
    private functionRegistry: Map<
        string,
        { name: string; params: { name: string; type: KuriType }[]; returnType: KuriType }
    > = new Map();
    private errors: KuriError[] = [];

    constructor() {
        // Initialize with standard context variables
        this.symbolTable.set('open', KuriType.SERIES_FLOAT);
        this.symbolTable.set('high', KuriType.SERIES_FLOAT);
        this.symbolTable.set('low', KuriType.SERIES_FLOAT);
        this.symbolTable.set('close', KuriType.SERIES_FLOAT);
        this.symbolTable.set('volume', KuriType.SERIES_FLOAT);

        // Register built-in functions
        this.registerBuiltin(
            'sma',
            [
                { name: 'source', type: KuriType.SERIES_FLOAT },
                { name: 'period', type: KuriType.INT },
            ],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'ta.sma',
            [
                { name: 'source', type: KuriType.SERIES_FLOAT },
                { name: 'period', type: KuriType.INT },
            ],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'ema',
            [
                { name: 'source', type: KuriType.SERIES_FLOAT },
                { name: 'period', type: KuriType.INT },
            ],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'ta.ema',
            [
                { name: 'source', type: KuriType.SERIES_FLOAT },
                { name: 'period', type: KuriType.INT },
            ],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'rsi',
            [
                { name: 'source', type: KuriType.SERIES_FLOAT },
                { name: 'period', type: KuriType.INT },
            ],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'ta.rsi',
            [
                { name: 'source', type: KuriType.SERIES_FLOAT },
                { name: 'period', type: KuriType.INT },
            ],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'crossover',
            [KuriType.SERIES_FLOAT, KuriType.SERIES_FLOAT],
            KuriType.SERIES_BOOL
        );
        this.registerBuiltin(
            'ta.crossover',
            [KuriType.SERIES_FLOAT, KuriType.SERIES_FLOAT],
            KuriType.SERIES_BOOL
        );
        this.registerBuiltin(
            'crossunder',
            [KuriType.SERIES_FLOAT, KuriType.SERIES_FLOAT],
            KuriType.SERIES_BOOL
        );
        this.registerBuiltin(
            'ta.crossunder',
            [KuriType.SERIES_FLOAT, KuriType.SERIES_FLOAT],
            KuriType.SERIES_BOOL
        );
        this.registerBuiltin('plot', [KuriType.ANY], KuriType.VOID);

        // Moving Averages
        this.registerBuiltin('wma', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin(
            'vwma',
            [KuriType.SERIES_FLOAT, KuriType.SERIES_FLOAT, KuriType.INT],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin('hma', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin('rma', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin(
            'alma',
            [KuriType.SERIES_FLOAT, KuriType.INT, KuriType.FLOAT, KuriType.FLOAT],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin('swma', [KuriType.SERIES_FLOAT], KuriType.SERIES_FLOAT);
        this.registerBuiltin('kama', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin('dema', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin('tema', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin('zlema', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin('smma', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);

        // Oscillators
        const stochParams = [
            { name: 'source', type: KuriType.SERIES_FLOAT },
            { name: 'high', type: KuriType.SERIES_FLOAT },
            { name: 'low', type: KuriType.SERIES_FLOAT },
            { name: 'length', type: KuriType.INT },
        ];
        this.registerBuiltin('stoch', stochParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.stoch', stochParams, KuriType.SERIES_FLOAT);

        this.registerBuiltin(
            'cci',
            [
                { name: 'source', type: KuriType.SERIES_FLOAT },
                { name: 'length', type: KuriType.INT },
            ],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'ta.cci',
            [
                { name: 'source', type: KuriType.SERIES_FLOAT },
                { name: 'length', type: KuriType.INT },
            ],
            KuriType.SERIES_FLOAT
        );

        const mfiParams = [
            { name: 'high', type: KuriType.SERIES_FLOAT },
            { name: 'low', type: KuriType.SERIES_FLOAT },
            { name: 'close', type: KuriType.SERIES_FLOAT },
            { name: 'volume', type: KuriType.SERIES_FLOAT },
            { name: 'length', type: KuriType.INT },
        ];
        this.registerBuiltin('mfi', mfiParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.mfi', mfiParams, KuriType.SERIES_FLOAT);

        const adxParams = [
            { name: 'high', type: KuriType.SERIES_FLOAT },
            { name: 'low', type: KuriType.SERIES_FLOAT },
            { name: 'close', type: KuriType.SERIES_FLOAT },
            { name: 'length', type: KuriType.INT },
        ];
        this.registerBuiltin('adx', adxParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.adx', adxParams, KuriType.SERIES_FLOAT);

        const macdParams = [
            { name: 'source', type: KuriType.SERIES_FLOAT },
            { name: 'fastPeriod', type: KuriType.INT },
            { name: 'slowPeriod', type: KuriType.INT },
            { name: 'signalPeriod', type: KuriType.INT },
        ];
        this.registerBuiltin('macd', macdParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.macd', macdParams, KuriType.SERIES_FLOAT);

        // Volatility
        const atrParams = [
            { name: 'high', type: KuriType.SERIES_FLOAT },
            { name: 'low', type: KuriType.SERIES_FLOAT },
            { name: 'close', type: KuriType.SERIES_FLOAT },
            { name: 'period', type: KuriType.INT },
        ];
        this.registerBuiltin('atr', atrParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.atr', atrParams, KuriType.SERIES_FLOAT);

        const supertrendParams = [
            { name: 'period', type: KuriType.INT },
            { name: 'multiplier', type: KuriType.FLOAT },
        ];
        this.registerBuiltin('supertrend', supertrendParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.supertrend', supertrendParams, KuriType.SERIES_FLOAT);

        const bbParams = [
            { name: 'source', type: KuriType.SERIES_FLOAT },
            { name: 'period', type: KuriType.INT },
            { name: 'stdDev', type: KuriType.FLOAT },
        ];
        this.registerBuiltin('bollinger', bbParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.bollinger', bbParams, KuriType.SERIES_FLOAT);

        // Volume
        const vwapParams = [
            { name: 'high', type: KuriType.SERIES_FLOAT },
            { name: 'low', type: KuriType.SERIES_FLOAT },
            { name: 'close', type: KuriType.SERIES_FLOAT },
            { name: 'volume', type: KuriType.SERIES_FLOAT },
        ];
        this.registerBuiltin('vwap', vwapParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.vwap', vwapParams, KuriType.SERIES_FLOAT);

        const obvParams = [
            { name: 'close', type: KuriType.SERIES_FLOAT },
            { name: 'volume', type: KuriType.SERIES_FLOAT },
        ];
        this.registerBuiltin('obv', obvParams, KuriType.SERIES_FLOAT);
        this.registerBuiltin('ta.obv', obvParams, KuriType.SERIES_FLOAT);

        // Statistics
        this.registerBuiltin(
            'linreg',
            [KuriType.SERIES_FLOAT, KuriType.INT, KuriType.INT],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'variance',
            [KuriType.SERIES_FLOAT, KuriType.INT],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin('stdev', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin('mode', [KuriType.SERIES_FLOAT, KuriType.INT], KuriType.SERIES_FLOAT);
        this.registerBuiltin(
            'highest',
            [KuriType.SERIES_FLOAT, KuriType.INT],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'lowest',
            [KuriType.SERIES_FLOAT, KuriType.INT],
            KuriType.SERIES_FLOAT
        );

        // Alert
        this.registerBuiltin(
            'alertcondition',
            [KuriType.ANY, KuriType.STRING, KuriType.STRING],
            KuriType.VOID
        );

        // Input functions — return their declared type
        this.registerBuiltin('input', [KuriType.ANY], KuriType.ANY);
        this.registerBuiltin('input.int', [KuriType.INT], KuriType.INT);
        this.registerBuiltin('input.float', [KuriType.FLOAT], KuriType.FLOAT);
        this.registerBuiltin('input.bool', [KuriType.BOOL], KuriType.BOOL);
        this.registerBuiltin('input.string', [KuriType.STRING], KuriType.STRING);
        this.registerBuiltin('input.source', [KuriType.SERIES_FLOAT], KuriType.SERIES_FLOAT);
        this.registerBuiltin('input.color', [KuriType.COLOR], KuriType.COLOR);
        this.registerBuiltin('input.timeframe', [KuriType.STRING], KuriType.STRING);
        this.registerBuiltin('timeframe.in_seconds', [KuriType.STRING], KuriType.INT);
        this.registerBuiltin('input.symbol', [KuriType.STRING], KuriType.STRING);
        this.registerBuiltin('input.session', [KuriType.STRING], KuriType.STRING);
        this.registerBuiltin('input.price', [KuriType.FLOAT], KuriType.FLOAT);

        // Utility functions
        this.registerBuiltin('nz', [KuriType.ANY, KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('na', [KuriType.ANY], KuriType.BOOL);
        this.registerBuiltin('fixnan', [KuriType.SERIES_FLOAT], KuriType.SERIES_FLOAT);

        // Math functions — accept ANY because they work with float, int, and series<float>
        this.registerBuiltin('math.abs', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.ceil', [KuriType.ANY], KuriType.INT);
        this.registerBuiltin('math.floor', [KuriType.ANY], KuriType.INT);
        this.registerBuiltin('math.round', [KuriType.ANY], KuriType.INT);
        this.registerBuiltin('math.max', [KuriType.ANY, KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.min', [KuriType.ANY, KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.pow', [KuriType.ANY, KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.sqrt', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.log', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.exp', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.sin', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.cos', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.tan', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.sign', [KuriType.ANY], KuriType.INT);
        this.registerBuiltin('math.avg', [KuriType.ANY, KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.sum', [KuriType.ANY, KuriType.ANY], KuriType.SERIES_FLOAT);
        this.registerBuiltin('math.todegrees', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.toradians', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('math.random', [], KuriType.FLOAT);

        // String functions
        this.registerBuiltin('str.tostring', [KuriType.ANY, KuriType.STRING], KuriType.STRING);
        this.registerBuiltin('str.contains', [KuriType.STRING, KuriType.STRING], KuriType.BOOL);
        this.registerBuiltin('str.length', [KuriType.STRING], KuriType.INT);
        this.registerBuiltin('str.upper', [KuriType.STRING], KuriType.STRING);
        this.registerBuiltin('str.lower', [KuriType.STRING], KuriType.STRING);
        this.registerBuiltin(
            'str.replace',
            [KuriType.STRING, KuriType.STRING, KuriType.STRING],
            KuriType.STRING
        );
        this.registerBuiltin(
            'str.replace_all',
            [KuriType.STRING, KuriType.STRING, KuriType.STRING],
            KuriType.STRING
        );
        this.registerBuiltin('str.split', [KuriType.STRING, KuriType.STRING], KuriType.ANY);
        this.registerBuiltin('str.startswith', [KuriType.STRING, KuriType.STRING], KuriType.BOOL);
        this.registerBuiltin('str.endswith', [KuriType.STRING, KuriType.STRING], KuriType.BOOL);
        this.registerBuiltin(
            'str.substring',
            [KuriType.STRING, KuriType.INT, KuriType.INT],
            KuriType.STRING
        );
        this.registerBuiltin('str.trim', [KuriType.STRING], KuriType.STRING);
        this.registerBuiltin('str.format', [KuriType.STRING], KuriType.STRING);
        this.registerBuiltin('str.tonumber', [KuriType.STRING], KuriType.FLOAT);
        this.registerBuiltin('str.repeat', [KuriType.STRING, KuriType.INT], KuriType.STRING);
        this.registerBuiltin('str.match', [KuriType.STRING, KuriType.STRING], KuriType.BOOL);
        this.registerBuiltin('str.pos', [KuriType.STRING, KuriType.STRING], KuriType.INT);

        // Plot functions (return VOID)
        this.registerBuiltin(
            'plotshape',
            [KuriType.ANY, KuriType.STRING, KuriType.STRING],
            KuriType.VOID
        );
        this.registerBuiltin('plotline', [KuriType.ANY], KuriType.VOID);
        this.registerBuiltin('plotarea', [KuriType.ANY], KuriType.VOID);
        this.registerBuiltin('plothistogram', [KuriType.ANY], KuriType.VOID);
        this.registerBuiltin('plotband', [KuriType.ANY, KuriType.ANY], KuriType.VOID);
        this.registerBuiltin('plothline', [KuriType.FLOAT], KuriType.VOID);
        this.registerBuiltin('plotarrow', [KuriType.ANY], KuriType.VOID);
        this.registerBuiltin('plotcolumns', [KuriType.ANY], KuriType.VOID);
        this.registerBuiltin('plotlabel', [KuriType.ANY], KuriType.VOID);

        // Color functions
        this.registerBuiltin('color.new', [KuriType.COLOR, KuriType.INT], KuriType.COLOR);
        this.registerBuiltin(
            'color.rgb',
            [KuriType.INT, KuriType.INT, KuriType.INT],
            KuriType.COLOR
        );
        this.registerBuiltin(
            'color.from_gradient',
            [KuriType.FLOAT, KuriType.FLOAT, KuriType.FLOAT, KuriType.COLOR, KuriType.COLOR],
            KuriType.COLOR
        );

        // Type casting
        this.registerBuiltin('float', [KuriType.ANY], KuriType.FLOAT);
        this.registerBuiltin('int', [KuriType.ANY], KuriType.INT);
        this.registerBuiltin('bool', [KuriType.ANY], KuriType.BOOL);
        this.registerBuiltin('string', [KuriType.ANY], KuriType.STRING);

        // ta.highest / ta.lowest / ta.change
        this.registerBuiltin(
            'ta.highest',
            [KuriType.SERIES_FLOAT, KuriType.INT],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin(
            'ta.lowest',
            [KuriType.SERIES_FLOAT, KuriType.INT],
            KuriType.SERIES_FLOAT
        );
        this.registerBuiltin('ta.change', [KuriType.SERIES_FLOAT], KuriType.SERIES_FLOAT);
        this.registerBuiltin(
            'ta.bb',
            [KuriType.SERIES_FLOAT, KuriType.INT, KuriType.FLOAT],
            KuriType.SERIES_FLOAT
        );
    }

    private registerBuiltin(
        name: string,
        params: (KuriType | { name: string; type: KuriType })[],
        returnType: KuriType
    ) {
        const normalizedParams = params.map((p, i) =>
            typeof p === 'string'
                ? { name: `arg${i}`, type: p as KuriType }
                : (p as { name: string; type: KuriType })
        );
        this.functionRegistry.set(name, { name, params: normalizedParams, returnType });
    }

    private addError(node: ASTNode | null, code: string, message: string, suggestion?: string) {
        this.errors.push(
            createKuriError(code, {
                message,
                category: 'type',
                line: node?.line ?? 1,
                column: node?.column ?? 1,
                suggestion,
            })
        );
    }

    public check(program: Program): KuriError[] {
        this.errors = [];
        for (const stmt of program.body) {
            try {
                this.inferType(stmt);
            } catch (e: any) {
                this.addError(stmt, 'K800', e.message);
            }
        }
        return this.errors;
    }

    private inferType(node: ASTNode): KuriType {
        if (node.varType) return node.varType;

        let type: KuriType = KuriType.VOID;

        switch (node.type) {
            case 'Assignment':
                type = this.checkAssignment(node as Assignment);
                break;
            case 'BinaryExpression':
                type = this.checkBinary(node as BinaryExpression);
                break;
            case 'CallExpression':
                type = this.checkCall(node as CallExpression);
                break;
            case 'Identifier':
                type = this.checkIdentifier(node as Identifier);
                break;
            case 'Literal':
                type = this.checkLiteral(node as Literal);
                break;
            case 'IndexExpression':
                type = this.checkIndex(node as IndexExpression);
                break;
            case 'IfStatement':
                const ifStmt = node as any;
                const condType = this.inferType(ifStmt.condition);
                // Allow BOOL, SERIES_BOOL, ANY, INT, FLOAT, SERIES_INT, SERIES_FLOAT, na (truthy/falsy at runtime)
                // Only error on types that can never be conditions (VOID, STRING, COLOR)
                if (
                    condType !== KuriType.BOOL &&
                    condType !== KuriType.SERIES_BOOL &&
                    condType !== KuriType.ANY &&
                    condType !== KuriType.INT &&
                    condType !== KuriType.FLOAT &&
                    condType !== KuriType.SERIES_INT &&
                    condType !== KuriType.SERIES_FLOAT &&
                    condType !== KuriType.na
                ) {
                    this.addError(
                        ifStmt.condition,
                        'K801',
                        `If condition must be boolean, got ${condType}`
                    );
                }
                // Infer types of both branches
                let consequentType = KuriType.VOID;
                if (ifStmt.consequent) {
                    ifStmt.consequent.forEach((s: ASTNode) => {
                        consequentType = this.inferType(s);
                    });
                }
                let alternateType = KuriType.VOID;
                if (ifStmt.alternate) {
                    ifStmt.alternate.forEach((s: ASTNode) => {
                        alternateType = this.inferType(s);
                    });
                }
                // If used as ternary expression (both branches present and non-VOID),
                // return the branch type instead of VOID
                if (
                    ifStmt.alternate &&
                    (consequentType !== KuriType.VOID || alternateType !== KuriType.VOID)
                ) {
                    // Pick the more specific type between branches
                    if (consequentType === KuriType.VOID || consequentType === KuriType.ANY) {
                        type = alternateType;
                    } else {
                        type = consequentType;
                    }
                } else {
                    type = KuriType.VOID;
                }
                break;
            case 'StructDefinition':
                type = this.checkStructDefinition(node as StructDefinition);
                break;
            case 'MemberExpression':
                type = this.checkMemberExpression(node as MemberExpression);
                break;
            case 'ArrayLiteral':
                const arrayLit = node as ArrayLiteral;
                arrayLit.elements.forEach((e) => this.inferType(e));
                type = KuriType.ANY; // Arrays are dynamic/heap references for now
                break;
            case 'FunctionDefinition':
                type = this.checkFunctionDefinition(node as any);
                break;
            case 'ForLoop':
            case 'WhileLoop':
            case 'BreakStatement':
            case 'ContinueStatement':
            case 'ReturnStatement':
                // Control flow statements don't need deep type checking for Phase 1
                type = KuriType.VOID;
                break;
            default:
                type = KuriType.VOID;
        }

        node.varType = type;
        return type;
    }

    private checkAssignment(node: Assignment): KuriType {
        const rightType = this.inferType(node.value);
        let leftType = this.symbolTable.get(node.name);

        // Explicit Type Declaration
        if (node.declaredType) {
            if (leftType && leftType !== node.declaredType) {
                this.addError(
                    node,
                    'K800',
                    `Variable '${node.name}' redeclared with different type: expected ${leftType}, got ${node.declaredType}`
                );
            }
            leftType = node.declaredType;
            this.symbolTable.set(node.name, leftType);
        }

        if (!leftType) {
            // First time assignment — if VOID, treat as ANY (value will resolve at runtime)
            const assignType = rightType === KuriType.VOID ? KuriType.ANY : rightType;
            this.symbolTable.set(node.name, assignType);
            return assignType;
        }

        // Check compatibility
        if (!isTypeCompatible(leftType, rightType)) {
            // Allow promotion from na to anything
            if (leftType === KuriType.na) {
                this.symbolTable.set(node.name, rightType);
                return rightType;
            }
            // Allow VOID/ANY on right side (runtime-resolved values like ternaries)
            if (rightType === KuriType.VOID || rightType === KuriType.ANY) {
                return leftType;
            }
            // Phase 4.3: User-Friendly Errors
            const line = (node as any).line || '?';
            const column = (node as any).column || '?';

            const formattedError = `❌ Error at script:${line}:${column}\n   Type mismatch: Cannot assign ${rightType} to ${leftType}\n   \n   ${node.name} = ${rightType}\n                       ^^^\n   \n   💡 Hint: Check that both sides of the assignment have compatible types.`;

            this.addError(
                node,
                'K800',
                formattedError,
                'Check that both sides of the assignment have compatible types.'
            );
        }

        return leftType;
    }

    private checkBinary(node: BinaryExpression): KuriType {
        const left = this.inferType(node.left);
        const right = this.inferType(node.right);
        const isSeriesOp = isSeries(left) || isSeries(right);
        const leftScalar = getScalarType(left);
        const rightScalar = getScalarType(right);
        let scalarResult = KuriType.VOID;

        switch (node.operator) {
            case '+':
            case '-':
            case '*':
            case '/':
            case '%':
                if (leftScalar === KuriType.STRING || rightScalar === KuriType.STRING) {
                    scalarResult = KuriType.STRING;
                } else if (leftScalar === KuriType.FLOAT || rightScalar === KuriType.FLOAT) {
                    scalarResult = KuriType.FLOAT;
                } else {
                    scalarResult = KuriType.INT;
                }
                break;
            case '>':
            case '<':
            case '>=':
            case '<=':
            case '==':
            case '!=':
                scalarResult = KuriType.BOOL;
                break;
            case 'not':
                // Unary not: parsed as BinaryExpression with right=null
                // Allow BOOL, ANY, INT, FLOAT, na (truthy/falsy at runtime)
                if (
                    leftScalar !== KuriType.BOOL &&
                    leftScalar !== KuriType.ANY &&
                    leftScalar !== KuriType.INT &&
                    leftScalar !== KuriType.FLOAT &&
                    leftScalar !== KuriType.na
                ) {
                    this.addError(node, 'K805', `Logical operator 'not' requires boolean operand`);
                }
                scalarResult = KuriType.BOOL;
                break;
            case 'and':
            case 'or':
                // Allow BOOL, ANY, INT, FLOAT, na (truthy/falsy at runtime)
                // Only warn on types that are clearly non-boolean (STRING, COLOR, VOID)
                if (
                    (leftScalar !== KuriType.BOOL &&
                        leftScalar !== KuriType.ANY &&
                        leftScalar !== KuriType.INT &&
                        leftScalar !== KuriType.FLOAT &&
                        leftScalar !== KuriType.na) ||
                    (rightScalar !== KuriType.BOOL &&
                        rightScalar !== KuriType.ANY &&
                        rightScalar !== KuriType.INT &&
                        rightScalar !== KuriType.FLOAT &&
                        rightScalar !== KuriType.na)
                ) {
                    this.addError(
                        node,
                        'K805',
                        `Logical operator '${node.operator}' requires boolean operands`
                    );
                }
                scalarResult = KuriType.BOOL;
                break;
        }
        return isSeriesOp ? getSeriesType(scalarResult) : scalarResult;
    }

    private checkFunctionDefinition(node: any): KuriType {
        // Save and restore symbol table scope (function has its own scope)
        const savedSymbols = new Map(this.symbolTable);

        // Add params to local scope
        node.params.forEach((p: any) => {
            this.symbolTable.set(p.name, p.type || KuriType.ANY);
        });

        // Check body and infer return type
        // Look for return statements and track the best non-VOID type
        let inferredReturn = KuriType.ANY; // Default to ANY for user functions (safe)
        let foundReturn = false;
        if (node.body && node.body.length > 0) {
            for (const s of node.body) {
                const stmtType = this.inferType(s);
                // Track return statement types
                if (s.type === 'ReturnStatement') {
                    foundReturn = true;
                    if (stmtType !== KuriType.VOID) {
                        inferredReturn = stmtType;
                    }
                }
                // If last statement is an expression/assignment (not loop/if), use its type
                if (s === node.body[node.body.length - 1] && !foundReturn) {
                    if (stmtType !== KuriType.VOID) {
                        inferredReturn = stmtType;
                    }
                }
            }
        }

        // Restore parent scope
        this.symbolTable = savedSymbols;

        // Use declared return type if provided, otherwise inferred
        const returnType =
            node.returnType && node.returnType !== KuriType.VOID ? node.returnType : inferredReturn;

        // Register function signature
        this.functionRegistry.set(node.name, {
            name: node.name,
            params: node.params.map((p: any) => ({ name: p.name, type: p.type || KuriType.ANY })),
            returnType,
        });

        return KuriType.VOID;
    }

    private checkCall(node: CallExpression): KuriType {
        const args = node.arguments.map((arg) => this.inferType(arg));
        const funcName = node.callee;

        // Explicit casting functions
        if (funcName === 'float') return KuriType.FLOAT;
        if (funcName === 'int') return KuriType.INT;
        if (funcName === 'bool') return KuriType.BOOL;
        if (funcName === 'string') return KuriType.STRING;

        // Check registry
        const funcDef = this.functionRegistry.get(funcName);
        if (funcDef) {
            // Check arguments
            node.arguments.forEach((arg, i) => {
                let argValue: ASTNode;
                let paramIndex = i;

                if ((arg as any).type === 'CallArgument') {
                    const namedArg = arg as any;
                    argValue = namedArg.value;
                    const index = funcDef.params.findIndex((p) => p.name === namedArg.name);
                    if (index === -1) {
                        // Allow extra named args for input, input.*, plot*, alert*, strategy.* functions
                        // (they accept many optional params not in the registry)
                        if (
                            funcName === 'input' ||
                            funcName.startsWith('input.') ||
                            funcName.startsWith('plot') ||
                            funcName.startsWith('alert') ||
                            funcName.startsWith('strategy.') ||
                            funcName === 'indicator' ||
                            funcName === 'strategy'
                        ) {
                            this.inferType(namedArg.value);
                            return;
                        }
                        this.addError(
                            node,
                            'K802',
                            `Unknown parameter '${namedArg.name}' for function '${funcName}'`
                        );
                        return;
                    }
                    paramIndex = index;
                } else {
                    argValue = arg as ASTNode;
                }

                const argType = this.inferType(argValue);
                const param = funcDef.params[paramIndex];
                if (param) {
                    if (!isTypeCompatible(param.type, argType)) {
                        this.addError(
                            node,
                            'K802',
                            `Argument ${paramIndex + 1} of '${funcName}' mismatch: expected ${param.type}, got ${argType}`
                        );
                    }
                } else if (
                    funcName !== 'plot' &&
                    funcName !== 'input' &&
                    !funcName.startsWith('input.') &&
                    !funcName.startsWith('plot') &&
                    !funcName.startsWith('alert') &&
                    !funcName.startsWith('strategy.') &&
                    funcName !== 'indicator' &&
                    funcName !== 'strategy'
                ) {
                    // Variable arguments allowed for input/plot/alert/strategy functions
                    this.addError(node, 'K803', `Too many arguments for function '${funcName}'`);
                }
            });

            return funcDef.returnType;
        }

        // Fallback for unknown built-ins (legacy support)
        if (funcName.startsWith('ta.')) return KuriType.SERIES_FLOAT; // Assumption

        return KuriType.ANY;
    }

    private checkIdentifier(node: Identifier): KuriType {
        const varType = this.symbolTable.get(node.name);
        if (!varType) {
            // For Phase 1, allow undefined variables (they may be function params or loop variables)
            // Full scope-aware type checking can be added in Phase 2
            return KuriType.ANY;
        }
        return varType;
    }

    private checkLiteral(node: Literal): KuriType {
        if (typeof node.value === 'number') {
            return Number.isInteger(node.value) ? KuriType.INT : KuriType.FLOAT;
        } else if (typeof node.value === 'string') {
            return KuriType.STRING;
        } else if (typeof node.value === 'boolean') {
            return KuriType.BOOL;
        } else if (node.value === null) {
            return KuriType.na;
        }
        return KuriType.VOID;
    }

    private checkIndex(node: IndexExpression): KuriType {
        const objType = this.inferType(node.object);
        const idxType = this.inferType(node.index);

        // Allow indexing on series, ANY, and numeric types (they may be series at runtime)
        // Only error on types that can NEVER be indexed (string, bool, void, color)
        if (
            !isSeries(objType) &&
            objType !== KuriType.ANY &&
            objType !== KuriType.INT &&
            objType !== KuriType.FLOAT &&
            objType !== KuriType.na &&
            objType !== KuriType.SERIES_FLOAT &&
            objType !== KuriType.SERIES_INT
        ) {
            this.addError(node, 'K804', `Cannot index non-series type: ${objType}`);
        }

        if (idxType !== KuriType.INT && idxType !== KuriType.FLOAT && idxType !== KuriType.ANY) {
            this.addError(node, 'K804', `Index must be integer, got ${idxType}`);
        }

        // Return the element type: if series<float>[i] → float, etc.
        if (isSeries(objType)) return getScalarType(objType);
        if (objType === KuriType.ANY) return KuriType.ANY;
        // For scalar types being indexed (history access), return same type
        return objType;
    }

    private checkStructDefinition(node: StructDefinition): KuriType {
        const fields = new Map<string, KuriType>();
        for (const field of node.fields) {
            fields.set(field.name, field.fieldType);
        }
        this.structRegistry.set(node.name, { name: node.name, fields });
        return KuriType.VOID;
    }

    private checkMemberExpression(node: MemberExpression): KuriType {
        const objType = this.inferType(node.object);

        // For struct types, validate field access
        if (objType === KuriType.STRUCT) {
            // Try to find the struct definition
            // For now, if object is an identifier, check if it's a known struct
            if (node.object.type === 'Identifier') {
                const objName = (node.object as any).name;
                // In a full implementation, we'd track variable -> struct type mapping
                // For Phase 1, we'll search the registry for matching field names
                for (const [structName, structDef] of this.structRegistry.entries()) {
                    if (structDef.fields.has(node.property)) {
                        return structDef.fields.get(node.property)!;
                    }
                }
                this.addError(node, 'K800', `Unknown field '${node.property}' on struct`);
                return KuriType.ANY;
            }
        }

        // For injected objects or runtime values, return ANY
        return KuriType.ANY;
    }
}
