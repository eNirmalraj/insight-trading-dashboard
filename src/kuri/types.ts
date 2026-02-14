export enum TokenType {
    // Keywords
    IF = "IF",
    ELSE = "ELSE",
    AND = "AND",
    OR = "OR",

    // Identifiers & Literals
    IDENTIFIER = "IDENTIFIER",
    NUMBER = "NUMBER",
    STRING = "STRING",

    // Operators
    PLUS = "PLUS", // +
    MINUS = "MINUS", // -
    MULTIPLY = "MULTIPLY", // *
    DIVIDE = "DIVIDE", // /
    ASSIGN = "ASSIGN", // =
    EQ = "EQ", // ==
    GT = "GT", // >
    LT = "LT", // <
    GTE = "GTE", // >=
    LTE = "LTE", // <=
    NEQ = "NEQ", // !=

    // Separators
    LPAREN = "LPAREN", // (
    RPAREN = "RPAREN", // )
    COMMA = "COMMA", // ,
    EOF = "EOF"
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
}

// --- AST Nodes ---

export interface ASTNode {
    type: string;
}

export interface Program extends ASTNode {
    type: "Program";
    body: ASTNode[];
}

export interface Assignment extends ASTNode {
    type: "Assignment";
    name: string; // The variable name being assigned to
    value: ASTNode; // The expression being assigned
}

export interface BinaryExpression extends ASTNode {
    type: "BinaryExpression";
    operator: string;
    left: ASTNode;
    right: ASTNode;
}

export interface CallExpression extends ASTNode {
    type: "CallExpression";
    callee: string; // Function name
    arguments: ASTNode[];
}

export interface Identifier extends ASTNode {
    type: "Identifier";
    name: string;
}

export interface Literal extends ASTNode {
    type: "Literal";
    value: number | string;
}
