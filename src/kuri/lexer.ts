import { Token, TokenType } from './types';

export class Lexer {
    private input: string;
    private position: number = 0;
    private line: number = 1;
    private column: number = 1;

    constructor(input: string) {
        this.input = input;
    }

    public tokenize(): Token[] {
        const tokens: Token[] = [];
        let token: Token | null;

        while ((token = this.nextToken()) !== null) {
            if (token.type !== TokenType.EOF) {
                tokens.push(token);
            } else {
                break;
            }
        }

        return tokens;
    }

    private nextToken(): Token | null {
        this.skipWhitespace();

        if (this.position >= this.input.length) {
            return { type: TokenType.EOF, value: "", line: this.line, column: this.column };
        }

        const char = this.input[this.position];

        // Numbers
        if (/[0-9]/.test(char)) {
            return this.readNumber();
        }

        // Identifiers (and Keywords)
        if (/[a-zA-Z_]/.test(char)) {
            return this.readIdentifier();
        }

        // Operators & Punctuation
        const tokenStart = { line: this.line, column: this.column };

        // Two-character operators
        if (this.position + 1 < this.input.length) {
            const nextChar = this.input[this.position + 1];
            const twoChar = char + nextChar;

            if (twoChar === "==") return this.consume(TokenType.EQ, 2);
            if (twoChar === "!=") return this.consume(TokenType.NEQ, 2);
            if (twoChar === ">=") return this.consume(TokenType.GTE, 2);
            if (twoChar === "<=") return this.consume(TokenType.LTE, 2);
            // Comments check
            if (twoChar === "//") {
                this.skipComment();
                return this.nextToken(); // Recursively call nextToken after comment
            }
        }

        // Single-character operators
        switch (char) {
            case '+': return this.consume(TokenType.PLUS);
            case '-': return this.consume(TokenType.MINUS);
            case '*': return this.consume(TokenType.MULTIPLY);
            case '/': return this.consume(TokenType.DIVIDE);
            case '=': return this.consume(TokenType.ASSIGN);
            case '>': return this.consume(TokenType.GT);
            case '<': return this.consume(TokenType.LT);
            case '(': return this.consume(TokenType.LPAREN);
            case ')': return this.consume(TokenType.RPAREN);
            case ',': return this.consume(TokenType.COMMA);
        }

        // Unknown character
        throw new Error(`Unexpected character '${char}' at line ${this.line}, column ${this.column}`);
    }

    private consume(type: TokenType, length: number = 1): Token {
        const value = this.input.substring(this.position, this.position + length);
        const token = { type, value, line: this.line, column: this.column };

        this.position += length;
        this.column += length;
        return token;
    }

    private readNumber(): Token {
        const start = this.position;
        const startCol = this.column;

        while (this.position < this.input.length && /[0-9\.]/.test(this.input[this.position])) {
            this.position++;
            this.column++;
        }

        const value = this.input.substring(start, this.position);
        return { type: TokenType.NUMBER, value, line: this.line, column: startCol };
    }

    private readIdentifier(): Token {
        const start = this.position;
        const startCol = this.column;

        while (this.position < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.position])) {
            this.position++;
            this.column++;
        }

        const value = this.input.substring(start, this.position);
        const type = this.getKeywordType(value) || TokenType.IDENTIFIER;

        return { type, value, line: this.line, column: startCol };
    }

    private getKeywordType(value: string): TokenType | null {
        switch (value) {
            case "if": return TokenType.IF;
            case "else": return TokenType.ELSE;
            case "and": return TokenType.AND;
            case "or": return TokenType.OR;
            default: return null;
        }
    }

    private skipWhitespace() {
        while (this.position < this.input.length) {
            const char = this.input[this.position];
            if (char === ' ' || char === '\t') {
                this.position++;
                this.column++;
            } else if (char === '\n' || char === '\r') {
                this.position++;
                this.line++;
                this.column = 1;
            } else {
                break;
            }
        }
    }

    private skipComment() {
        // Skip until newline
        while (this.position < this.input.length && this.input[this.position] !== '\n') {
            this.position++;
        }
        // Consume the newline
        if (this.position < this.input.length) {
            this.position++;
            this.line++;
            this.column = 1;
        }
    }
}
