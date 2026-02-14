import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter, Context } from './interpreter';
import { SemanticAnalyzer } from './semanticAnalyzer';
import { IRCompiler } from './irCompiler';
import { IRInterpreter } from './irInterpreter';

export class Kuri {
    /**
     * Executes a Kuri script against a set of market data.
     * @param script The Kuri source code string.
     * @param context The market data context (open, high, low, close).
     * @returns The final context containing variables and results.
     * @throws Error if lexing, parsing, semantic analysis, or interpretation fails.
     */
    public static execute(script: string, context: Context): any {
        try {
            // 1. Lexing
            const lexer = new Lexer(script);
            const tokens = lexer.tokenize();

            // 2. Parsing
            const parser = new Parser(tokens);
            const ast = parser.parse();

            // 3. Semantic Analysis
            const analyzer = new SemanticAnalyzer();
            const validationResult = analyzer.analyze(ast);

            if (!validationResult.valid) {
                // Format errors in Pine Script style
                const errorMessages = validationResult.diagnostics
                    .formatForConsole()
                    .join('\n\n');

                throw new Error(`Compilation failed:\n\n${errorMessages}`);
            }

            // Log warnings if any
            const warnings = validationResult.diagnostics.getWarnings();
            if (warnings.length > 0) {
                const warningMessages = warnings.map(w =>
                    `⚠️ line ${w.range.start.line}: ${w.message}`
                ).join('\n');
                console.warn(`Kuri Warnings:\n${warningMessages}`);
            }

            // 4. IR Compilation (NEW!)
            const irCompiler = new IRCompiler();
            const ir = irCompiler.compile(ast);

            // 5. IR Interpretation (NEW!)
            const irInterpreter = new IRInterpreter(context);
            const result = irInterpreter.run(ir);

            return result;
        } catch (error) {
            console.error("Kuri Execution Error:", error);
            throw error;
        }
    }

    /**
     * Compile a Kuri script to IR without executing
     * @param script The Kuri source code string.
     * @returns JSON-serialized IR for cross-platform execution
     */
    public static compileToIR(script: string): string {
        const lexer = new Lexer(script);
        const tokens = lexer.tokenize();

        const parser = new Parser(tokens);
        const ast = parser.parse();

        const analyzer = new SemanticAnalyzer();
        const validationResult = analyzer.analyze(ast);

        if (!validationResult.valid) {
            const errorMessages = validationResult.diagnostics
                .formatForConsole()
                .join('\n\n');
            throw new Error(`Compilation failed:\n\n${errorMessages}`);
        }

        const irCompiler = new IRCompiler();
        const ir = irCompiler.compile(ast);

        return IRCompiler.toJSON(ir);
    }
}
