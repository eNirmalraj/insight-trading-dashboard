import { TypeChecker } from '../typeChecker';
import { KuriType } from '../typeSystem';
import { Program, Assignment, Identifier, Literal, BinaryExpression } from '../types';

describe('Kuri Type Checker', () => {
    let checker: TypeChecker;

    beforeEach(() => {
        checker = new TypeChecker();
    });

    it('should infer type for simple assignment', () => {
        // x = 10
        const program: Program = {
            type: 'Program',
            body: [
                {
                    type: 'Assignment',
                    name: 'x',
                    value: { type: 'Literal', value: 10 } as Literal,
                } as Assignment,
            ],
        };

        const errors = checker.check(program);
        expect(errors).toHaveLength(0);
        expect(program.body[0].varType).toBe(KuriType.INT);
    });

    it('should detect type mismatch in assignment', () => {
        // x = 10
        // x = "hello" (Error)
        const program: Program = {
            type: 'Program',
            body: [
                {
                    type: 'Assignment',
                    name: 'x',
                    value: { type: 'Literal', value: 10 } as Literal,
                } as Assignment,
                {
                    type: 'Assignment',
                    name: 'x',
                    value: { type: 'Literal', value: 'hello' } as Literal,
                } as Assignment,
            ],
        };

        const errors = checker.check(program);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('Cannot assign string to int');
    });

    it('should infer type for binary expression', () => {
        // x = 10 + 20.5
        const program: Program = {
            type: 'Program',
            body: [
                {
                    type: 'Assignment',
                    name: 'x',
                    value: {
                        type: 'BinaryExpression',
                        operator: '+',
                        left: { type: 'Literal', value: 10 } as Literal,
                        right: { type: 'Literal', value: 20.5 } as Literal,
                    } as BinaryExpression,
                } as Assignment,
            ],
        };

        const errors = checker.check(program);
        expect(errors).toHaveLength(0);
        // int + float -> float
        expect(program.body[0].varType).toBe(KuriType.FLOAT);
    });

    it('should handle series operations', () => {
        // x = close + 10
        const program: Program = {
            type: 'Program',
            body: [
                {
                    type: 'Assignment',
                    name: 'x',
                    value: {
                        type: 'BinaryExpression',
                        operator: '+',
                        left: { type: 'Identifier', name: 'close' } as Identifier,
                        right: { type: 'Literal', value: 10 } as Literal,
                    } as BinaryExpression,
                } as Assignment,
            ],
        };

        const errors = checker.check(program);
        expect(errors).toHaveLength(0);
        // series<float> + int -> series<float>
        expect(program.body[0].varType).toBe(KuriType.SERIES_FLOAT);
    });
});
