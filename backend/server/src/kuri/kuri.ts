import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter, Context } from './interpreter';
import { BackendVM, BackendVMOutput } from './backendVM';
import { IRProgram, IR, IRNodeType } from './ir';
import { ASTNode, Program, Assignment, BinaryExpression, CallExpression, Identifier, Literal, IndexExpression } from './types';

export class Kuri {
    /**
     * Executes a Kuri script against a set of market data.
     * @param script The Kuri source code string.
     * @param context The market data context (open, high, low, close).
     * @returns The final context containing variables and results.
     */
    public static execute(script: string, context: Context): any {
        try {
            // 1. Lexing
            const lexer = new Lexer(script);
            const tokens = lexer.tokenize();

            // 2. Parsing
            const parser = new Parser(tokens);
            const ast = parser.parse();

            // 3. Interpreting
            const interpreter = new Interpreter(context);
            const result = interpreter.run(ast);

            return result;
        } catch (error) {
            console.error("Kuri Execution Error:", error);
            throw error;
        }
    }

    /**
     * Executes a Kuri script using the BackendVM (Bar-by-Bar mode)
     */
    public static executeWithVM(script: string, context: Context): BackendVMOutput {
        try {
            const ir = this.compileIR(script);
            const vm = new BackendVM(context);
            return vm.run(ir);
        } catch (error) {
            console.error("Kuri VM Execution Error:", error);
            throw error;
        }
    }

    /**
     * Compiles a script into Intermediate Representation (IR)
     */
    public static compileIR(script: string): IRProgram {
        // 1. Lexing
        const lexer = new Lexer(script);
        const tokens = lexer.tokenize();

        // 2. Parsing
        const parser = new Parser(tokens);
        const ast = parser.parse();

        // 3. Convert to IR
        return this.transformToIR(ast);
    }

    private static transformToIR(program: Program): IRProgram {
        return {
            type: 'IR_PROGRAM',
            statements: program.body.map(stmt => this.transformNode(stmt))
        };
    }

    private static transformNode(node: ASTNode): IR {
        switch (node.type) {
            case 'Assignment':
                const assign = node as Assignment;
                return {
                    type: 'IR_ASSIGN',
                    name: assign.name,
                    value: this.transformNode(assign.value)
                };

            case 'BinaryExpression':
                const binary = node as BinaryExpression;
                return {
                    type: 'IR_BINARY_OP',
                    operator: binary.operator as any,
                    left: this.transformNode(binary.left),
                    right: this.transformNode(binary.right)
                };

            case 'CallExpression':
                const call = node as CallExpression;
                return {
                    type: 'IR_CALL',
                    func: call.callee,
                    args: call.arguments.map(arg => this.transformNode(arg))
                };

            case 'Identifier':
                const id = node as Identifier;
                return {
                    type: 'IR_VAR',
                    name: id.name
                };

            case 'Literal':
                const lit = node as Literal;
                return {
                    type: 'IR_CONST',
                    value: lit.value
                };

            case 'IndexExpression':
                const indexExpr = node as IndexExpression;
                return {
                    type: 'IR_INDEX',
                    object: this.transformNode(indexExpr.object),
                    index: this.transformNode(indexExpr.index)
                };

            default:
                throw new Error(`Unsupported AST node type for BackendVM: ${node.type}`);
        }
    }
}
