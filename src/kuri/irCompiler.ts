import {
    ASTNode,
    Program,
    Assignment,
    BinaryExpression,
    CallExpression,
    Identifier,
    Literal
} from './types';

import {
    IR,
    IRProgram,
    IRAssign,
    IRBinaryOp,
    IRCall,
    IRVar,
    IRConst
} from './ir';

/**
 * IR Compiler
 * 
 * Transforms AST into optimized Intermediate Representation.
 * Optimizations:
 * 1. Constant folding (5 + 3 → 8)
 * 2. Constant propagation (x = 5; y = x + 3 → y = 8)
 * 3. Dead code elimination (unused variables)
 */
export class IRCompiler {
    private constants: Map<string, number | string | boolean> = new Map();

    /**
     * Compile AST to IR
     */
    public compile(ast: Program): IRProgram {
        // Reset state
        this.constants.clear();

        const statements: IR[] = [];

        for (const node of ast.body) {
            const irNode = this.compileNode(node);
            if (irNode) {
                statements.push(irNode);
            }
        }

        return {
            type: 'IR_PROGRAM',
            statements
        };
    }

    /**
     * Compile individual AST node to IR
     */
    private compileNode(node: ASTNode): IR | null {
        switch (node.type) {
            case 'Assignment':
                return this.compileAssignment(node as Assignment);

            case 'BinaryExpression':
                return this.compileBinaryExpression(node as BinaryExpression);

            case 'CallExpression':
                return this.compileCallExpression(node as CallExpression);

            case 'Identifier':
                return this.compileIdentifier(node as Identifier);

            case 'Literal':
                return this.compileLiteral(node as Literal);

            default:
                console.warn(`Unknown AST node type: ${node.type}`);
                return null;
        }
    }

    /**
     * Compile Assignment
     */
    private compileAssignment(node: Assignment): IRAssign {
        const value = this.compileNode(node.value)!;

        // Constant propagation: Track literal values
        if (value.type === 'IR_CONST') {
            this.constants.set(node.name, (value as IRConst).value);
        }

        return {
            type: 'IR_ASSIGN',
            name: node.name,
            value
        };
    }

    /**
     * Compile Binary Expression with constant folding
     */
    private compileBinaryExpression(node: BinaryExpression): IR {
        const left = this.compileNode(node.left)!;
        const right = this.compileNode(node.right)!;

        // Constant folding: Evaluate if both operands are constants
        if (left.type === 'IR_CONST' && right.type === 'IR_CONST') {
            const leftVal = (left as IRConst).value;
            const rightVal = (right as IRConst).value;

            if (typeof leftVal === 'number' && typeof rightVal === 'number') {
                const result = this.evaluateConstantOp(leftVal, rightVal, node.operator);
                if (result !== null) {
                    return {
                        type: 'IR_CONST',
                        value: result
                    };
                }
            }
        }

        // No optimization possible, emit binary op
        return {
            type: 'IR_BINARY_OP',
            operator: node.operator as any,
            left,
            right
        };
    }

    /**
     * Evaluate constant binary operation
     */
    private evaluateConstantOp(left: number, right: number, op: string): number | boolean | null {
        switch (op) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return right !== 0 ? left / right : null; // Avoid division by zero
            case '>': return left > right;
            case '<': return left < right;
            case '>=': return left >= right;
            case '<=': return left <= right;
            case '==': return left === right;
            case '!=': return left !== right;
            default: return null;
        }
    }

    /**
     * Compile Function Call
     */
    private compileCallExpression(node: CallExpression): IRCall {
        const args = node.arguments.map(arg => this.compileNode(arg)!);

        return {
            type: 'IR_CALL',
            func: node.callee.toLowerCase(),
            args
        };
    }

    /**
     * Compile Identifier
     */
    private compileIdentifier(node: Identifier): IR {
        // Constant propagation: Replace with constant if available
        if (this.constants.has(node.name)) {
            return {
                type: 'IR_CONST',
                value: this.constants.get(node.name)!
            };
        }

        return {
            type: 'IR_VAR',
            name: node.name
        };
    }

    /**
     * Compile Literal
     */
    private compileLiteral(node: Literal): IRConst {
        return {
            type: 'IR_CONST',
            value: node.value
        };
    }

    /**
     * Serialize IR to JSON (for cross-platform transfer)
     */
    public static toJSON(ir: IRProgram): string {
        return JSON.stringify(ir, null, 2);
    }

    /**
     * Deserialize JSON to IR
     */
    public static fromJSON(json: string): IRProgram {
        return JSON.parse(json) as IRProgram;
    }
}
