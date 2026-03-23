import { TypeChecker } from '../typeChecker';
import { Parser } from '../parser';
import { Lexer } from '../lexer';

describe('Phase 4.3: Error Handling & Reporting', () => {
    const check = (script: string) => {
        const lexer = new Lexer(script);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        const checker = new TypeChecker();
        return checker.check(ast);
    };

    it('should report user-friendly type mismatch error', () => {
        const script = `
        a = 10
        a = "hello"
        `;
        // Line 3 assigns string to int variable 'a'
        const errors = check(script);
        expect(errors.length).toBeGreaterThan(0);
        console.log('Error Message:', errors[0].message);

        expect(errors[0].message).toContain('❌ Error at script');
        expect(errors[0].message).toContain('Type mismatch');
        expect(errors[0].message).toContain('Hint');
    });
});
