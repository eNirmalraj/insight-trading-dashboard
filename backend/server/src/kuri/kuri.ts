import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter, Context } from './interpreter';

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
}
