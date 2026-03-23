/**
 * IR Validation Pass
 * Catches structural errors in the IR before execution:
 * - Missing required fields on IR nodes
 * - Invalid operator values
 * - Unreachable code after return/break
 * - Empty function bodies
 */

import {
    IR,
    IRProgram,
    IRAssign,
    IRBinaryOp,
    IRCall,
    IRVar,
    IRIf,
    IRLoop,
    IRFunctionDef,
    IRReturn,
} from './ir';

import { createKuriError } from './errors';
import type { KuriError } from './errors';

// Keep as deprecated alias for any external consumers
export type IRValidationIssue = KuriError;

const VALID_OPERATORS = new Set([
    '+',
    '-',
    '*',
    '/',
    '%',
    '>',
    '<',
    '>=',
    '<=',
    '==',
    '!=',
    'and',
    'or',
    'not',
    '??',
    '?.',
]);

export function validateIR(program: IRProgram): KuriError[] {
    const issues: KuriError[] = [];
    validateStatements(program.statements, issues, false, false);
    return issues;
}

function validateStatements(
    stmts: IR[],
    issues: KuriError[],
    inLoop: boolean,
    inFunction: boolean
): void {
    let hasReturn = false;

    for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i];

        // Warn on unreachable code after return/break
        if (hasReturn && stmt.type !== 'IR_FUNCTION_DEF') {
            issues.push(
                createKuriError('K300', {
                    message: 'Unreachable code after return statement',
                    category: 'structure',
                    line: stmt.meta?.line,
                    column: stmt.meta?.column,
                })
            );
        }

        validateNode(stmt, issues, inLoop, inFunction);

        if (stmt.type === 'IR_RETURN' || stmt.type === 'IR_BREAK') {
            hasReturn = true;
        }
    }
}

function validateNode(node: IR, issues: KuriError[], inLoop: boolean, inFunction: boolean): void {
    switch (node.type) {
        case 'IR_ASSIGN': {
            const assign = node as IRAssign;
            if (!assign.name || typeof assign.name !== 'string') {
                issues.push(
                    createKuriError('K300', {
                        message: 'Assignment missing variable name',
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            }
            if (!assign.value) {
                issues.push(
                    createKuriError('K300', {
                        message: `Assignment '${assign.name}' missing value`,
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            } else {
                validateNode(assign.value, issues, inLoop, inFunction);
            }
            break;
        }

        case 'IR_BINARY_OP': {
            const binop = node as IRBinaryOp;
            if (!VALID_OPERATORS.has(binop.operator)) {
                issues.push(
                    createKuriError('K300', {
                        message: `Invalid operator '${binop.operator}'`,
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            }
            if (binop.left) validateNode(binop.left, issues, inLoop, inFunction);
            if (binop.right) validateNode(binop.right, issues, inLoop, inFunction);
            break;
        }

        case 'IR_CALL': {
            const call = node as IRCall;
            if (!call.func || typeof call.func !== 'string') {
                issues.push(
                    createKuriError('K300', {
                        message: 'Function call missing function name',
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            }
            if (call.args) {
                call.args.forEach((arg) => validateNode(arg as IR, issues, inLoop, inFunction));
            }
            break;
        }

        case 'IR_IF': {
            const ifNode = node as IRIf;
            if (!ifNode.condition) {
                issues.push(
                    createKuriError('K300', {
                        message: 'If statement missing condition',
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            } else {
                validateNode(ifNode.condition, issues, inLoop, inFunction);
            }
            if (ifNode.consequent)
                validateStatements(ifNode.consequent, issues, inLoop, inFunction);
            if (ifNode.alternate) validateStatements(ifNode.alternate, issues, inLoop, inFunction);
            break;
        }

        case 'IR_LOOP': {
            const loop = node as IRLoop;
            if (loop.init) validateNode(loop.init, issues, true, inFunction);
            if (loop.condition) validateNode(loop.condition, issues, true, inFunction);
            if (loop.body) validateStatements(loop.body, issues, true, inFunction);
            break;
        }

        case 'IR_BREAK':
            if (!inLoop) {
                issues.push(
                    createKuriError('K300', {
                        message: "'break' used outside of a loop",
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            }
            break;

        case 'IR_CONTINUE':
            if (!inLoop) {
                issues.push(
                    createKuriError('K300', {
                        message: "'continue' used outside of a loop",
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            }
            break;

        case 'IR_RETURN': {
            const ret = node as IRReturn;
            if (ret.value) validateNode(ret.value, issues, inLoop, inFunction);
            break;
        }

        case 'IR_FUNCTION_DEF': {
            const func = node as IRFunctionDef;
            if (!func.name) {
                issues.push(
                    createKuriError('K300', {
                        message: 'Function definition missing name',
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            }
            if (!func.body || func.body.length === 0) {
                issues.push(
                    createKuriError('K300', {
                        message: `Function '${func.name}' has empty body`,
                        category: 'structure',
                        line: node.meta?.line,
                    })
                );
            } else {
                validateStatements(func.body, issues, false, true);
            }
            break;
        }

        // Leaf nodes — no validation needed
        case 'IR_CONST':
        case 'IR_VAR':
        case 'IR_PROGRAM':
        case 'IR_INDEX':
        case 'IR_MEMBER_ACCESS':
        case 'IR_ARRAY_LITERAL':
        case 'IR_DESTRUCTURING_ASSIGN':
        case 'IR_STRUCT_DEF':
        case 'IR_LIBRARY_DEF':
        case 'IR_EXPORT':
        case 'IR_IMPORT':
        case 'IR_CALL_ARGUMENT':
        case 'IR_ARRAY_GET':
        case 'IR_ARRAY_SET':
        case 'IR_FUNCTION_CALL':
        case 'IR_JUMP':
        case 'IR_JUMP_IF_FALSE':
            break;
    }
}
