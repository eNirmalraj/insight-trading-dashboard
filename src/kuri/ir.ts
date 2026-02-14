/**
 * Kuri Intermediate Representation (IR)
 * 
 * A simplified, optimized representation of Kuri programs.
 * Benefits:
 * - Constant folding (5 + 3 → 8)
 * - Dead code elimination
 * - JSON serializable (cross-platform)
 * - Easier to interpret than raw AST
 */

/**
 * IR Node Types
 */
export type IRNodeType =
    | 'IR_PROGRAM'
    | 'IR_ASSIGN'
    | 'IR_BINARY_OP'
    | 'IR_CALL'
    | 'IR_VAR'
    | 'IR_CONST';

/**
 * Base IR Node
 */
export interface IRNode {
    type: IRNodeType;
    meta?: {
        line?: number;
        column?: number;
        source?: string;
    };
}

/**
 * IR Constant Value
 * Example: 42 → { type: 'IR_CONST', value: 42 }
 */
export interface IRConst extends IRNode {
    type: 'IR_CONST';
    value: number | string | boolean;
}

/**
 * IR Variable Reference
 * Example: close → { type: 'IR_VAR', name: 'close' }
 */
export interface IRVar extends IRNode {
    type: 'IR_VAR';
    name: string;
}

/**
 * Union type for all IR nodes (forward declaration for recursive types)
 */
export type IR = IRProgram | IRAssign | IRBinaryOp | IRCall | IRVar | IRConst;

/**
 * IR Program (root)
 */
export interface IRProgram extends IRNode {
    type: 'IR_PROGRAM';
    statements: IR[];
}

/**
 * IR Assignment
 * Example: x = 5 + 3 → { type: 'IR_ASSIGN', name: 'x', value: { type: 'IR_CONST', value: 8 } }
 */
export interface IRAssign extends IRNode {
    type: 'IR_ASSIGN';
    name: string;
    value: IR;
}

/**
 * IR Binary Operation
 * Example: a + b → { type: 'IR_BINARY_OP', op: '+', left: ..., right: ... }
 */
export interface IRBinaryOp extends IRNode {
    type: 'IR_BINARY_OP';
    operator: '+' | '-' | '*' | '/' | '>' | '<' | '>=' | '<=' | '==' | '!=' | 'and' | 'or';
    left: IR;
    right: IR;
}

/**
 * IR Function Call
 * Example: sma(close, 14) → { type: 'IR_CALL', func: 'sma', args: [...] }
 */
export interface IRCall extends IRNode {
    type: 'IR_CALL';
    func: string;
    args: IR[];
}
