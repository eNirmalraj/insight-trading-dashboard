import { Token, TokenType, ASTNode, Program, Assignment, BinaryExpression, CallExpression, Identifier, Literal, IfStatement } from './types';

export class Parser {
    private tokens: Token[];
    private position: number = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    public parse(): Program {
        const statements: ASTNode[] = [];

        while (this.position < this.tokens.length) {
            statements.push(this.parseStatement());
        }

        return { type: "Program", body: statements };
    }

    private parseStatement(): ASTNode {
        // Look ahead to distinguish assignment vs expression
        const current = this.peek();
        const next = this.peek(1);

        if (current.type === TokenType.IDENTIFIER && next && next.type === TokenType.ASSIGN) {
            return this.parseAssignment();
        }

        if (current.type === TokenType.IF) {
            return this.parseIfStatement();
        }

        return this.parseExpression();
    }

    private parseIfStatement(): IfStatement {
        this.consume(TokenType.IF);
        const condition = this.parseExpression();

        // Block parsing: Since specific block delimiters like { } or indenting aren't strictly defined in the lexer for Kuri yet,
        // we'll assume a single statement OR a block if we add delimiter support. 
        // For Python-like syntax (indentation), it's complex without indent tokens.
        // Let's assume Kuri uses C-style braces {} for now, OR we just parse a single statement.
        // Wait, looking at Lexer, no braces. Let's start simple: Single statement body, or we need to add Brace tokens to Lexer.
        // ACTUALLY: The user's request imply "Python-like".
        // Let's just consume statements until an "END" or "ELSE" or "EOF"?
        // Given strict constraints, let's implement a simple block parser that looks for scope delimiters or keywords.
        // For this iteration, let's say the body is a single statement or we need to upgrade Lexer for blocks.
        // DECISION: Upgrade Lexer later. For now, parse ONE statement as body.

        // UPDATE: To be safe and extensible, let's grab statements until 'ELSE' or 'END' (if we had it).
        // Since we don't have block delimiters in Lexer yet, let's parse a SINGLE statement for consequent.
        // This is a temporary limitation until we add Block support (indentation or braces).

        const consequent: ASTNode[] = [this.parseStatement()];
        let alternate: ASTNode[] | undefined;

        if (this.peek().type === TokenType.ELSE) {
            this.consume(TokenType.ELSE);
            alternate = [this.parseStatement()];
        }

        return {
            type: "IfStatement",
            condition,
            consequent,
            alternate
        };
    }

    private parseAssignment(): Assignment {
        const identifier = this.consume(TokenType.IDENTIFIER);
        this.consume(TokenType.ASSIGN);
        const value = this.parseExpression();

        return {
            type: "Assignment",
            name: identifier.value,
            value: value
        };
    }

    private parseExpression(bindingPower: number = 0): ASTNode {
        let left = this.parsePrefix();

        while (bindingPower < this.getBindingPower(this.peek().type)) {
            const operator = this.consume(this.peek().type);
            const right = this.parseExpression(this.getBindingPower(operator.type));

            left = {
                type: "BinaryExpression",
                operator: operator.value,
                left: left,
                right: right
            } as BinaryExpression;
        }

        return left;
    }

    private parsePrefix(): ASTNode {
        const token = this.consume();

        switch (token.type) {
            case TokenType.IDENTIFIER:
                // Check if it's a function call
                if (this.peek().type === TokenType.LPAREN) {
                    return this.parseCallExpression(token);
                }
                return { type: "Identifier", name: token.value } as Identifier;

            case TokenType.NUMBER:
                return { type: "Literal", value: parseFloat(token.value) } as Literal;

            case TokenType.LPAREN:
                const expression = this.parseExpression();
                this.consume(TokenType.RPAREN);
                return expression;

            default:
                throw new Error(`Unexpected token: ${token.type} at line ${token.line}`);
        }
    }

    private parseCallExpression(identifier: Token): CallExpression {
        this.consume(TokenType.LPAREN);
        const args: ASTNode[] = [];

        if (this.peek().type !== TokenType.RPAREN) {
            args.push(this.parseExpression());
            while (this.peek().type === TokenType.COMMA) {
                this.consume(TokenType.COMMA);
                args.push(this.parseExpression());
            }
        }

        this.consume(TokenType.RPAREN);

        return {
            type: "CallExpression",
            callee: identifier.value,
            arguments: args
        };
    }

    private getBindingPower(type: TokenType): number {
        switch (type) {
            case TokenType.OR: return 1;
            case TokenType.AND: return 2;
            case TokenType.EQ:
            case TokenType.NEQ:
            case TokenType.GT:
            case TokenType.LT:
            case TokenType.GTE:
            case TokenType.LTE: return 3;
            case TokenType.PLUS:
            case TokenType.MINUS: return 4;
            case TokenType.MULTIPLY:
            case TokenType.DIVIDE: return 5;
            default: return 0;
        }
    }

    private peek(offset: number = 0): Token {
        if (this.position + offset >= this.tokens.length) {
            return { type: TokenType.EOF, value: "", line: 0, column: 0 };
        }
        return this.tokens[this.position + offset];
    }

    private consume(type?: TokenType): Token {
        const token = this.peek();
        if (type && token.type !== type) {
            throw new Error(`Expected token ${type} but got ${token.type} at line ${token.line}`);
        }
        this.position++;
        return token;
    }
}
