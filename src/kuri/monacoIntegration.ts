import * as monaco from 'monaco-editor';
import { Kuri } from './kuri';
import { Context } from './interpreter';
import { DiagnosticCollection, KuriDiagnostic } from './diagnostics';

/**
 * Monaco Diagnostics Provider for Kuri
 * 
 * Provides real-time error checking and highlighting in the Monaco editor
 * Similar to TradingView Pine Script's error highlighting
 */
export class KuriDiagnosticsProvider {
    private editor: monaco.editor.IStandaloneCodeEditor;
    private model: monaco.editor.ITextModel;
    private decorations: string[] = [];
    private validationTimeout: NodeJS.Timeout | null = null;

    constructor(editor: monaco.editor.IStandaloneCodeEditor) {
        this.editor = editor;
        this.model = editor.getModel()!;

        // Setup real-time validation on content change
        this.setupValidation();
    }

    /**
     * Setup real-time validation with debouncing
     */
    private setupValidation(): void {
        this.model.onDidChangeContent(() => {
            // Debounce validation (500ms)
            if (this.validationTimeout) {
                clearTimeout(this.validationTimeout);
            }

            this.validationTimeout = setTimeout(() => {
                this.validate();
            }, 500);
        });

        // Run initial validation
        this.validate();
    }

    /**
     * Validate the current script and update markers
     */
    private validate(): void {
        const script = this.model.getValue();

        if (!script.trim()) {
            // Clear markers for empty script
            monaco.editor.setModelMarkers(this.model, 'kuri', []);
            return;
        }

        try {
            // Create a dummy context for validation
            const dummyContext: Context = {
                open: [100, 101, 102],
                high: [105, 106, 107],
                low: [95, 96, 97],
                close: [103, 104, 105],
                volume: [1000, 1100, 1200]
            };

            // Try to compile (don't need to execute for validation)
            Kuri.compileToIR(script);

            // If we get here, no errors
            monaco.editor.setModelMarkers(this.model, 'kuri', []);

        } catch (error: any) {
            // Parse error message to extract diagnostics
            const diagnostics = this.parseErrorMessage(error.message);

            if (diagnostics) {
                // Convert diagnostics to Monaco markers
                const markers = diagnostics.toMonacoMarkers();
                monaco.editor.setModelMarkers(this.model, 'kuri', markers);
            } else {
                // Fallback: Generic error marker
                monaco.editor.setModelMarkers(this.model, 'kuri', [{
                    severity: monaco.MarkerSeverity.Error,
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: 100,
                    message: error.message || 'Compilation error'
                }]);
            }
        }
    }

    /**
     * Parse error message to extract diagnostic information
     * This is a temporary solution until we expose diagnostics directly
     */
    private parseErrorMessage(errorMsg: string): DiagnosticCollection | null {
        // For now, return null - we'll enhance this when we expose diagnostics
        // In the meantime, the catch block will create a generic marker
        return null;
    }

    /**
     * Dispose the provider and clean up resources
     */
    public dispose(): void {
        if (this.validationTimeout) {
            clearTimeout(this.validationTimeout);
        }
        monaco.editor.setModelMarkers(this.model, 'kuri', []);
    }
}

/**
 * Enhanced Kuri class with diagnostics exposure
 */
export class KuriWithDiagnostics {
    /**
     * Validate a script and return diagnostics without executing
     */
    public static validate(script: string): DiagnosticCollection {
        try {
            const { Lexer } = require('./lexer');
            const { Parser } = require('./parser');
            const { SemanticAnalyzer } = require('./semanticAnalyzer');

            const lexer = new Lexer(script);
            const tokens = lexer.tokenize();

            const parser = new Parser(tokens);
            const ast = parser.parse();

            const analyzer = new SemanticAnalyzer();
            const validationResult = analyzer.analyze(ast);

            return validationResult.diagnostics;
        } catch (error: any) {
            // If lexer or parser throws, create a diagnostic
            const diagnostics = new DiagnosticCollection();
            diagnostics.add({
                code: 'E000',
                severity: 'error' as any,
                message: error.message || 'Syntax error',
                range: {
                    start: { line: 1, column: 1 },
                    end: { line: 1, column: 1 }
                }
            });
            return diagnostics;
        }
    }
}

/**
 * Setup Monaco editor with Kuri diagnostics
 * Call this when creating the editor
 */
export function setupKuriEditor(editor: monaco.editor.IStandaloneCodeEditor): KuriDiagnosticsProvider {
    return new KuriDiagnosticsProvider(editor);
}
