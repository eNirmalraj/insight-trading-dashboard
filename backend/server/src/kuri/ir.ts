/**
 * IR Type Definitions (same as frontend)
 * These should be synced with src/kuri/ir.ts
 */

export type IRNodeType =
    | 'IR_PROGRAM'
    | 'IR_ASSIGN'
    | 'IR_BINARY_OP'
    | 'IR_CALL'
    | 'IR_VAR'
    | 'IR_CONST';

export interface IRNode {
    type: IRNodeType;
    meta?: {
        line?: number;
        column?: number;
        source?: string;
    };
}

export interface IRConst extends IRNode {
    type: 'IR_CONST';
    value: number | string | boolean;
}

export interface IRVar extends IRNode {
    type: 'IR_VAR';
    name: string;
}

export type IR = IRProgram | IRAssign | IRBinaryOp | IRCall | IRVar | IRConst;

export interface IRProgram extends IRNode {
    type: 'IR_PROGRAM';
    statements: IR[];
}

export interface IRAssign extends IRNode {
    type: 'IR_ASSIGN';
    name: string;
    value: IR;
}

export interface IRBinaryOp extends IRNode {
    type: 'IR_BINARY_OP';
    operator: '+' | '-' | '*' | '/' | '>' | '<' | '>=' | '<=' | '==' | '!=' | 'and' | 'or';
    left: IR;
    right: IR;
}

export interface IRCall extends IRNode {
    type: 'IR_CALL';
    func: string;
    args: IR[];
}
