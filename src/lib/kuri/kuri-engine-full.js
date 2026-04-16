/**
 * KURI SCRIPT ENGINE v2.0 — Insight Trading Platform
 * Full-featured scripting language for indicators and strategies
 */
(function (root) {
    'use strict';

    // ============================================================
    // TOKEN TYPES
    // ============================================================
    const T = {
        NUMBER: 'NUMBER',
        STRING: 'STRING',
        BOOLEAN: 'BOOLEAN',
        NA: 'NA',
        COLOR: 'COLOR',
        IDENTIFIER: 'IDENTIFIER',
        KEYWORD: 'KEYWORD',
        PLUS: 'PLUS',
        MINUS: 'MINUS',
        STAR: 'STAR',
        SLASH: 'SLASH',
        PERCENT: 'PERCENT',
        ASSIGN: 'ASSIGN',
        REASSIGN: 'REASSIGN',
        EQ: 'EQ',
        NEQ: 'NEQ',
        GT: 'GT',
        GTE: 'GTE',
        LT: 'LT',
        LTE: 'LTE',
        QUESTION: 'QUESTION',
        COLON: 'COLON',
        ARROW: 'ARROW',
        PLUS_ASSIGN: 'PLUS_ASSIGN',
        MINUS_ASSIGN: 'MINUS_ASSIGN',
        STAR_ASSIGN: 'STAR_ASSIGN',
        SLASH_ASSIGN: 'SLASH_ASSIGN',
        AND: 'AND',
        OR: 'OR',
        NOT: 'NOT',
        LPAREN: 'LPAREN',
        RPAREN: 'RPAREN',
        LBRACKET: 'LBRACKET',
        RBRACKET: 'RBRACKET',
        COMMA: 'COMMA',
        DOT: 'DOT',
        NEWLINE: 'NEWLINE',
        INDENT: 'INDENT',
        DEDENT: 'DEDENT',
        EOF: 'EOF',
        ANNOTATION: 'ANNOTATION',
    };

    const KEYWORDS = new Set([
        'if',
        'else',
        'for',
        'in',
        'to',
        'by',
        'while',
        'break',
        'continue',
        'return',
        'var',
        'varip',
        'input',
        'indicator',
        'strategy',
        'switch',
        'plot',
        'plotshape',
        'plotchar',
        'plotarrow',
        'hline',
        'fill',
        'bgcolor',
        'alert',
        'alertcondition',
        'true',
        'false',
        'na',
        'and',
        'or',
        'not',
        'int',
        'float',
        'bool',
        'string',
        'color',
        'series',
        'simple',
        'import',
        'export',
        'type',
        'method',
        'enum',
        'array',
        'matrix',
        'map',
        'line',
        'label',
        'box',
        'table',
        'linefill',
        'param',
        'mark',
    ]);

    // ============================================================
    // LEXER
    // ============================================================
    class Lexer {
        constructor(src) {
            this.src = src;
            this.pos = 0;
            this.line = 1;
            this.col = 1;
            this.tokens = [];
            this.indentStack = [0];
            this.parenDepth = 0;
        }
        peek(o = 0) {
            return this.src[this.pos + o] || '\0';
        }
        advance() {
            const c = this.src[this.pos] || '\0';
            this.pos++;
            if (c === '\n') {
                this.line++;
                this.col = 1;
            } else {
                this.col++;
            }
            return c;
        }
        match(e) {
            if (this.peek() === e) {
                this.advance();
                return true;
            }
            return false;
        }
        atEnd() {
            return this.pos >= this.src.length;
        }
        isDigit(c) {
            return c >= '0' && c <= '9';
        }
        isAlpha(c) {
            return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
        }
        isAlphaNum(c) {
            return this.isAlpha(c) || this.isDigit(c);
        }
        addTok(type, value) {
            this.tokens.push({ type, value, line: this.line, col: this.col });
        }

        scanNumber() {
            const sc = this.col;
            let n = '';
            while (this.isDigit(this.peek())) n += this.advance();
            if (this.peek() === '.' && this.isDigit(this.peek(1))) {
                n += this.advance();
                while (this.isDigit(this.peek())) n += this.advance();
            }
            if (this.peek() === 'e' || this.peek() === 'E') {
                n += this.advance();
                if (this.peek() === '+' || this.peek() === '-') n += this.advance();
                while (this.isDigit(this.peek())) n += this.advance();
            }
            this.tokens.push({ type: T.NUMBER, value: parseFloat(n), line: this.line, col: sc });
        }

        scanString(q) {
            const sc = this.col,
                sl = this.line;
            this.advance();
            let s = '';
            while (!this.atEnd() && this.peek() !== q) {
                if (this.peek() === '\\') {
                    this.advance();
                    const e = this.advance();
                    s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
                } else s += this.advance();
            }
            if (this.atEnd()) throw new Error(`Lexer Error L${sl}:${sc}: Unterminated string`);
            this.advance();
            this.tokens.push({ type: T.STRING, value: s, line: this.line, col: sc });
        }

        scanIdent() {
            const sc = this.col;
            let name = '';
            while (this.isAlphaNum(this.peek())) name += this.advance();
            if (name === 'true' || name === 'false')
                this.tokens.push({
                    type: T.BOOLEAN,
                    value: name === 'true',
                    line: this.line,
                    col: sc,
                });
            else if (name === 'na')
                this.tokens.push({ type: T.NA, value: null, line: this.line, col: sc });
            else if (name === 'and')
                this.tokens.push({ type: T.AND, value: 'and', line: this.line, col: sc });
            else if (name === 'or')
                this.tokens.push({ type: T.OR, value: 'or', line: this.line, col: sc });
            else if (name === 'not')
                this.tokens.push({ type: T.NOT, value: 'not', line: this.line, col: sc });
            else if (KEYWORDS.has(name))
                this.tokens.push({ type: T.KEYWORD, value: name, line: this.line, col: sc });
            else this.tokens.push({ type: T.IDENTIFIER, value: name, line: this.line, col: sc });
        }

        scanColorHex() {
            const sc = this.col;
            this.advance();
            let h = '#';
            while (/[0-9a-fA-F]/.test(this.peek())) h += this.advance();
            this.tokens.push({ type: T.COLOR, value: h, line: this.line, col: sc });
        }

        tokenize() {
            // --- YAML header detection ---
            // If the source starts with '---', parse the YAML header block
            const trimmedStart = this.src.replace(/^[\s\r\n]*/, '');
            const yamlOffset = this.src.length - trimmedStart.length;
            if (trimmedStart.startsWith('---')) {
                const afterOpen = trimmedStart.indexOf('\n', 3);
                if (afterOpen !== -1) {
                    const closeIdx = trimmedStart.indexOf('\n---', afterOpen);
                    if (closeIdx !== -1) {
                        const yamlBlock = trimmedStart.substring(afterOpen + 1, closeIdx);
                        const meta = {};
                        for (const rawLine of yamlBlock.split('\n')) {
                            const line = rawLine.trim();
                            if (!line || line.startsWith('#')) continue;
                            const colonIdx = line.indexOf(':');
                            if (colonIdx === -1) continue;
                            const key = line.substring(0, colonIdx).trim();
                            let val = line.substring(colonIdx + 1).trim();
                            // Strip surrounding quotes
                            if (
                                (val.startsWith('"') && val.endsWith('"')) ||
                                (val.startsWith("'") && val.endsWith("'"))
                            ) {
                                val = val.slice(1, -1);
                            }
                            // Parse booleans and numbers
                            if (val === 'true') val = true;
                            else if (val === 'false') val = false;
                            else if (val !== '' && !isNaN(Number(val))) val = Number(val);
                            meta[key] = val;
                        }
                        this._yamlMeta = meta;
                        // Advance past the closing '---' line
                        const endPos = yamlOffset + closeIdx + 4; // +4 for '\n---'
                        // Skip past any trailing newline after closing ---
                        let finalPos = endPos;
                        while (
                            finalPos < this.src.length &&
                            (this.src[finalPos] === '\r' || this.src[finalPos] === '\n')
                        ) {
                            finalPos++;
                        }
                        // Count lines skipped
                        for (let i = 0; i < finalPos; i++) {
                            if (this.src[i] === '\n') this.line++;
                        }
                        this.pos = finalPos;
                    }
                }
            }

            while (!this.atEnd()) {
                const ch = this.peek();
                if (ch === '\n') {
                    this.advance();
                    // Inside parens/brackets: skip newlines and indentation entirely
                    if (this.parenDepth > 0) {
                        while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\r')
                            this.advance();
                        continue;
                    }
                    this.addTok(T.NEWLINE, '\\n');
                    let indent = 0;
                    while (this.peek() === ' ') {
                        indent++;
                        this.advance();
                    }
                    while (this.peek() === '\t') {
                        indent += 4;
                        this.advance();
                    }
                    if (this.peek() === '\n' || this.peek() === '\r' || this.atEnd()) continue;
                    if (this.peek() === '/' && this.peek(1) === '/') continue;

                    // LINE CONTINUATION: if the next non-whitespace is a continuation operator,
                    // suppress the NEWLINE + INDENT/DEDENT and treat as same logical line.
                    // This handles Kuri Script patterns like:
                    //   x = a
                    //        ? b
                    //        : c
                    //   y = a
                    //        and b
                    //        or c
                    const firstCh = this.peek();
                    const firstTwo = firstCh + (this.peek(1) || '');
                    const isContinuationOp =
                        firstCh === '?' ||
                        firstCh === ':' ||
                        // Check for 'and', 'or', 'not' keywords as continuation
                        (this.isAlpha(firstCh) &&
                            (() => {
                                let w = '';
                                let p = 0;
                                while (this.isAlphaNum(this.src[this.pos + p] || ''))
                                    w += this.src[this.pos + p++];
                                return w === 'and' || w === 'or';
                            })());

                    if (
                        isContinuationOp &&
                        indent > this.indentStack[this.indentStack.length - 1]
                    ) {
                        // Remove the NEWLINE we just added — this is a continuation line
                        if (
                            this.tokens.length > 0 &&
                            this.tokens[this.tokens.length - 1].type === T.NEWLINE
                        )
                            this.tokens.pop();
                        continue; // Don't emit INDENT/DEDENT
                    }

                    const cur = this.indentStack[this.indentStack.length - 1];
                    if (indent > cur) {
                        this.indentStack.push(indent);
                        this.addTok(T.INDENT, indent);
                    } else {
                        while (indent < this.indentStack[this.indentStack.length - 1]) {
                            this.indentStack.pop();
                            this.addTok(T.DEDENT, indent);
                        }
                    }
                    continue;
                }
                if (ch === ' ' || ch === '\t' || ch === '\r') {
                    this.advance();
                    continue;
                }
                if (ch === '/' && this.peek(1) === '/') {
                    if (this.peek(2) === '@') {
                        const sc = this.col;
                        this.advance();
                        this.advance();
                        this.advance();
                        let a = '//@';
                        while (!this.atEnd() && this.peek() !== '\n') a += this.advance();
                        this.tokens.push({
                            type: T.ANNOTATION,
                            value: a.trim(),
                            line: this.line,
                            col: sc,
                        });
                    } else {
                        this.advance();
                        this.advance();
                        while (!this.atEnd() && this.peek() !== '\n') this.advance();
                    }
                    continue;
                }
                if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peek(1)))) {
                    this.scanNumber();
                    continue;
                }
                if (ch === '"' || ch === "'") {
                    this.scanString(ch);
                    continue;
                }
                if (ch === '#' && /[0-9a-fA-F]/.test(this.peek(1))) {
                    this.scanColorHex();
                    continue;
                }
                if (this.isAlpha(ch)) {
                    this.scanIdent();
                    continue;
                }
                this.advance();
                const sc = this.col - 1;
                switch (ch) {
                    case '+':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.PLUS_ASSIGN,
                                  value: '+=',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.tokens.push({
                                  type: T.PLUS,
                                  value: '+',
                                  line: this.line,
                                  col: sc,
                              });
                        break;
                    case '-':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.MINUS_ASSIGN,
                                  value: '-=',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.tokens.push({
                                  type: T.MINUS,
                                  value: '-',
                                  line: this.line,
                                  col: sc,
                              });
                        break;
                    case '*':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.STAR_ASSIGN,
                                  value: '*=',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.tokens.push({
                                  type: T.STAR,
                                  value: '*',
                                  line: this.line,
                                  col: sc,
                              });
                        break;
                    case '/':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.SLASH_ASSIGN,
                                  value: '/=',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.tokens.push({
                                  type: T.SLASH,
                                  value: '/',
                                  line: this.line,
                                  col: sc,
                              });
                        break;
                    case '%':
                        this.tokens.push({ type: T.PERCENT, value: '%', line: this.line, col: sc });
                        break;
                    case '=':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.EQ,
                                  value: '==',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.match('>')
                              ? this.tokens.push({
                                    type: T.ARROW,
                                    value: '=>',
                                    line: this.line,
                                    col: sc,
                                })
                              : this.tokens.push({
                                    type: T.ASSIGN,
                                    value: '=',
                                    line: this.line,
                                    col: sc,
                                });
                        break;
                    case ':':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.REASSIGN,
                                  value: ':=',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.tokens.push({
                                  type: T.COLON,
                                  value: ':',
                                  line: this.line,
                                  col: sc,
                              });
                        break;
                    case '!':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.NEQ,
                                  value: '!=',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.tokens.push({
                                  type: T.NOT,
                                  value: '!',
                                  line: this.line,
                                  col: sc,
                              });
                        break;
                    case '>':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.GTE,
                                  value: '>=',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.tokens.push({
                                  type: T.GT,
                                  value: '>',
                                  line: this.line,
                                  col: sc,
                              });
                        break;
                    case '<':
                        this.match('=')
                            ? this.tokens.push({
                                  type: T.LTE,
                                  value: '<=',
                                  line: this.line,
                                  col: sc,
                              })
                            : this.tokens.push({
                                  type: T.LT,
                                  value: '<',
                                  line: this.line,
                                  col: sc,
                              });
                        break;
                    case '?':
                        this.tokens.push({
                            type: T.QUESTION,
                            value: '?',
                            line: this.line,
                            col: sc,
                        });
                        break;
                    case '(':
                        this.parenDepth++;
                        this.tokens.push({ type: T.LPAREN, value: '(', line: this.line, col: sc });
                        break;
                    case ')':
                        this.parenDepth = Math.max(0, this.parenDepth - 1);
                        this.tokens.push({ type: T.RPAREN, value: ')', line: this.line, col: sc });
                        break;
                    case '[':
                        this.parenDepth++;
                        this.tokens.push({
                            type: T.LBRACKET,
                            value: '[',
                            line: this.line,
                            col: sc,
                        });
                        break;
                    case ']':
                        this.parenDepth = Math.max(0, this.parenDepth - 1);
                        this.tokens.push({
                            type: T.RBRACKET,
                            value: ']',
                            line: this.line,
                            col: sc,
                        });
                        break;
                    case ',':
                        this.tokens.push({ type: T.COMMA, value: ',', line: this.line, col: sc });
                        break;
                    case '.':
                        this.tokens.push({ type: T.DOT, value: '.', line: this.line, col: sc });
                        break;
                    default:
                        throw new Error(`Lexer Error L${this.line}:${sc}: Unexpected '${ch}'`);
                }
            }
            while (this.indentStack.length > 1) {
                this.indentStack.pop();
                this.addTok(T.DEDENT, 0);
            }
            this.addTok(T.EOF, null);
            // Attach YAML metadata to the tokens array so the Parser can access it
            if (this._yamlMeta) {
                this.tokens._yamlMeta = this._yamlMeta;
            }
            return this.tokens;
        }
    }

    // ============================================================
    // AST NODE TYPES
    // ============================================================
    const N = {
        Program: 'Program',
        Annotation: 'Annotation',
        IndicatorDeclaration: 'IndicatorDeclaration',
        VariableDeclaration: 'VariableDeclaration',
        ReassignmentExpression: 'ReassignmentExpression',
        CompoundAssignment: 'CompoundAssignment',
        IfStatement: 'IfStatement',
        ForStatement: 'ForStatement',
        ForInStatement: 'ForInStatement',
        WhileStatement: 'WhileStatement',
        BreakStatement: 'BreakStatement',
        ContinueStatement: 'ContinueStatement',
        ReturnStatement: 'ReturnStatement',
        SwitchStatement: 'SwitchStatement',
        SwitchCase: 'SwitchCase',
        FunctionDeclaration: 'FunctionDeclaration',
        PlotStatement: 'PlotStatement',
        HlineStatement: 'HlineStatement',
        BgColorStatement: 'BgColorStatement',
        FillStatement: 'FillStatement',
        AlertStatement: 'AlertStatement',
        BinaryExpression: 'BinaryExpression',
        UnaryExpression: 'UnaryExpression',
        TernaryExpression: 'TernaryExpression',
        CallExpression: 'CallExpression',
        MemberExpression: 'MemberExpression',
        HistoryExpression: 'HistoryExpression',
        MethodCallExpression: 'MethodCallExpression',
        Identifier: 'Identifier',
        NumberLiteral: 'NumberLiteral',
        StringLiteral: 'StringLiteral',
        BooleanLiteral: 'BooleanLiteral',
        NaLiteral: 'NaLiteral',
        ColorLiteral: 'ColorLiteral',
        NamedArgument: 'NamedArgument',
        InputDeclaration: 'InputDeclaration',
        BlockStatement: 'BlockStatement',
        TupleExpression: 'TupleExpression',
        ArrayLiteral: 'ArrayLiteral',
        MultiAssignment: 'MultiAssignment',
        ExpressionStatement: 'ExpressionStatement',
    };

    // ============================================================
    // PARSER — Full Kuri Script grammar
    // ============================================================
    class Parser {
        constructor(tokens) {
            this.tokens = tokens;
            this.pos = 0;
            this.errors = [];
        }
        peek(o = 0) {
            return this.tokens[this.pos + o] || { type: T.EOF, value: null };
        }
        current() {
            return this.peek(0);
        }
        advance() {
            return this.tokens[this.pos++] || { type: T.EOF };
        }
        expect(type, value) {
            const t = this.current();
            if (t.type !== type || (value !== undefined && t.value !== value))
                throw new Error(
                    `Parse Error L${t.line}:${t.col}: Expected ${type}${value !== undefined ? '(' + value + ')' : ''} got ${t.type}(${t.value})`
                );
            return this.advance();
        }
        check(type, value) {
            const t = this.current();
            return t.type === type && (value === undefined || t.value === value);
        }
        match(type, value) {
            if (this.check(type, value)) return this.advance();
            return null;
        }
        skipNL() {
            while (this.check(T.NEWLINE)) this.advance();
        }
        atEnd() {
            return this.check(T.EOF);
        }

        parse() {
            const body = [];
            this.skipNL();
            while (!this.atEnd()) {
                try {
                    const s = this.parseStatement();
                    if (s) body.push(s);
                } catch (e) {
                    this.errors.push(e);
                    while (!this.atEnd() && !this.check(T.NEWLINE)) this.advance();
                }
                this.skipNL();
            }
            // If the lexer found a YAML header, synthesize an IndicatorDeclaration node
            if (this.tokens._yamlMeta) {
                const m = this.tokens._yamlMeta;
                // Require version field: "version: kuri 1.0"
                if (m.version === undefined) {
                    throw new Error(`Missing 'version' field in header. Add: version: kuri 1.0`);
                }
                {
                    const versionStr = String(m.version);
                    const vMatch = versionStr.match(/^kuri\s+([\d.]+)$/i);
                    if (!vMatch) {
                        throw new Error(
                            `Invalid version format: "${m.version}". Expected: version: kuri 1.0`
                        );
                    }
                    const vNum = parseFloat(vMatch[1]);
                    if (vNum > 1.0) {
                        throw new Error(
                            `Kuri version ${vMatch[1]} is not supported. This engine supports version 1.0.`
                        );
                    }
                }
                const kind = m.type === 'strategy' ? 'strategy' : 'indicator';
                const args = [];
                if (m.name)
                    args.push({
                        type: 'NamedArgument',
                        name: 'title',
                        value: { type: 'StringLiteral', value: m.name },
                    });
                if (m.short)
                    args.push({
                        type: 'NamedArgument',
                        name: 'shorttitle',
                        value: { type: 'StringLiteral', value: m.short },
                    });
                const isOverlay = m.pane === 'overlay';
                args.push({
                    type: 'NamedArgument',
                    name: 'overlay',
                    value: { type: 'BooleanLiteral', value: isOverlay },
                });
                body.unshift({ type: 'IndicatorDeclaration', kind, arguments: args, line: 0 });
            }
            return { type: N.Program, body, errors: this.errors };
        }

        parseStatement() {
            this.skipNL();
            if (this.atEnd()) return null;
            const t = this.current();

            if (t.type === T.ANNOTATION) {
                this.advance();
                return { type: N.Annotation, value: t.value, line: t.line };
            }

            if (t.type === T.KEYWORD) {
                switch (t.value) {
                    case 'indicator':
                        // Pine Script compatibility: parse indicator() declaration
                        return this.parseIndicator();
                    case 'strategy':
                        if (this.peek(1).type === T.DOT) break;
                        // Pine Script compatibility: parse strategy() declaration
                        return this.parseIndicator();
                    case 'var':
                    case 'varip':
                        return this.parseVarDecl();
                    case 'if':
                        return this.parseIf();
                    case 'for':
                        return this.parseFor();
                    case 'while':
                        return this.parseWhile();
                    case 'switch':
                        return this.parseSwitch();
                    case 'break':
                        this.advance();
                        return { type: N.BreakStatement, line: t.line };
                    case 'continue':
                        this.advance();
                        return { type: N.ContinueStatement, line: t.line };
                    case 'return':
                        return this.parseReturn();
                    case 'plot': {
                        // Pine Script compatibility: plot() → same as mark()
                        const plotToken = this.advance();
                        this.expect(T.LPAREN);
                        const plotArgs = this.parseArgList();
                        this.expect(T.RPAREN);
                        return {
                            type: N.PlotStatement,
                            kind: 'plot',
                            arguments: plotArgs,
                            line: plotToken.line,
                        };
                    }
                    case 'plotshape': {
                        // Pine Script compatibility: plotshape() → same as mark.shape()
                        const psToken = this.advance();
                        this.expect(T.LPAREN);
                        const psArgs = this.parseArgList();
                        this.expect(T.RPAREN);
                        return {
                            type: N.PlotStatement,
                            kind: 'plotshape',
                            arguments: psArgs,
                            line: psToken.line,
                        };
                    }
                    case 'plotchar': {
                        const pcToken = this.advance();
                        this.expect(T.LPAREN);
                        const pcArgs = this.parseArgList();
                        this.expect(T.RPAREN);
                        return {
                            type: N.PlotStatement,
                            kind: 'plotshape',
                            arguments: pcArgs,
                            line: pcToken.line,
                        };
                    }
                    case 'plotarrow': {
                        const paToken = this.advance();
                        this.expect(T.LPAREN);
                        const paArgs = this.parseArgList();
                        this.expect(T.RPAREN);
                        return {
                            type: N.PlotStatement,
                            kind: 'plotarrow',
                            arguments: paArgs,
                            line: paToken.line,
                        };
                    }
                    case 'hline': {
                        const hlToken = this.advance();
                        this.expect(T.LPAREN);
                        const hlArgs = this.parseArgList();
                        this.expect(T.RPAREN);
                        return { type: N.HlineStatement, arguments: hlArgs, line: hlToken.line };
                    }
                    case 'bgcolor': {
                        const bgToken = this.advance();
                        this.expect(T.LPAREN);
                        const bgArgs = this.parseArgList();
                        this.expect(T.RPAREN);
                        return { type: N.BgColorStatement, arguments: bgArgs, line: bgToken.line };
                    }
                    case 'fill': {
                        const fillToken = this.advance();
                        this.expect(T.LPAREN);
                        const fillArgs = this.parseArgList();
                        this.expect(T.RPAREN);
                        return { type: N.FillStatement, arguments: fillArgs, line: fillToken.line };
                    }
                    case 'draw':
                        throw new Error(
                            `Parse Error L${t.line}: draw.*() is deprecated. Use mark() or mark.*() instead. Examples: mark(val), mark.level(70), mark.fill(p1, p2)`
                        );
                    case 'alert':
                    case 'alertcondition': {
                        // Pine Script compatibility: parse alertcondition()
                        const alertToken = this.advance();
                        this.expect(T.LPAREN);
                        const alertArgs = this.parseArgList();
                        this.expect(T.RPAREN);
                        return {
                            type: N.AlertStatement,
                            kind: 'alertcondition',
                            arguments: alertArgs,
                            line: alertToken.line,
                        };
                    }
                    case 'input': {
                        // Pine Script compatibility: parse input.*() as param.*()
                        // Falls through to expression parsing which handles input.string(), input.int(), etc.
                        break;
                    }
                    case 'param': {
                        this.advance();
                        this.expect(T.LPAREN);
                        const a = this.parseArgList();
                        this.expect(T.RPAREN);
                        return { type: N.InputDeclaration, arguments: a, line: t.line };
                    }
                    case 'mark': {
                        const markToken = this.advance(); // consume 'mark'
                        // mark.level(), mark.fill(), mark.bgcolor(), mark.shape(), mark.arrow()
                        if (this.check(T.DOT)) {
                            this.advance(); // consume '.'
                            const method = this.advance();
                            this.expect(T.LPAREN);
                            const a = this.parseArgList();
                            this.expect(T.RPAREN);
                            const methodName = method.value;
                            if (methodName === 'shape') {
                                return {
                                    type: N.PlotStatement,
                                    kind: 'plotshape',
                                    arguments: a,
                                    line: markToken.line,
                                };
                            } else if (methodName === 'arrow') {
                                return {
                                    type: N.PlotStatement,
                                    kind: 'plotarrow',
                                    arguments: a,
                                    line: markToken.line,
                                };
                            } else if (methodName === 'level') {
                                return {
                                    type: N.HlineStatement,
                                    arguments: a,
                                    line: markToken.line,
                                };
                            } else if (methodName === 'fill') {
                                return {
                                    type: N.FillStatement,
                                    arguments: a,
                                    line: markToken.line,
                                };
                            } else if (methodName === 'bgcolor') {
                                return {
                                    type: N.BgColorStatement,
                                    arguments: a,
                                    line: markToken.line,
                                };
                            }
                            throw new Error(
                                `Parse Error L${markToken.line}: Unknown mark method: mark.${methodName}`
                            );
                        }
                        // mark(val) — standalone plot call
                        this.expect(T.LPAREN);
                        const a = this.parseArgList();
                        this.expect(T.RPAREN);
                        return {
                            type: N.PlotStatement,
                            kind: 'plot',
                            arguments: a,
                            line: markToken.line,
                        };
                    }
                    // Type declarations used as prefix (int x = ..., float y = ...)
                    case 'int':
                    case 'float':
                    case 'bool':
                    case 'string':
                    case 'color':
                    case 'series':
                    case 'simple':
                    case 'line':
                    case 'label':
                    case 'box':
                    case 'table':
                    case 'linefill':
                    case 'array':
                    case 'matrix':
                    case 'map':
                        return this.parseTypedDeclarationOrExpr();
                }
            }

            // Check for function declaration: name(params) =>
            if (t.type === T.IDENTIFIER && this.peek(1).type === T.LPAREN) {
                const saved = this.pos;
                try {
                    const fn = this.tryParseFunctionDecl();
                    if (fn) return fn;
                } catch (e) {
                    this.pos = saved;
                }
            }

            // Tuple destructuring: [a, b, c] = expr
            if (t.type === T.LBRACKET) {
                const saved = this.pos;
                try {
                    const tuple = this.parseTupleDestructuring();
                    if (tuple) return tuple;
                } catch (e) {
                    this.pos = saved;
                }
            }

            return this.parseAssignOrExpr();
        }

        parseIndicator() {
            const t = this.advance();
            this.expect(T.LPAREN);
            const a = this.parseArgList();
            this.expect(T.RPAREN);
            return { type: N.IndicatorDeclaration, kind: t.value, arguments: a, line: t.line };
        }

        parseVarDecl() {
            const kw = this.advance();
            let typeAnn = null;
            // Optional type: var int x, var float y, var line l, var label lb
            if (
                this.check(T.KEYWORD) &&
                [
                    'int',
                    'float',
                    'bool',
                    'string',
                    'color',
                    'series',
                    'simple',
                    'line',
                    'label',
                    'box',
                    'table',
                    'linefill',
                    'array',
                    'matrix',
                    'map',
                ].includes(this.current().value)
            )
                typeAnn = this.advance().value;
            const name = this.expect(T.IDENTIFIER).value;
            this.expect(T.ASSIGN);
            const init = this.parseExpression();
            return {
                type: N.VariableDeclaration,
                name,
                init,
                persistent: true,
                varip: kw.value === 'varip',
                typeAnnotation: typeAnn,
                line: kw.line,
            };
        }

        parseTypedDeclarationOrExpr() {
            // Handle: float rng = ..., line r1Line = ..., etc.
            const saved = this.pos;
            const typeKw = this.advance(); // consume type keyword

            if (this.check(T.IDENTIFIER)) {
                const name = this.advance().value;
                if (this.match(T.ASSIGN)) {
                    const init = this.parseExpression();
                    return {
                        type: N.VariableDeclaration,
                        name,
                        init,
                        persistent: false,
                        varip: false,
                        typeAnnotation: typeKw.value,
                        line: typeKw.line,
                    };
                }
                // Not an assignment, backtrack
                this.pos = saved;
            } else {
                this.pos = saved;
            }
            // Fall through to expression
            return this.parseAssignOrExpr();
        }

        tryParseFunctionDecl() {
            const nameTok = this.advance(); // identifier
            this.expect(T.LPAREN);
            const params = [];
            if (!this.check(T.RPAREN)) {
                do {
                    this.skipNL();
                    const pname = this.expect(T.IDENTIFIER).value;
                    let defVal = null;
                    if (this.match(T.ASSIGN)) {
                        defVal = this.parseExpression();
                    }
                    params.push({ name: pname, default: defVal });
                    this.skipNL();
                } while (this.match(T.COMMA));
            }
            this.expect(T.RPAREN);
            this.skipNL();

            // Must be followed by =>
            if (!this.match(T.ARROW)) {
                throw new Error('Not a function declaration');
            }

            this.skipNL();
            let body;
            if (this.match(T.INDENT)) {
                body = this.parseBlock();
            } else {
                body = this.parseExpression();
            }

            return {
                type: N.FunctionDeclaration,
                name: nameTok.value,
                params,
                body,
                line: nameTok.line,
            };
        }

        parseIf() {
            const t = this.advance();
            const cond = this.parseExpression();
            this.skipNL();
            let cons;
            if (this.match(T.INDENT)) cons = this.parseBlock();
            else cons = { type: N.BlockStatement, body: [this.parseStatement()] };
            let alt = null;
            this.skipNL();
            if (this.check(T.KEYWORD, 'else')) {
                this.advance();
                this.skipNL();
                if (this.check(T.KEYWORD, 'if')) alt = this.parseIf();
                else if (this.match(T.INDENT)) alt = this.parseBlock();
                else alt = { type: N.BlockStatement, body: [this.parseStatement()] };
            }
            return {
                type: N.IfStatement,
                condition: cond,
                consequent: cons,
                alternate: alt,
                line: t.line,
            };
        }

        parseFor() {
            const t = this.advance();
            const v = this.expect(T.IDENTIFIER).value;
            // for x in collection
            if (this.match(T.KEYWORD, 'in')) {
                const collection = this.parseExpression();
                this.skipNL();
                let body;
                if (this.match(T.INDENT)) body = this.parseBlock();
                else body = { type: N.BlockStatement, body: [this.parseStatement()] };
                return { type: N.ForInStatement, variable: v, collection, body, line: t.line };
            }
            // for x = start to end [by step]
            this.expect(T.ASSIGN);
            const start = this.parseExpression();
            this.expect(T.KEYWORD, 'to');
            const end = this.parseExpression();
            let step = null;
            if (this.match(T.KEYWORD, 'by')) step = this.parseExpression();
            this.skipNL();
            let body;
            if (this.match(T.INDENT)) body = this.parseBlock();
            else body = { type: N.BlockStatement, body: [this.parseStatement()] };
            return { type: N.ForStatement, variable: v, start, end, step, body, line: t.line };
        }

        parseWhile() {
            const t = this.advance();
            const cond = this.parseExpression();
            this.skipNL();
            let body;
            if (this.match(T.INDENT)) body = this.parseBlock();
            else body = { type: N.BlockStatement, body: [this.parseStatement()] };
            return { type: N.WhileStatement, condition: cond, body, line: t.line };
        }

        parseSwitch() {
            const t = this.advance(); // consume 'switch'
            let expr = null;
            // Optional switch expression (switch myVar)
            if (!this.check(T.NEWLINE) && !this.check(T.INDENT)) {
                expr = this.parseExpression();
            }
            this.skipNL();
            const cases = [];
            if (this.match(T.INDENT)) {
                while (!this.check(T.DEDENT) && !this.atEnd()) {
                    this.skipNL();
                    if (this.check(T.DEDENT)) break;

                    let condition = null;
                    // Default case uses =>
                    if (this.match(T.ARROW)) {
                        // default case
                        this.skipNL();
                        let body;
                        if (this.match(T.INDENT)) body = this.parseBlock();
                        else body = this.parseExpression();
                        cases.push({
                            type: N.SwitchCase,
                            condition: null,
                            body,
                            isDefault: true,
                            line: t.line,
                        });
                    } else {
                        condition = this.parseExpression();
                        this.skipNL();
                        this.expect(T.ARROW);
                        this.skipNL();
                        let body;
                        if (this.match(T.INDENT)) body = this.parseBlock();
                        else body = this.parseExpression();
                        cases.push({
                            type: N.SwitchCase,
                            condition,
                            body,
                            isDefault: false,
                            line: t.line,
                        });
                    }
                    this.skipNL();
                }
                this.match(T.DEDENT);
            }
            return { type: N.SwitchStatement, expression: expr, cases, line: t.line };
        }

        parseReturn() {
            const t = this.advance();
            let val = null;
            if (!this.check(T.NEWLINE) && !this.atEnd()) val = this.parseExpression();
            return { type: N.ReturnStatement, value: val, line: t.line };
        }

        parsePlot() {
            const t = this.advance();
            this.expect(T.LPAREN);
            const a = this.parseArgList();
            this.expect(T.RPAREN);
            return { type: N.PlotStatement, kind: t.value, arguments: a, line: t.line };
        }

        parseBlock() {
            const body = [];
            this.skipNL();
            while (!this.check(T.DEDENT) && !this.atEnd()) {
                const s = this.parseStatement();
                if (s) body.push(s);
                this.skipNL();
            }
            this.match(T.DEDENT);
            return { type: N.BlockStatement, body };
        }

        // ---- Tuple Destructuring: [a, b, c] = expr ----
        parseTupleDestructuring() {
            const startLine = this.current().line;
            this.expect(T.LBRACKET);
            const names = [];
            if (!this.check(T.RBRACKET)) {
                do {
                    this.skipNL();
                    if (this.check(T.RBRACKET)) break;
                    const name = this.expect(T.IDENTIFIER).value;
                    names.push(name);
                    this.skipNL();
                } while (this.match(T.COMMA));
            }
            this.expect(T.RBRACKET);
            // Must be followed by = or :=
            const isReassign = this.match(T.REASSIGN);
            if (!isReassign) this.expect(T.ASSIGN);
            const init = this.parseExpression();
            return { type: N.MultiAssignment, names, init, reassign: isReassign, line: startLine };
        }

        parseAssignOrExpr() {
            const expr = this.parseExpression();
            if (expr.type === N.Identifier) {
                if (this.match(T.ASSIGN)) {
                    const v = this.parseExpression();
                    return {
                        type: N.VariableDeclaration,
                        name: expr.name,
                        init: v,
                        persistent: false,
                        varip: false,
                        typeAnnotation: null,
                        line: expr.line,
                    };
                }
                if (this.match(T.REASSIGN)) {
                    const v = this.parseExpression();
                    return {
                        type: N.ReassignmentExpression,
                        name: expr.name,
                        value: v,
                        line: expr.line,
                    };
                }
                for (const [tt, op] of [
                    [T.PLUS_ASSIGN, '+'],
                    [T.MINUS_ASSIGN, '-'],
                    [T.STAR_ASSIGN, '*'],
                    [T.SLASH_ASSIGN, '/'],
                ]) {
                    if (this.match(tt)) {
                        const v = this.parseExpression();
                        return {
                            type: N.CompoundAssignment,
                            name: expr.name,
                            operator: op,
                            value: v,
                            line: expr.line,
                        };
                    }
                }
            }
            // Handle member reassignment: obj.prop := val (for line, label methods)
            if (expr.type === N.MemberExpression) {
                if (this.match(T.REASSIGN)) {
                    const v = this.parseExpression();
                    return {
                        type: N.ReassignmentExpression,
                        target: expr,
                        name: null,
                        value: v,
                        line: expr.line,
                    };
                }
                if (this.match(T.ASSIGN)) {
                    const v = this.parseExpression();
                    return {
                        type: N.VariableDeclaration,
                        target: expr,
                        name: null,
                        init: v,
                        persistent: false,
                        varip: false,
                        line: expr.line,
                    };
                }
            }
            return expr;
        }

        // ---- Expression Precedence ----
        parseExpression() {
            return this.parseTernary();
        }
        parseTernary() {
            let e = this.parseOr();
            if (this.match(T.QUESTION)) {
                const c = this.parseExpression();
                this.expect(T.COLON);
                const a = this.parseExpression();
                return {
                    type: N.TernaryExpression,
                    condition: e,
                    consequent: c,
                    alternate: a,
                    line: e.line,
                };
            }
            return e;
        }
        parseOr() {
            let l = this.parseAnd();
            while (this.match(T.OR)) {
                const r = this.parseAnd();
                l = { type: N.BinaryExpression, operator: 'or', left: l, right: r, line: l.line };
            }
            return l;
        }
        parseAnd() {
            let l = this.parseNot();
            while (this.match(T.AND)) {
                const r = this.parseNot();
                l = { type: N.BinaryExpression, operator: 'and', left: l, right: r, line: l.line };
            }
            return l;
        }
        parseNot() {
            if (this.match(T.NOT)) {
                const o = this.parseNot();
                return { type: N.UnaryExpression, operator: 'not', operand: o, line: o.line };
            }
            return this.parseComp();
        }
        parseComp() {
            let l = this.parseAdd();
            const ops = [T.EQ, T.NEQ, T.GT, T.GTE, T.LT, T.LTE];
            while (ops.some((o) => this.check(o))) {
                const op = this.advance();
                const r = this.parseAdd();
                l = {
                    type: N.BinaryExpression,
                    operator: op.value,
                    left: l,
                    right: r,
                    line: l.line,
                };
            }
            return l;
        }
        parseAdd() {
            let l = this.parseMul();
            while (this.check(T.PLUS) || this.check(T.MINUS)) {
                const op = this.advance();
                const r = this.parseMul();
                l = {
                    type: N.BinaryExpression,
                    operator: op.value,
                    left: l,
                    right: r,
                    line: l.line,
                };
            }
            return l;
        }
        parseMul() {
            let l = this.parseUnary();
            while (this.check(T.STAR) || this.check(T.SLASH) || this.check(T.PERCENT)) {
                const op = this.advance();
                const r = this.parseUnary();
                l = {
                    type: N.BinaryExpression,
                    operator: op.value,
                    left: l,
                    right: r,
                    line: l.line,
                };
            }
            return l;
        }
        parseUnary() {
            if (this.check(T.MINUS)) {
                const t = this.advance();
                const o = this.parseUnary();
                return { type: N.UnaryExpression, operator: '-', operand: o, line: t.line };
            }
            if (this.check(T.PLUS)) {
                this.advance();
                return this.parseUnary();
            }
            return this.parsePostfix();
        }

        parsePostfix() {
            let e = this.parsePrimary();
            while (true) {
                if (this.check(T.LPAREN)) {
                    this.advance();
                    const a = this.parseArgList();
                    this.expect(T.RPAREN);
                    e = { type: N.CallExpression, callee: e, arguments: a, line: e.line };
                } else if (this.match(T.DOT)) {
                    // After dot: accept both IDENTIFIER and KEYWORD (e.g., input.color, label.style_label_left)
                    let m;
                    if (this.check(T.IDENTIFIER) || this.check(T.KEYWORD)) {
                        m = this.advance();
                    } else {
                        throw new Error(
                            `Parse Error L${this.current().line}:${this.current().col}: Expected property name after '.'`
                        );
                    }
                    // Check for method call: obj.method(args)
                    if (this.check(T.LPAREN)) {
                        this.advance();
                        const a = this.parseArgList();
                        this.expect(T.RPAREN);
                        e = {
                            type: N.MethodCallExpression,
                            object: e,
                            method: m.value,
                            arguments: a,
                            line: e.line,
                        };
                    } else {
                        e = {
                            type: N.MemberExpression,
                            object: e,
                            property: m.value,
                            line: e.line,
                        };
                    }
                } else if (this.check(T.LBRACKET)) {
                    this.advance();
                    const idx = this.parseExpression();
                    this.expect(T.RBRACKET);
                    e = { type: N.HistoryExpression, source: e, offset: idx, line: e.line };
                } else break;
            }
            return e;
        }

        parsePrimary() {
            const t = this.current();
            if (t.type === T.NUMBER) {
                this.advance();
                return { type: N.NumberLiteral, value: t.value, line: t.line };
            }
            if (t.type === T.STRING) {
                this.advance();
                return { type: N.StringLiteral, value: t.value, line: t.line };
            }
            if (t.type === T.BOOLEAN) {
                this.advance();
                return { type: N.BooleanLiteral, value: t.value, line: t.line };
            }
            if (t.type === T.NA) {
                // If followed by '(', treat as function call identifier (na(value) checks if value is na)
                if (this.peek(1).type === T.LPAREN) {
                    this.advance();
                    return { type: N.Identifier, name: 'na', line: t.line };
                }
                this.advance();
                return { type: N.NaLiteral, line: t.line };
            }
            if (t.type === T.COLOR) {
                this.advance();
                return { type: N.ColorLiteral, value: t.value, line: t.line };
            }
            if (t.type === T.LPAREN) {
                this.advance();
                const e = this.parseExpression();
                this.expect(T.RPAREN);
                return e;
            }
            // Array / Tuple literal: [expr, expr, ...]
            if (t.type === T.LBRACKET) {
                this.advance();
                const elements = [];
                if (!this.check(T.RBRACKET)) {
                    do {
                        this.skipNL();
                        if (this.check(T.RBRACKET)) break;
                        elements.push(this.parseExpression());
                        this.skipNL();
                    } while (this.match(T.COMMA));
                }
                this.expect(T.RBRACKET);
                return { type: N.ArrayLiteral, elements, line: t.line };
            }
            // Keywords that can be used as identifiers (namespaces for constants/methods)
            if (
                t.type === T.KEYWORD &&
                [
                    'param',
                    'kuri',
                    'mark',
                    'color',
                    'int',
                    'float',
                    'bool',
                    'string',
                    'array',
                    'matrix',
                    'map',
                    'line',
                    'label',
                    'box',
                    'table',
                    'linefill',
                    'series',
                    'simple',
                    'na',
                    'strategy',
                    'enum',
                    'input',
                    'plot',
                    'hline',
                    'bgcolor',
                    'fill',
                    'alert',
                    'alertcondition',
                ].includes(t.value)
            ) {
                this.advance();
                return { type: N.Identifier, name: t.value, line: t.line };
            }
            if (t.type === T.IDENTIFIER) {
                this.advance();
                return { type: N.Identifier, name: t.value, line: t.line };
            }
            if (t.type === T.KEYWORD && t.value === 'if') return this.parseIf();
            if (t.type === T.KEYWORD && t.value === 'switch') return this.parseSwitch();
            throw new Error(`Parse Error L${t.line}:${t.col}: Unexpected ${t.type}(${t.value})`);
        }

        parseArgList() {
            const args = [];
            if (this.check(T.RPAREN)) return args;
            do {
                this.skipNL();
                if (this.check(T.RPAREN)) break;
                // Named argument: name=value — name can be IDENTIFIER or KEYWORD (e.g., color=, style=, string=)
                const isNamedArg =
                    (this.check(T.IDENTIFIER) || this.check(T.KEYWORD)) &&
                    this.peek(1).type === T.ASSIGN;
                if (isNamedArg) {
                    const name = this.advance().value;
                    this.advance();
                    const val = this.parseExpression();
                    args.push({ type: N.NamedArgument, name, value: val, line: val.line });
                } else {
                    args.push(this.parseExpression());
                }
                this.skipNL();
            } while (this.match(T.COMMA));
            return args;
        }
    }

    // ============================================================
    // UTILITY
    // ============================================================
    function nz(v, r = 0) {
        return v === null || v === undefined || Number.isNaN(v) ? r : v;
    }
    function isNa(v) {
        return v === null || v === undefined || Number.isNaN(v);
    }

    // ============================================================
    // TECHNICAL ANALYSIS FUNCTIONS
    // ============================================================

    /** Unwrap a period/length arg: if it's an array (series), extract first non-NaN value. */
    function _unwrapPeriod(p) {
        if (Array.isArray(p)) {
            const v = p.find((x) => !isNaN(x) && x !== null && x !== undefined);
            return v !== undefined ? Math.trunc(v) : NaN;
        }
        return typeof p === 'number' ? p : NaN;
    }

    function _sma(src, p) {
        p = _unwrapPeriod(p);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = p - 1; i < src.length; i++) {
            let s = 0;
            for (let j = 0; j < p; j++) s += nz(src[i - j]);
            r[i] = s / p;
        }
        return r;
    }
    function _ema(src, p) {
        p = _unwrapPeriod(p);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        const m = 2 / (p + 1);
        let s = 0;
        for (let i = 0; i < p && i < src.length; i++) s += nz(src[i]);
        if (p <= src.length) {
            r[p - 1] = s / p;
            for (let i = p; i < src.length; i++) r[i] = (nz(src[i]) - r[i - 1]) * m + r[i - 1];
        }
        return r;
    }
    function _wma(src, p) {
        p = _unwrapPeriod(p);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        const d = (p * (p + 1)) / 2;
        for (let i = p - 1; i < src.length; i++) {
            let s = 0;
            for (let j = 0; j < p; j++) s += nz(src[i - j]) * (p - j);
            r[i] = s / d;
        }
        return r;
    }
    function _rma(src, p) {
        p = _unwrapPeriod(p);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        const a = 1 / p;
        let s = 0;
        for (let i = 0; i < p && i < src.length; i++) s += nz(src[i]);
        if (p <= src.length) {
            r[p - 1] = s / p;
            for (let i = p; i < src.length; i++) r[i] = a * nz(src[i]) + (1 - a) * r[i - 1];
        }
        return r;
    }
    function _vwma(src, vol, p) {
        p = _unwrapPeriod(p);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = p - 1; i < src.length; i++) {
            let sv = 0,
                v = 0;
            for (let j = 0; j < p; j++) {
                sv += nz(src[i - j]) * nz(vol[i - j]);
                v += nz(vol[i - j]);
            }
            r[i] = v ? sv / v : NaN;
        }
        return r;
    }

    function _rsi(src, p) {
        p = _unwrapPeriod(p);
        const r = new Array(src.length).fill(NaN),
            ch = new Array(src.length).fill(0);
        for (let i = 1; i < src.length; i++) ch[i] = nz(src[i]) - nz(src[i - 1]);
        const g = ch.map((c) => (c > 0 ? c : 0)),
            l = ch.map((c) => (c < 0 ? -c : 0));
        const ag = _rma(g, p),
            al = _rma(l, p);
        for (let i = 0; i < src.length; i++) {
            if (!isNa(ag[i]) && !isNa(al[i])) {
                r[i] = al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]);
            }
        }
        return r;
    }
    function _macd(src, fp = 12, sp = 26, sigp = 9) {
        fp = _unwrapPeriod(fp);
        sp = _unwrapPeriod(sp);
        sigp = _unwrapPeriod(sigp);
        const fe = _ema(src, fp),
            se = _ema(src, sp);
        const ml = new Array(src.length).fill(NaN);
        for (let i = 0; i < src.length; i++) {
            if (!isNa(fe[i]) && !isNa(se[i])) ml[i] = fe[i] - se[i];
        }
        const sl = _ema(ml, sigp);
        const hist = new Array(src.length).fill(NaN);
        for (let i = 0; i < src.length; i++) {
            if (!isNa(ml[i]) && !isNa(sl[i])) hist[i] = ml[i] - sl[i];
        }
        return [ml, sl, hist];
    }
    function _stoch(high, low, close, kp = 14, ks = 1, dp = 3) {
        kp = _unwrapPeriod(kp);
        ks = _unwrapPeriod(ks);
        dp = _unwrapPeriod(dp);
        const rk = new Array(close.length).fill(NaN);
        for (let i = kp - 1; i < close.length; i++) {
            let hh = -Infinity,
                ll = Infinity;
            for (let j = 0; j < kp; j++) {
                hh = Math.max(hh, nz(high[i - j]));
                ll = Math.min(ll, nz(low[i - j]));
            }
            const range = hh - ll;
            rk[i] = range ? ((nz(close[i]) - ll) / range) * 100 : 50;
        }
        const k = ks > 1 ? _sma(rk, ks) : rk;
        return [k, _sma(k, dp)];
    }
    function _atr(high, low, close, p = 14) {
        p = _unwrapPeriod(p);
        const tr = new Array(close.length).fill(NaN);
        tr[0] = nz(high[0]) - nz(low[0]);
        for (let i = 1; i < close.length; i++)
            tr[i] = Math.max(
                nz(high[i]) - nz(low[i]),
                Math.abs(nz(high[i]) - nz(close[i - 1])),
                Math.abs(nz(low[i]) - nz(close[i - 1]))
            );
        return _rma(tr, p);
    }
    function _tr(high, low, close) {
        const r = new Array(close.length).fill(NaN);
        r[0] = nz(high[0]) - nz(low[0]);
        for (let i = 1; i < close.length; i++)
            r[i] = Math.max(
                nz(high[i]) - nz(low[i]),
                Math.abs(nz(high[i]) - nz(close[i - 1])),
                Math.abs(nz(low[i]) - nz(close[i - 1]))
            );
        return r;
    }
    function _bb(src, p = 20, mult = 2) {
        p = _unwrapPeriod(p);
        mult = _unwrapPeriod(mult);
        const mid = _sma(src, p),
            up = new Array(src.length).fill(NaN),
            lo = new Array(src.length).fill(NaN);
        for (let i = p - 1; i < src.length; i++) {
            let ss = 0;
            for (let j = 0; j < p; j++) {
                const d = nz(src[i - j]) - mid[i];
                ss += d * d;
            }
            const sd = Math.sqrt(ss / p);
            up[i] = mid[i] + mult * sd;
            lo[i] = mid[i] - mult * sd;
        }
        return [mid, up, lo];
    }
    function _vwap(high, low, close, vol) {
        const r = new Array(close.length).fill(NaN);
        let ct = 0,
            cv = 0;
        for (let i = 0; i < close.length; i++) {
            const tp = (nz(high[i]) + nz(low[i]) + nz(close[i])) / 3;
            ct += tp * nz(vol[i]);
            cv += nz(vol[i]);
            r[i] = cv ? ct / cv : NaN;
        }
        return r;
    }
    function _obv(close, vol) {
        const r = new Array(close.length).fill(0);
        r[0] = nz(vol[0]);
        for (let i = 1; i < close.length; i++) {
            r[i] =
                nz(close[i]) > nz(close[i - 1])
                    ? r[i - 1] + nz(vol[i])
                    : nz(close[i]) < nz(close[i - 1])
                      ? r[i - 1] - nz(vol[i])
                      : r[i - 1];
        }
        return r;
    }
    function _highest(src, p) {
        p = _unwrapPeriod(p);
        const r = new Array(src.length).fill(NaN);
        for (let i = p - 1; i < src.length; i++) {
            let m = -Infinity;
            for (let j = 0; j < p; j++) m = Math.max(m, nz(src[i - j]));
            r[i] = m;
        }
        return r;
    }
    function _lowest(src, p) {
        p = _unwrapPeriod(p);
        const r = new Array(src.length).fill(NaN);
        for (let i = p - 1; i < src.length; i++) {
            let m = Infinity;
            for (let j = 0; j < p; j++) m = Math.min(m, nz(src[i - j]));
            r[i] = m;
        }
        return r;
    }
    function _crossover(a, b) {
        const r = new Array(a.length).fill(false);
        for (let i = 1; i < a.length; i++)
            r[i] = nz(a[i]) > nz(b[i]) && nz(a[i - 1]) <= nz(b[i - 1]);
        return r;
    }
    function _crossunder(a, b) {
        const r = new Array(a.length).fill(false);
        for (let i = 1; i < a.length; i++)
            r[i] = nz(a[i]) < nz(b[i]) && nz(a[i - 1]) >= nz(b[i - 1]);
        return r;
    }
    function _change(src, len = 1) {
        len = _unwrapPeriod(len);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len; i < src.length; i++) r[i] = nz(src[i]) - nz(src[i - len]);
        return r;
    }
    function _pivothigh(src, lb, rb) {
        lb = _unwrapPeriod(lb);
        rb = _unwrapPeriod(rb);
        const r = new Array(src.length).fill(NaN);
        for (let i = lb + rb; i < src.length; i++) {
            const pivotIdx = i - rb;
            let isPivot = true;
            for (let j = pivotIdx - lb; j <= pivotIdx + rb; j++) {
                if (j !== pivotIdx && nz(src[j]) >= nz(src[pivotIdx])) {
                    isPivot = false;
                    break;
                }
            }
            if (isPivot) r[i] = src[pivotIdx];
        }
        return r;
    }
    function _pivotlow(src, lb, rb) {
        lb = _unwrapPeriod(lb);
        rb = _unwrapPeriod(rb);
        const r = new Array(src.length).fill(NaN);
        for (let i = lb + rb; i < src.length; i++) {
            const pivotIdx = i - rb;
            let isPivot = true;
            for (let j = pivotIdx - lb; j <= pivotIdx + rb; j++) {
                if (j !== pivotIdx && nz(src[j]) <= nz(src[pivotIdx])) {
                    isPivot = false;
                    break;
                }
            }
            if (isPivot) r[i] = src[pivotIdx];
        }
        return r;
    }
    function _stdev(src, p) {
        p = _unwrapPeriod(p);
        const r = new Array(src.length).fill(NaN);
        const m = _sma(src, p);
        for (let i = p - 1; i < src.length; i++) {
            let ss = 0;
            for (let j = 0; j < p; j++) {
                const d = nz(src[i - j]) - m[i];
                ss += d * d;
            }
            r[i] = Math.sqrt(ss / p);
        }
        return r;
    }
    function _variance(src, p) {
        p = _unwrapPeriod(p);
        const r = new Array(src.length).fill(NaN);
        const m = _sma(src, p);
        for (let i = p - 1; i < src.length; i++) {
            let ss = 0;
            for (let j = 0; j < p; j++) {
                const d = nz(src[i - j]) - m[i];
                ss += d * d;
            }
            r[i] = ss / p;
        }
        return r;
    }
    function _cum(src) {
        const r = new Array(src.length).fill(0);
        r[0] = nz(src[0]);
        for (let i = 1; i < src.length; i++) r[i] = r[i - 1] + nz(src[i]);
        return r;
    }
    function _barssince(cond) {
        const r = new Array(cond.length).fill(NaN);
        let c = NaN;
        for (let i = 0; i < cond.length; i++) {
            if (cond[i]) c = 0;
            else if (!isNa(c)) c++;
            r[i] = c;
        }
        return r;
    }

    // Full TA registry — series functions return full arrays
    const taFunctions = {
        'ta.sma': (a) => _sma(a[0], a[1]),
        'ta.ema': (a) => _ema(a[0], a[1]),
        'ta.wma': (a) => _wma(a[0], a[1]),
        'ta.rma': (a) => _rma(a[0], a[1]),
        'ta.vwma': (a) => _vwma(a[0], a[1], a[2]),
        'ta.rsi': (a) => _rsi(a[0], a[1]),
        'ta.macd': (a) => _macd(a[0], a[1] || 12, a[2] || 26, a[3] || 9),
        'ta.stoch': (a) => _stoch(a[0], a[1], a[2], a[3] || 14, a[4] || 1, a[5] || 3),
        'ta.atr': (a) => _atr(a[0], a[1], a[2], a[3] || 14),
        'ta.tr': (a) => _tr(a[0], a[1], a[2]),
        'ta.bb': (a) => _bb(a[0], a[1] || 20, a[2] || 2),
        'ta.vwap': (a) => _vwap(a[0], a[1], a[2], a[3]),
        'ta.obv': (a) => _obv(a[0], a[1]),
        'ta.highest': (a) => _highest(a[0], a[1]),
        'ta.lowest': (a) => _lowest(a[0], a[1]),
        'ta.crossover': (a) => _crossover(a[0], a[1]),
        'ta.crossunder': (a) => _crossunder(a[0], a[1]),
        'ta.change': (a) => _change(a[0], a[1] || 1),
        'ta.pivothigh': (a) => _pivothigh(a[0], a[1], a[2]),
        'ta.pivotlow': (a) => _pivotlow(a[0], a[1], a[2]),
        'ta.stdev': (a) => _stdev(a[0], a[1]),
        'ta.variance': (a) => _variance(a[0], a[1]),
        'ta.cum': (a) => _cum(a[0]),
        'ta.barssince': (a) => _barssince(a[0]),
    };

    // Math functions
    const mathFunctions = {
        'math.abs': (a) =>
            typeof a[0] === 'number'
                ? Math.abs(a[0])
                : Array.isArray(a[0])
                  ? a[0].map((v) => Math.abs(nz(v)))
                  : NaN,
        'math.max': (a) => {
            if (a.length === 1 && Array.isArray(a[0]))
                return Math.max(...a[0].filter((v) => !isNa(v)));
            return Math.max(...a.filter((v) => !isNa(v)));
        },
        'math.min': (a) => {
            if (a.length === 1 && Array.isArray(a[0]))
                return Math.min(...a[0].filter((v) => !isNa(v)));
            return Math.min(...a.filter((v) => !isNa(v)));
        },
        'math.round': (a) => {
            if (a.length >= 2) return Math.round(a[0] * Math.pow(10, a[1])) / Math.pow(10, a[1]);
            return typeof a[0] === 'number' ? Math.round(a[0]) : NaN;
        },
        'math.ceil': (a) => (typeof a[0] === 'number' ? Math.ceil(a[0]) : NaN),
        'math.floor': (a) => (typeof a[0] === 'number' ? Math.floor(a[0]) : NaN),
        'math.sqrt': (a) => (typeof a[0] === 'number' ? Math.sqrt(a[0]) : NaN),
        'math.pow': (a) => Math.pow(a[0], a[1]),
        'math.log': (a) => (typeof a[0] === 'number' ? Math.log(a[0]) : NaN),
        'math.log10': (a) => (typeof a[0] === 'number' ? Math.log10(a[0]) : NaN),
        'math.sign': (a) => Math.sign(a[0]),
        'math.avg': (a) => {
            const vals = a.filter((v) => !isNa(v));
            return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : NaN;
        },
        'math.sum': (a) => {
            if (Array.isArray(a[0]) && typeof a[1] === 'number') {
                const src = a[0],
                    p = a[1];
                const r = new Array(src.length).fill(NaN);
                for (let i = p - 1; i < src.length; i++) {
                    let s = 0;
                    for (let j = 0; j < p; j++) s += nz(src[i - j]);
                    r[i] = s;
                }
                return r;
            }
            return a.reduce((s, v) => s + nz(v), 0);
        },
        'math.todegrees': (a) => (a[0] * 180) / Math.PI,
        'math.toradians': (a) => (a[0] * Math.PI) / 180,
        'math.random': (a) =>
            a.length >= 2 ? a[0] + Math.random() * (a[1] - a[0]) : Math.random(),
    };

    // String functions
    const strFunctions = {
        'str.tostring': (a) => {
            if (a.length >= 2) {
                // format parameter handling
                const fmt = a[1];
                if (typeof fmt === 'string' && fmt.startsWith('format.')) {
                    const val = a[0];
                    if (fmt === 'format.mintick')
                        return typeof val === 'number' ? val.toFixed(2) : String(val);
                    if (fmt === 'format.percent')
                        return typeof val === 'number' ? (val * 100).toFixed(2) + '%' : String(val);
                    if (fmt === 'format.volume')
                        return typeof val === 'number' ? val.toLocaleString() : String(val);
                }
                if (typeof fmt === 'number')
                    return typeof a[0] === 'number' ? a[0].toFixed(fmt) : String(a[0]);
            }
            return String(a[0]);
        },
        'str.format': (a) => {
            let s = a[0];
            for (let i = 1; i < a.length; i++) s = s.replace(`{${i - 1}}`, String(a[i]));
            return s;
        },
        'str.length': (a) => (typeof a[0] === 'string' ? a[0].length : 0),
        'str.contains': (a) => (typeof a[0] === 'string' ? a[0].includes(a[1]) : false),
        'str.replace': (a) => (typeof a[0] === 'string' ? a[0].replace(a[1], a[2]) : a[0]),
        'str.replace_all': (a) => (typeof a[0] === 'string' ? a[0].replaceAll(a[1], a[2]) : a[0]),
        'str.upper': (a) => (typeof a[0] === 'string' ? a[0].toUpperCase() : a[0]),
        'str.lower': (a) => (typeof a[0] === 'string' ? a[0].toLowerCase() : a[0]),
        'str.startswith': (a) => (typeof a[0] === 'string' ? a[0].startsWith(a[1]) : false),
        'str.endswith': (a) => (typeof a[0] === 'string' ? a[0].endsWith(a[1]) : false),
        'str.substring': (a) => (typeof a[0] === 'string' ? a[0].substring(a[1], a[2]) : a[0]),
        'str.tonumber': (a) => parseFloat(a[0]),
        'str.split': (a) => (typeof a[0] === 'string' ? a[0].split(a[1]) : []),
        'str.trim': (a) => (typeof a[0] === 'string' ? a[0].trim() : a[0]),
        'str.repeat': (a) => (typeof a[0] === 'string' ? a[0].repeat(a[1]) : a[0]),
        'str.pos': (a) => (typeof a[0] === 'string' ? a[0].indexOf(a[1]) : NaN),
    };

    // Color constants
    const colorConstants = {
        'color.aqua': '#00FFFF',
        'color.black': '#000000',
        'color.blue': '#2196F3',
        'color.fuchsia': '#FF00FF',
        'color.gray': '#808080',
        'color.green': '#4CAF50',
        'color.lime': '#00FF00',
        'color.maroon': '#800000',
        'color.navy': '#000080',
        'color.olive': '#808000',
        'color.orange': '#FF9800',
        'color.purple': '#9C27B0',
        'color.red': '#F44336',
        'color.silver': '#C0C0C0',
        'color.teal': '#008080',
        'color.white': '#FFFFFF',
        'color.yellow': '#FFEB3B',
        'color.none': 'transparent',
    };

    const colorFunctions = {
        'color.new': (a) => {
            const alpha = Math.round((100 - nz(a[1], 0)) * 2.55)
                .toString(16)
                .padStart(2, '0');
            // Strip any existing alpha from #RRGGBBAA before appending new alpha
            const base = (a[0] || '#000000').slice(0, 7);
            return base + alpha;
        },
        'color.rgb': (a) => `rgba(${a[0]},${a[1]},${a[2]},${(100 - nz(a[3], 0)) / 100})`,
        'color.r': (a) => {
            const c = a[0] || '';
            return parseInt(c.slice(1, 3), 16) || 0;
        },
        'color.g': (a) => {
            const c = a[0] || '';
            return parseInt(c.slice(3, 5), 16) || 0;
        },
        'color.b': (a) => {
            const c = a[0] || '';
            return parseInt(c.slice(5, 7), 16) || 0;
        },
        'color.t': (a) => {
            const c = a[0] || '';
            if (c.length === 9) {
                return 100 - Math.round(parseInt(c.slice(7, 9), 16) / 2.55);
            }
            return 0;
        },
        'color.from_gradient': (a) => {
            const [val, lo, hi, colLo, colHi] = a;
            const t = Math.max(0, Math.min(1, (val - lo) / (hi - lo)));
            return colLo; /* simplified */
        },
    };

    // ============================================================
    // DRAWING API — line, label, box objects
    // ============================================================
    let _drawId = 0;

    class DrawingLine {
        constructor(x1, y1, x2, y2, opts = {}) {
            this.id = ++_drawId;
            this.type = 'line';
            this.x1 = x1;
            this.y1 = y1;
            this.x2 = x2;
            this.y2 = y2;
            this.color = opts.color || '#808080';
            this.width = opts.width || 1;
            this.style = opts.style || 'solid';
            this.xloc = opts.xloc || 'bar_time';
            this.extend = opts.extend || 'none';
            this.deleted = false;
        }
        get_x1() {
            return this.x1;
        }
        set_x1(v) {
            this.x1 = v;
        }
        get_y1() {
            return this.y1;
        }
        set_y1(v) {
            this.y1 = v;
        }
        get_x2() {
            return this.x2;
        }
        set_x2(v) {
            this.x2 = v;
        }
        get_y2() {
            return this.y2;
        }
        set_y2(v) {
            this.y2 = v;
        }
        get_price() {
            return this.y2;
        }
        set_color(c) {
            this.color = c;
        }
        set_width(w) {
            this.width = w;
        }
        set_style(s) {
            this.style = s;
        }
        set_extend(e) {
            this.extend = e;
        }
        set_xloc(x) {
            this.xloc = x;
        }
        delete() {
            this.deleted = true;
        }
        copy() {
            return new DrawingLine(this.x1, this.y1, this.x2, this.y2, {
                color: this.color,
                width: this.width,
                style: this.style,
                xloc: this.xloc,
            });
        }
    }

    class DrawingLabel {
        constructor(x, y, text, opts = {}) {
            this.id = ++_drawId;
            this.type = 'label';
            this.x = x;
            this.y = y;
            this.text = text;
            this.xloc = opts.xloc || 'bar_time';
            this.yloc = opts.yloc || 'price';
            this.color = opts.color || '#00000000';
            this.textcolor = opts.textcolor || '#FFFFFF';
            this.style = opts.style || 'label_down';
            this.size = opts.size || 'normal';
            this.tooltip = opts.tooltip || '';
            this.textalign = opts.textalign || 'center';
            this.deleted = false;
        }
        get_x() {
            return this.x;
        }
        set_x(v) {
            this.x = v;
        }
        get_y() {
            return this.y;
        }
        set_y(v) {
            this.y = v;
        }
        get_text() {
            return this.text;
        }
        set_text(v) {
            this.text = v;
        }
        set_color(c) {
            this.color = c;
        }
        set_textcolor(c) {
            this.textcolor = c;
        }
        set_style(s) {
            this.style = s;
        }
        set_size(s) {
            this.size = s;
        }
        set_tooltip(t) {
            this.tooltip = t;
        }
        set_textalign(a) {
            this.textalign = a;
        }
        set_xloc(x) {
            this.xloc = x;
        }
        set_yloc(y) {
            this.yloc = y;
        }
        delete() {
            this.deleted = true;
        }
        copy() {
            return new DrawingLabel(this.x, this.y, this.text, {
                xloc: this.xloc,
                yloc: this.yloc,
                color: this.color,
                textcolor: this.textcolor,
                style: this.style,
                size: this.size,
            });
        }
    }

    class DrawingBox {
        constructor(x1, y1, x2, y2, opts = {}) {
            this.id = ++_drawId;
            this.type = 'box';
            this.left = x1;
            this.top = y1;
            this.right = x2;
            this.bottom = y2;
            this.border_color = opts.border_color || '#808080';
            this.border_width = opts.border_width || 1;
            this.border_style = opts.border_style || 'solid';
            this.bgcolor = opts.bgcolor || 'transparent';
            this.xloc = opts.xloc || 'bar_time';
            this.text = opts.text || '';
            this.text_color = opts.text_color || '#FFFFFF';
            this.text_size = opts.text_size || 'normal';
            this.deleted = false;
        }
        set_left(v) {
            this.left = v;
        }
        set_top(v) {
            this.top = v;
        }
        set_right(v) {
            this.right = v;
        }
        set_bottom(v) {
            this.bottom = v;
        }
        set_bgcolor(c) {
            this.bgcolor = c;
        }
        set_border_color(c) {
            this.border_color = c;
        }
        set_border_width(w) {
            this.border_width = w;
        }
        set_text(t) {
            this.text = t;
        }
        delete() {
            this.deleted = true;
        }
    }

    // Drawing factory functions
    const drawingFunctions = {
        'line.new': (a) => {
            const opts = {};
            if (a.named) {
                Object.assign(opts, a.named);
            }
            // Support both positional and named args for coordinates (Pine Script compatibility)
            const x1 = a[0] !== undefined ? a[0] : opts.x1 != null ? opts.x1 : undefined;
            const y1 = a[1] !== undefined ? a[1] : opts.y1 != null ? opts.y1 : undefined;
            const x2 = a[2] !== undefined ? a[2] : opts.x2 != null ? opts.x2 : undefined;
            const y2 = a[3] !== undefined ? a[3] : opts.y2 != null ? opts.y2 : undefined;
            return new DrawingLine(x1, y1, x2, y2, opts);
        },
        'line.delete': (a) => {
            if (a[0] && a[0].delete) a[0].delete();
        },
        'line.get_y1': (a) => (a[0] ? a[0].get_y1() : NaN),
        'line.get_y2': (a) => (a[0] ? a[0].get_y2() : NaN),
        'line.get_x1': (a) => (a[0] ? a[0].get_x1() : NaN),
        'line.get_x2': (a) => (a[0] ? a[0].get_x2() : NaN),
        'line.get_price': (a) => (a[0] ? a[0].get_price() : NaN),
        'line.set_x1': (a) => {
            if (a[0]) a[0].set_x1(a[1]);
        },
        'line.set_y1': (a) => {
            if (a[0]) a[0].set_y1(a[1]);
        },
        'line.set_x2': (a) => {
            if (a[0]) a[0].set_x2(a[1]);
        },
        'line.set_y2': (a) => {
            if (a[0]) a[0].set_y2(a[1]);
        },
        'line.set_color': (a) => {
            if (a[0]) a[0].set_color(a[1]);
        },
        'line.set_width': (a) => {
            if (a[0]) a[0].set_width(a[1]);
        },
        'line.set_style': (a) => {
            if (a[0]) a[0].set_style(a[1]);
        },
        'line.set_extend': (a) => {
            if (a[0]) a[0].set_extend(a[1]);
        },
        'line.set_xloc': (a) => {
            if (a[0]) a[0].set_xloc(a[1]);
        },
        'line.copy': (a) => (a[0] ? a[0].copy() : null),

        'label.new': (a) => {
            const opts = {};
            if (a.named) {
                Object.assign(opts, a.named);
            }
            // Support both positional and named args (Pine Script compatibility)
            const x = a[0] !== undefined ? a[0] : opts.x != null ? opts.x : undefined;
            const y = a[1] !== undefined ? a[1] : opts.y != null ? opts.y : undefined;
            const text = a[2] !== undefined ? a[2] : opts.text != null ? opts.text : '';
            return new DrawingLabel(x, y, text, opts);
        },
        'label.delete': (a) => {
            if (a[0] && a[0].delete) a[0].delete();
        },
        'label.get_x': (a) => (a[0] ? a[0].get_x() : NaN),
        'label.get_y': (a) => (a[0] ? a[0].get_y() : NaN),
        'label.get_text': (a) => (a[0] ? a[0].get_text() : ''),
        'label.set_x': (a) => {
            if (a[0]) a[0].set_x(a[1]);
        },
        'label.set_y': (a) => {
            if (a[0]) a[0].set_y(a[1]);
        },
        'label.set_text': (a) => {
            if (a[0]) a[0].set_text(a[1]);
        },
        'label.set_color': (a) => {
            if (a[0]) a[0].set_color(a[1]);
        },
        'label.set_textcolor': (a) => {
            if (a[0]) a[0].set_textcolor(a[1]);
        },
        'label.set_style': (a) => {
            if (a[0]) a[0].set_style(a[1]);
        },
        'label.set_size': (a) => {
            if (a[0]) a[0].set_size(a[1]);
        },
        'label.set_tooltip': (a) => {
            if (a[0]) a[0].set_tooltip(a[1]);
        },
        'label.set_xloc': (a) => {
            if (a[0]) a[0].set_xloc(a[1]);
        },
        'label.set_yloc': (a) => {
            if (a[0]) a[0].set_yloc(a[1]);
        },
        'label.set_textalign': (a) => {
            if (a[0]) a[0].set_textalign(a[1]);
        },
        'label.copy': (a) => (a[0] ? a[0].copy() : null),

        'box.new': (a) => {
            const opts = {};
            if (a.named) Object.assign(opts, a.named);
            // Support both positional and named args (Pine Script compatibility)
            const x1 = a[0] !== undefined ? a[0] : opts.x1 != null ? opts.x1 : opts.left;
            const y1 = a[1] !== undefined ? a[1] : opts.y1 != null ? opts.y1 : opts.top;
            const x2 = a[2] !== undefined ? a[2] : opts.x2 != null ? opts.x2 : opts.right;
            const y2 = a[3] !== undefined ? a[3] : opts.y2 != null ? opts.y2 : opts.bottom;
            return new DrawingBox(x1, y1, x2, y2, opts);
        },
        'box.delete': (a) => {
            if (a[0] && a[0].delete) a[0].delete();
        },
        'box.set_left': (a) => {
            if (a[0]) a[0].set_left(a[1]);
        },
        'box.set_top': (a) => {
            if (a[0]) a[0].set_top(a[1]);
        },
        'box.set_right': (a) => {
            if (a[0]) a[0].set_right(a[1]);
        },
        'box.set_bottom': (a) => {
            if (a[0]) a[0].set_bottom(a[1]);
        },
        'box.set_bgcolor': (a) => {
            if (a[0]) a[0].set_bgcolor(a[1]);
        },
        'box.set_text': (a) => {
            if (a[0]) a[0].set_text(a[1]);
        },
    };

    // Array functions
    const arrayFunctions = {
        'array.new_float': (a) => {
            const sz = a[0] || 0;
            const val = a[1] || NaN;
            return new Array(sz).fill(val);
        },
        'array.new_int': (a) => {
            const sz = a[0] || 0;
            const val = a[1] || 0;
            return new Array(sz).fill(val);
        },
        'array.new_bool': (a) => {
            const sz = a[0] || 0;
            const val = a[1] || false;
            return new Array(sz).fill(val);
        },
        'array.new_string': (a) => {
            const sz = a[0] || 0;
            const val = a[1] || '';
            return new Array(sz).fill(val);
        },
        'array.new_color': (a) => {
            const sz = a[0] || 0;
            const val = a[1] || '#000';
            return new Array(sz).fill(val);
        },
        'array.new_line': (a) => new Array(a[0] || 0).fill(null),
        'array.new_label': (a) => new Array(a[0] || 0).fill(null),
        'array.size': (a) => (Array.isArray(a[0]) ? a[0].length : 0),
        'array.get': (a) => (Array.isArray(a[0]) && a[1] < a[0].length ? a[0][a[1]] : NaN),
        'array.set': (a) => {
            if (Array.isArray(a[0]) && a[1] < a[0].length) a[0][a[1]] = a[2];
        },
        'array.push': (a) => {
            if (Array.isArray(a[0])) a[0].push(a[1]);
        },
        'array.pop': (a) => (Array.isArray(a[0]) ? a[0].pop() : NaN),
        'array.unshift': (a) => {
            if (Array.isArray(a[0])) a[0].unshift(a[1]);
        },
        'array.shift': (a) => (Array.isArray(a[0]) ? a[0].shift() : NaN),
        'array.remove': (a) => {
            if (Array.isArray(a[0])) a[0].splice(a[1], 1);
        },
        'array.insert': (a) => {
            if (Array.isArray(a[0])) a[0].splice(a[1], 0, a[2]);
        },
        'array.clear': (a) => {
            if (Array.isArray(a[0])) a[0].length = 0;
        },
        'array.includes': (a) => (Array.isArray(a[0]) ? a[0].includes(a[1]) : false),
        'array.indexof': (a) => (Array.isArray(a[0]) ? a[0].indexOf(a[1]) : -1),
        'array.sort': (a) => {
            if (Array.isArray(a[0])) a[0].sort((x, y) => x - y);
            return a[0];
        },
        'array.reverse': (a) => {
            if (Array.isArray(a[0])) a[0].reverse();
            return a[0];
        },
        'array.slice': (a) => (Array.isArray(a[0]) ? a[0].slice(a[1], a[2]) : []),
        'array.copy': (a) => (Array.isArray(a[0]) ? [...a[0]] : []),
        'array.join': (a) => (Array.isArray(a[0]) ? a[0].join(a[1] || ',') : ''),
        'array.max': (a) => (Array.isArray(a[0]) ? Math.max(...a[0].filter((v) => !isNa(v))) : NaN),
        'array.min': (a) => (Array.isArray(a[0]) ? Math.min(...a[0].filter((v) => !isNa(v))) : NaN),
        'array.avg': (a) => {
            if (!Array.isArray(a[0])) return NaN;
            const v = a[0].filter((x) => !isNa(x));
            return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
        },
        'array.sum': (a) => {
            if (!Array.isArray(a[0])) return NaN;
            return a[0].filter((x) => !isNa(x)).reduce((s, x) => s + x, 0);
        },
        'array.stdev': (a) => {
            if (!Array.isArray(a[0])) return NaN;
            const v = a[0].filter((x) => !isNa(x));
            if (!v.length) return NaN;
            const avg = v.reduce((s, x) => s + x, 0) / v.length;
            return Math.sqrt(v.reduce((s, x) => s + (x - avg) ** 2, 0) / v.length);
        },
        'array.from': (a) => a.slice(),
        'array.fill': (a) => {
            if (Array.isArray(a[0])) a[0].fill(a[1], a[2], a[3]);
            return a[0];
        },
        'array.concat': (a) =>
            Array.isArray(a[0]) && Array.isArray(a[1]) ? a[0].concat(a[1]) : a[0],
        'array.every': (a) => {
            if (!Array.isArray(a[0]) || typeof a[1] !== 'function') return false;
            for (let i = 0; i < a[0].length; i++) {
                if (!a[1]([a[0][i], i])) return false;
            }
            return true;
        },
        'array.some': (a) => {
            if (!Array.isArray(a[0]) || typeof a[1] !== 'function') return false;
            for (let i = 0; i < a[0].length; i++) {
                if (a[1]([a[0][i], i])) return true;
            }
            return false;
        },
        'array.binary_search': (a) => {
            if (!Array.isArray(a[0])) return -1;
            return a[0].indexOf(a[1]);
        },
        'array.abs': (a) => (Array.isArray(a[0]) ? a[0].map((v) => Math.abs(nz(v))) : []),
        'array.last': (a) => (Array.isArray(a[0]) && a[0].length ? a[0][a[0].length - 1] : NaN),
        'array.first': (a) => (Array.isArray(a[0]) && a[0].length ? a[0][0] : NaN),
        'array.median': (a) => {
            if (!Array.isArray(a[0])) return NaN;
            const s = [...a[0]].filter((v) => !isNa(v)).sort((x, y) => x - y);
            return s.length ? s[Math.floor(s.length / 2)] : NaN;
        },
        'array.mode': (a) => {
            if (!Array.isArray(a[0])) return NaN;
            const counts = {};
            a[0].forEach((v) => {
                counts[v] = (counts[v] || 0) + 1;
            });
            let maxC = 0,
                mode = NaN;
            for (const [k, c] of Object.entries(counts)) {
                if (c > maxC) {
                    maxC = c;
                    mode = Number(k);
                }
            }
            return mode;
        },
    };

    // ============================================================
    // RUNTIME CONSTANTS (Kuri Script enums/globals)
    // ============================================================
    const runtimeConstants = {
        // barstate — resolved dynamically from env.barstate object per bar
        // NOT stored here (null causes false resolution). See evalMember barstate check.

        // syminfo
        'syminfo.mintick': 0.01,
        'syminfo.pointvalue': 1,
        'syminfo.ticker': 'KURI',
        'syminfo.tickerid': 'KURI:MAIN',
        'syminfo.prefix': 'KURI',
        'syminfo.root': 'MAIN',
        'syminfo.currency': 'USD',
        'syminfo.basecurrency': 'USD',
        'syminfo.description': 'Kuri Script Instrument',
        'syminfo.timezone': 'UTC',
        'syminfo.session': '24x7',
        'syminfo.type': 'stock',
        'syminfo.volumetype': 'base',

        // timeframe
        'timeframe.period': 'D',
        'timeframe.multiplier': 1,
        'timeframe.isseconds': false,
        'timeframe.isminutes': false,
        'timeframe.isintraday': false,
        'timeframe.isdaily': true,
        'timeframe.isweekly': false,
        'timeframe.ismonthly': false,
        'timeframe.isdwm': true,

        // xloc
        'xloc.bar_index': 'bar_index',
        'xloc.bar_time': 'bar_time',

        // yloc
        'yloc.price': 'price',
        'yloc.abovebar': 'abovebar',
        'yloc.belowbar': 'belowbar',

        // label styles
        'label.style_label_up': 'label_up',
        'label.style_label_down': 'label_down',
        'label.style_label_left': 'label_left',
        'label.style_label_right': 'label_right',
        'label.style_label_center': 'label_center',
        'label.style_none': 'none',
        'label.style_xcross': 'xcross',
        'label.style_cross': 'cross',
        'label.style_circle': 'circle',
        'label.style_diamond': 'diamond',
        'label.style_flag': 'flag',
        'label.style_arrowup': 'arrowup',
        'label.style_arrowdown': 'arrowdown',
        'label.style_square': 'square',
        'label.style_triangleup': 'triangleup',
        'label.style_triangledown': 'triangledown',

        // line styles
        'line.style_solid': 'solid',
        'line.style_dashed': 'dashed',
        'line.style_dotted': 'dotted',
        'line.style_arrow_left': 'arrow_left',
        'line.style_arrow_right': 'arrow_right',
        'line.style_arrow_both': 'arrow_both',

        // extend
        'extend.none': 'none',
        'extend.left': 'left',
        'extend.right': 'right',
        'extend.both': 'both',

        // size
        'size.auto': 'auto',
        'size.tiny': 'tiny',
        'size.small': 'small',
        'size.normal': 'normal',
        'size.large': 'large',
        'size.huge': 'huge',

        // format
        'format.mintick': 'format.mintick',
        'format.percent': 'format.percent',
        'format.volume': 'format.volume',
        'format.inherit': 'format.inherit',

        // plot styles
        'plot.style_line': 'line',
        'plot.style_histogram': 'histogram',
        'plot.style_cross': 'cross',
        'plot.style_area': 'area',
        'plot.style_columns': 'columns',
        'plot.style_circles': 'circles',
        'plot.style_stepline': 'stepline',
        'plot.style_areabr': 'areabr',

        // shape styles
        'shape.xcross': 'xcross',
        'shape.cross': 'cross',
        'shape.triangleup': 'triangleup',
        'shape.triangledown': 'triangledown',
        'shape.flag': 'flag',
        'shape.circle': 'circle',
        'shape.arrowup': 'arrowup',
        'shape.arrowdown': 'arrowdown',
        'shape.labelup': 'labelup',
        'shape.labeldown': 'labeldown',
        'shape.square': 'square',
        'shape.diamond': 'diamond',

        // location
        'location.abovebar': 'abovebar',
        'location.belowbar': 'belowbar',
        'location.top': 'top',
        'location.bottom': 'bottom',
        'location.absolute': 'absolute',

        // text align
        'text.align_left': 'left',
        'text.align_center': 'center',
        'text.align_right': 'right',

        // hline styles
        'hline.style_solid': 'solid',
        'hline.style_dashed': 'dashed',
        'hline.style_dotted': 'dotted',

        // alert frequency
        'alert.freq_all': 'all',
        'alert.freq_once_per_bar': 'once_per_bar',
        'alert.freq_once_per_bar_close': 'once_per_bar_close',

        // order
        'order.ascending': 'ascending',
        'order.descending': 'descending',

        // strategy enums
        'strategy.long': 'long',
        'strategy.short': 'short',
        'strategy.cash': 'cash',
        'strategy.percent_of_equity': 'percent_of_equity',
        'strategy.fixed': 'fixed',
    };

    // Time functions
    const timeFunctions = {
        time: (a) => {
            /* resolved by interpreter per bar */ return NaN;
        },
        time_close: (a) => {
            return NaN;
        },
        'timeframe.in_seconds': (a) => {
            const tf = a[0] || 'D';
            const map = {
                1: 60,
                3: 180,
                5: 300,
                15: 900,
                30: 1800,
                60: 3600,
                120: 7200,
                240: 14400,
                D: 86400,
                W: 604800,
                M: 2592000,
                '3M': 7776000,
                '6M': 15552000,
                '12M': 31536000,
            };
            return map[tf] || 86400;
        },
        'timeframe.change': (a) => {
            return false;
        },
        year: (a) => (a[0] ? new Date(a[0]).getFullYear() : NaN),
        month: (a) => (a[0] ? new Date(a[0]).getMonth() + 1 : NaN),
        dayofmonth: (a) => (a[0] ? new Date(a[0]).getDate() : NaN),
        dayofweek: (a) => (a[0] ? new Date(a[0]).getDay() + 1 : NaN),
        hour: (a) => (a[0] ? new Date(a[0]).getHours() : NaN),
        minute: (a) => (a[0] ? new Date(a[0]).getMinutes() : NaN),
        second: (a) => (a[0] ? new Date(a[0]).getSeconds() : NaN),
        timestamp: (a) => {
            if (a.length >= 5)
                return new Date(a[0], a[1] - 1, a[2], a[3] || 0, a[4] || 0).getTime();
            if (a.length >= 3) return new Date(a[0], a[1] - 1, a[2]).getTime();
            return Date.now();
        },
    };

    // Utility functions
    const utilityFunctions = {
        nz: (a) => {
            const [v, r = 0] = a;
            if (Array.isArray(v)) return v.map((x) => nz(x, r));
            return nz(v, r);
        },
        na: (a) => {
            if (Array.isArray(a[0])) return a[0].map((v) => isNa(v));
            return isNa(a[0]);
        },
        fixnan: (a) => {
            if (!Array.isArray(a[0])) return a[0];
            const r = [...a[0]];
            for (let i = 1; i < r.length; i++) {
                if (isNa(r[i])) r[i] = r[i - 1];
            }
            return r;
        },
        int: (a) => (typeof a[0] === 'number' ? Math.trunc(a[0]) : parseInt(a[0]) || 0),
        float: (a) => (typeof a[0] === 'number' ? a[0] : parseFloat(a[0]) || NaN),
        bool: (a) => !!a[0],
        param: (a) => a[0],
        'param.int': (a) => a[0],
        'param.float': (a) => a[0],
        'param.bool': (a) => a[0],
        'param.string': (a) => a[0],
        'param.color': (a) => a[0],
        'param.timeframe': (a) => a[0],
        'param.source': (a) => a[0],
        'param.session': (a) => a[0],
        'param.symbol': (a) => a[0],
        'param.text_area': (a) => a[0],
        'request.security': (a) => NaN,
        'ticker.new': (a) => '',
    };

    // Merge all function registries
    const allFunctions = {};
    Object.assign(
        allFunctions,
        taFunctions,
        mathFunctions,
        strFunctions,
        colorFunctions,
        drawingFunctions,
        arrayFunctions,
        timeFunctions,
        utilityFunctions
    );

    class BreakSignal {}
    class ContinueSignal {}
    class ReturnSignal {
        constructor(v) {
            this.value = v;
        }
    }

    class Environment {
        constructor(parent) {
            this.parent = parent || null;
            this.vars = new Map();
        }
        get(n) {
            if (this.vars.has(n)) return this.vars.get(n);
            if (this.parent) return this.parent.get(n);
            return undefined;
        }
        set(n, v) {
            this.vars.set(n, v);
        }
        update(n, v) {
            if (this.vars.has(n)) {
                this.vars.set(n, v);
                return true;
            }
            if (this.parent) return this.parent.update(n, v);
            return false;
        }
        has(n) {
            if (this.vars.has(n)) return true;
            if (this.parent) return this.parent.has(n);
            return false;
        }
    }

    class KuriInterpreter {
        constructor() {
            this.reset();
        }

        reset() {
            this.ohlcv = null;
            this.barIndex = 0;
            this.barCount = 0;
            this.globalEnv = null;
            this.plots = [];
            this.hlines = [];
            this.bgcolors = [];
            this.fills = [];
            this.alerts = [];
            this.indicator = null;
            this.inputs = {};
            this.errors = [];
            this.persistentVars = new Map();
            this.seriesData = new Map();
            this.plotIdCounter = 0;
            this.userFunctions = new Map();
            this.drawings = { lines: [], labels: [], boxes: [] };
            this.inputDefs = [];
            this._taCache = {};
        }

        execute(ast, ohlcv, inputOverrides = {}) {
            this.reset();
            this.ohlcv = ohlcv;
            this.barCount = ohlcv.close.length;
            this.inputs = inputOverrides;

            // Built-in series — use direct references (no copy) for performance
            const bs = {
                open: ohlcv.open,
                high: ohlcv.high,
                low: ohlcv.low,
                close: ohlcv.close,
                volume: ohlcv.volume,
                time: ohlcv.time || [],
                bar_index: Array.from({ length: this.barCount }, (_, i) => i),
                hl2: ohlcv.high.map((h, i) => (h + ohlcv.low[i]) / 2),
                hlc3: ohlcv.high.map((h, i) => (h + ohlcv.low[i] + ohlcv.close[i]) / 3),
                ohlc4: ohlcv.open.map(
                    (o, i) => (o + ohlcv.high[i] + ohlcv.low[i] + ohlcv.close[i]) / 4
                ),
                hlcc4: ohlcv.high.map((h, i) => (h + ohlcv.low[i] + ohlcv.close[i] * 2) / 4),
            };
            for (const [k, v] of Object.entries(bs)) this.seriesData.set(k, v);

            // Pass 1: Collect indicator decl and user-defined functions
            for (const node of ast.body) {
                if (node.type === N.IndicatorDeclaration)
                    this.indicator = this.evalIndicatorDecl(node);
                if (node.type === N.FunctionDeclaration) this.userFunctions.set(node.name, node);
            }

            // Pass 2: Pre-compute TA calls
            this.precomputeTA(ast);

            // Pass 3: Optimized execution with fast/slow path detection
            const _needsSlowPath = ast.body.some(
                (node) =>
                    (node.type === N.VariableDeclaration && node.persistent) ||
                    node.type === N.IfStatement ||
                    node.type === N.ReassignmentExpression ||
                    node.type === N.ForStatement ||
                    node.type === N.ForInStatement ||
                    node.type === N.WhileStatement
            );

            if (!_needsSlowPath) {
                // ═══ FAST PATH: bar 0 + direct plot fill (~5ms) ═══
                // Build set of precomputed variable names to skip during bar 0
                const _precomputed = new Set();
                for (const [name, arr] of this.seriesData) {
                    if (!bs[name] && Array.isArray(arr)) _precomputed.add(name);
                }

                // Step A: Execute bar 0 — skip precomputed VarDecls, only run input/plot/hline
                this.barIndex = 0;
                this.plotIdCounter = 0;
                this.globalEnv = new Environment();
                this.setupBarEnv(this.globalEnv, 0);
                for (const [n, s] of this.seriesData) {
                    if (!bs[n] && Array.isArray(s) && s[0] !== undefined)
                        this.globalEnv.set(n, s[0]);
                }
                try {
                    for (const node of ast.body) {
                        if (
                            node.type === N.Annotation ||
                            node.type === N.IndicatorDeclaration ||
                            node.type === N.FunctionDeclaration
                        )
                            continue;
                        // Skip VarDecls whose value is already precomputed — BUT keep input.*() calls
                        // (they must execute to populate inputDefs for the settings panel)
                        if (node.type === N.VariableDeclaration && _precomputed.has(node.name)) {
                            const initFn =
                                node.init?.type === N.MethodCallExpression
                                    ? (node.init.object?.name || '') + '.' + node.init.method
                                    : '';
                            if (!initFn.startsWith('input.') && !initFn.startsWith('param.'))
                                continue;
                        }
                        this.execNode(node, this.globalEnv, 0);
                    }
                } catch (e) {
                    if (
                        !(e instanceof ReturnSignal) &&
                        !(e instanceof BreakSignal) &&
                        !(e instanceof ContinueSignal)
                    )
                        this.errors.push({ message: e.message, line: e.line || null, bar: 0 });
                }

                // Step B: Populate plot data + colors from precomputed seriesData
                const plotNodes = ast.body.filter((n) => n.type === N.PlotStatement);
                for (let pi = 0; pi < this.plots.length && pi < plotNodes.length; pi++) {
                    const plot = this.plots[pi];
                    const pNode = plotNodes[pi];
                    const firstArg = pNode.arguments[0];
                    let sd = null;
                    if (firstArg && firstArg.type === N.Identifier) {
                        sd = this.seriesData.get(firstArg.name);
                    }
                    if (!sd)
                        sd =
                            this.seriesData.get(plot.title) ||
                            this.seriesData.get(plot.title.toLowerCase());
                    if (sd && Array.isArray(sd) && sd.length === this.barCount) {
                        for (let i = 0; i < this.barCount; i++) {
                            plot.data[i] = isNaN(sd[i]) ? NaN : sd[i];
                        }
                    }
                    // Fill per-bar colors from seriesData if color arg is a variable
                    const colorArg = pNode.arguments.find(
                        (a) => a.type === N.NamedArgument && a.name === 'color'
                    );
                    if (colorArg && colorArg.value && colorArg.value.type === N.Identifier) {
                        const colorSD = this.seriesData.get(colorArg.value.name);
                        if (colorSD && Array.isArray(colorSD)) {
                            for (let i = 0; i < this.barCount; i++) {
                                if (typeof colorSD[i] === 'string') plot.colors[i] = colorSD[i];
                            }
                        }
                    }
                }

                // Step C: If any plots still empty after fast path, fallback to bar-by-bar
                const _anyEmpty = this.plots.some((p) => {
                    const start = Math.max(0, p.data.length - 50);
                    for (let i = start; i < p.data.length; i++) {
                        if (!isNaN(p.data[i])) return false;
                    }
                    return true;
                });
                if (_anyEmpty) {
                    for (let bar = 1; bar < this.barCount; bar++) {
                        this.barIndex = bar;
                        this.plotIdCounter = 0;
                        this.globalEnv = new Environment();
                        this.setupBarEnv(this.globalEnv, bar);
                        for (const [n, s] of this.seriesData) {
                            if (!bs[n] && Array.isArray(s) && s[bar] !== undefined)
                                this.globalEnv.set(n, s[bar]);
                        }
                        try {
                            for (const node of ast.body) {
                                if (
                                    node.type === N.Annotation ||
                                    node.type === N.IndicatorDeclaration ||
                                    node.type === N.FunctionDeclaration
                                )
                                    continue;
                                this.execNode(node, this.globalEnv, bar);
                            }
                        } catch (e) {
                            if (e instanceof ReturnSignal) continue;
                            if (!(e instanceof BreakSignal) && !(e instanceof ContinueSignal))
                                this.errors.push({ message: e.message, line: e.line || null, bar });
                        }
                    }
                }
            } else {
                // ═══ SLOW PATH: full bar-by-bar (SuperTrend, etc.) ═══
                // Build set of precomputed variables to skip re-evaluation
                const _slowPrecomputed = new Set();
                for (const [name, arr] of this.seriesData) {
                    if (!bs[name] && Array.isArray(arr) && arr.some((v) => !isNaN(v)))
                        _slowPrecomputed.add(name);
                }
                for (let bar = 0; bar < this.barCount; bar++) {
                    this.barIndex = bar;
                    this.plotIdCounter = 0;
                    this.globalEnv = new Environment();
                    this.setupBarEnv(this.globalEnv, bar);
                    // Set seriesData FIRST, then persistent vars (so var values take precedence)
                    for (const [n, s] of this.seriesData) {
                        if (!bs[n] && Array.isArray(s) && s[bar] !== undefined)
                            this.globalEnv.set(n, s[bar]);
                    }
                    for (const [n, v] of this.persistentVars) this.globalEnv.set(n, v);
                    try {
                        for (const node of ast.body) {
                            if (
                                node.type === N.Annotation ||
                                node.type === N.IndicatorDeclaration ||
                                node.type === N.FunctionDeclaration
                            )
                                continue;
                            // Skip VarDecls that were successfully precomputed (e.g., request.security results)
                            // but keep persistent vars (var/varip) and input calls
                            if (
                                node.type === N.VariableDeclaration &&
                                !node.persistent &&
                                _slowPrecomputed.has(node.name)
                            ) {
                                const initFn =
                                    node.init?.type === N.MethodCallExpression
                                        ? (node.init.object?.name || '') + '.' + node.init.method
                                        : '';
                                if (!initFn.startsWith('input.') && !initFn.startsWith('param.'))
                                    continue;
                            }
                            this.execNode(node, this.globalEnv, bar);
                        }
                    } catch (e) {
                        if (e instanceof ReturnSignal) continue;
                        if (!(e instanceof BreakSignal) && !(e instanceof ContinueSignal))
                            this.errors.push({ message: e.message, line: e.line || null, bar });
                    }
                    for (const [n] of this.persistentVars) {
                        const v = this.globalEnv.get(n);
                        if (v !== undefined) this.persistentVars.set(n, v);
                    }
                }
            }

            return {
                indicator: this.indicator,
                plots: this.plots,
                hlines: this.hlines,
                bgcolors: this.bgcolors,
                fills: this.fills,
                alerts: this.alerts,
                errors: this.errors,
                seriesData: this.seriesData,
                drawings: {
                    lines: (this.drawings.lines || []).filter(d => !d.deleted),
                    labels: (this.drawings.labels || []).filter(d => !d.deleted),
                    boxes: (this.drawings.boxes || []).filter(d => !d.deleted),
                },
                inputDefs: this.inputDefs,
            };
        }

        setupBarEnv(env, bar) {
            env.set('open', this.ohlcv.open[bar]);
            env.set('high', this.ohlcv.high[bar]);
            env.set('low', this.ohlcv.low[bar]);
            env.set('close', this.ohlcv.close[bar]);
            env.set('volume', this.ohlcv.volume[bar]);
            env.set('time', (this.ohlcv.time || [])[bar]);
            env.set('bar_index', bar);
            env.set('last_bar_index', this.barCount - 1);
            env.set('hl2', (this.ohlcv.high[bar] + this.ohlcv.low[bar]) / 2);
            env.set(
                'hlc3',
                (this.ohlcv.high[bar] + this.ohlcv.low[bar] + this.ohlcv.close[bar]) / 3
            );
            env.set(
                'ohlc4',
                (this.ohlcv.open[bar] +
                    this.ohlcv.high[bar] +
                    this.ohlcv.low[bar] +
                    this.ohlcv.close[bar]) /
                    4
            );
            env.set('true', true);
            env.set('false', false);

            // barstate
            env.set('barstate', {
                isfirst: bar === 0,
                islast: bar === this.barCount - 1,
                ishistory: true,
                isrealtime: false,
                isnew: true,
                isconfirmed: true,
            });
        }

        precomputeTA(ast) {
            // Helper: try to resolve an expression node to a full series array
            const resolveSeries = (node) => {
                if (!node) return null;
                if (node.type === N.Identifier) {
                    if (this.seriesData.has(node.name)) return this.seriesData.get(node.name);
                    // Check runtime constants (e.g., syminfo.tickerid as single identifier)
                    const rc = runtimeConstants[node.name];
                    if (rc !== undefined && rc !== null) return rc;
                    return null;
                }
                // Handle member expressions: timeframe.isintraday, timeframe.multiplier,
                // syminfo.tickerid, syminfo.mintick, etc.
                if (node.type === N.MemberExpression) {
                    const objName = node.object?.name || (node.object?.type === N.Identifier ? node.object.name : null);
                    const prop = node.property;
                    if (objName && prop) {
                        const fullName = `${objName}.${prop}`;
                        // Check seriesData first (for user-defined objects)
                        if (this.seriesData.has(fullName)) return this.seriesData.get(fullName);
                        // Check runtime constants (timeframe.*, syminfo.*, etc.)
                        const rc = runtimeConstants[fullName];
                        if (rc !== undefined && rc !== null) return rc;
                        // Check color constants
                        const cc = colorConstants[fullName];
                        if (cc !== undefined) return cc;
                    }
                    return null;
                }
                if (node.type === N.NumberLiteral) return node.value;
                if (node.type === N.StringLiteral) return node.value;
                if (node.type === N.BooleanLiteral) return node.value;
                if (node.type === N.ColorLiteral) return node.value;
                if (node.type === N.NaLiteral) return NaN;
                // Handle series[N] — shift array by N positions (history access)
                if (node.type === N.IndexExpression || node.type === N.HistoryExpression) {
                    const obj = resolveSeries(node.object || node.source);
                    const rawIdx =
                        node.offset !== undefined
                            ? resolveSeries(node.offset)
                            : resolveSeries(node.index);
                    const idx = typeof rawIdx === 'number' ? rawIdx : (rawIdx?.value ?? null);
                    if (Array.isArray(obj) && typeof idx === 'number' && idx >= 0) {
                        const shifted = new Array(obj.length).fill(NaN);
                        for (let i = idx; i < obj.length; i++) shifted[i] = obj[i - idx];
                        return shifted;
                    }
                    return null;
                }
                // Handle math.max(series, 0), math.min(series, 0), -expr, etc.
                if (node.type === N.CallExpression || node.type === N.MethodCallExpression) {
                    const fn =
                        node.type === N.MethodCallExpression
                            ? (node.object?.name || node.object) + '.' + node.method
                            : this.buildCalleeName(node.callee);
                    // param.int/float/bool/string → resolve to default value (scalar)
                    if (
                        fn === 'param.int' ||
                        fn === 'param.float' ||
                        fn === 'param.bool' ||
                        fn === 'param.string' ||
                        fn === 'param'
                    ) {
                        const titleArg = node.arguments.find(
                            (a) => a.type === N.NamedArgument && a.name === 'title'
                        );
                        const key =
                            titleArg && titleArg.value.value
                                ? titleArg.value.value.toLowerCase().replace(/\s+/g, '_')
                                : '';
                        if (key && this.inputs[key] !== undefined) return this.inputs[key];
                        // Return default value (first positional arg)
                        const firstArg = node.arguments.find((a) => a.type !== N.NamedArgument);
                        if (firstArg) return resolveSeries(firstArg);
                        return null;
                    }
                    if (fn === 'math.max' || fn === 'math.min') {
                        const a = resolveSeries(node.arguments[0]);
                        const b = resolveSeries(node.arguments[1]);
                        if (Array.isArray(a) && typeof b === 'number') {
                            const op = fn === 'math.max' ? Math.max : Math.min;
                            return a.map((v) => (isNaN(v) ? NaN : op(v, b)));
                        }
                        if (typeof a === 'number' && Array.isArray(b)) {
                            const op = fn === 'math.max' ? Math.max : Math.min;
                            return b.map((v) => (isNaN(v) ? NaN : op(a, v)));
                        }
                    }
                    // Resolve time(timeframe) to a full series
                    if (fn === 'time') {
                        const tfArg = node.arguments[0];
                        if (tfArg) {
                            let tf = resolveSeries(tfArg);
                            if (Array.isArray(tf))
                                tf = tf.find((v) => typeof v === 'string') ?? null;
                            if (typeof tf === 'string') {
                                const times = this.ohlcv.time || [];
                                return times.map((_, i) => this._getHTFBarTime(tf, i));
                            }
                        }
                        // No arg: return raw time series
                        return this.ohlcv.time || [];
                    }
                    // Resolve ta.* and kuri.* calls recursively
                    let resolvedFn = fn;
                    if (fn.startsWith('kuri.')) resolvedFn = 'ta.' + fn.slice(5);
                    if (
                        resolvedFn.startsWith('ta.') &&
                        (taFunctions[resolvedFn] || allFunctions[resolvedFn])
                    ) {
                        const args = [];
                        let ok = true;
                        for (const a of node.arguments) {
                            if (a.type === N.NamedArgument) continue;
                            const r = resolveSeries(a);
                            if (r !== null) args.push(r);
                            else {
                                ok = false;
                                break;
                            }
                        }
                        if (ok) {
                            try {
                                return (taFunctions[resolvedFn] || allFunctions[resolvedFn])(args);
                            } catch {
                                return null;
                            }
                        }
                    }
                    // Resolve request.security() in precompute fast path
                    if (fn === 'request.security') {
                        const tfNode = node.arguments[1];
                        const exprNode = node.arguments[2];
                        if (!tfNode || !exprNode) return null;

                        let tf = resolveSeries(tfNode);
                        // If tf resolved to an array (e.g., from switch), extract first non-null value
                        if (Array.isArray(tf))
                            tf =
                                tf.find((v) => v !== null && v !== undefined && !Number.isNaN(v)) ??
                                null;
                        if (typeof tf !== 'string') return null;

                        // Resample OHLCV to the target timeframe
                        const resampled = this._resampleOHLCV(tf);
                        if (!resampled) return null;

                        // Save current interpreter state
                        const savedOHLCV = this.ohlcv;
                        const savedBarCount = this.barCount;
                        const savedCache = this._taCache;
                        // Keep the resample cache entry alive
                        const resampleCacheKey = `__resample_${tf}`;
                        const resampleCacheVal = savedCache[resampleCacheKey];

                        // Swap in HTF OHLCV context
                        this.ohlcv = resampled.htfOHLCV;
                        this.barCount = resampled.htfOHLCV.close.length;
                        this._taCache = {};

                        // Save OHLCV entries and replace with HTF data (keep everything else in seriesData)
                        const ohlcvKeys = new Set([
                            'open',
                            'high',
                            'low',
                            'close',
                            'volume',
                            'time',
                            'hl2',
                            'hlc3',
                            'ohlc4',
                            'hlcc4',
                            'bar_index',
                        ]);
                        // Save OHLCV entries from seriesData, replace with HTF data
                        const savedOHLCVEntries = new Map();
                        for (const k of ohlcvKeys) {
                            if (this.seriesData.has(k))
                                savedOHLCVEntries.set(k, this.seriesData.get(k));
                        }
                        // Replace OHLCV with HTF data (keep all other entries intact)
                        this.seriesData.set('open', this.ohlcv.open);
                        this.seriesData.set('high', this.ohlcv.high);
                        this.seriesData.set('low', this.ohlcv.low);
                        this.seriesData.set('close', this.ohlcv.close);
                        this.seriesData.set('volume', this.ohlcv.volume);
                        this.seriesData.set('time', this.ohlcv.time);
                        this.seriesData.set(
                            'hl2',
                            this.ohlcv.high.map((h, i) => (h + this.ohlcv.low[i]) / 2)
                        );
                        this.seriesData.set(
                            'hlc3',
                            this.ohlcv.high.map(
                                (h, i) => (h + this.ohlcv.low[i] + this.ohlcv.close[i]) / 3
                            )
                        );
                        this.seriesData.set(
                            'ohlc4',
                            this.ohlcv.open.map(
                                (o, i) =>
                                    (o +
                                        this.ohlcv.high[i] +
                                        this.ohlcv.low[i] +
                                        this.ohlcv.close[i]) /
                                    4
                            )
                        );
                        this.seriesData.set(
                            'bar_index',
                            Array.from({ length: this.barCount }, (_, i) => i)
                        );

                        let htfResult;
                        try {
                            htfResult = resolveSeries(exprNode);
                        } catch {
                            htfResult = null;
                        }

                        // Restore OHLCV entries (keep all other entries intact)
                        for (const [k, v] of savedOHLCVEntries) this.seriesData.set(k, v);
                        this.ohlcv = savedOHLCV;
                        this.barCount = savedBarCount;
                        this._taCache = savedCache;
                        if (resampleCacheVal) this._taCache[resampleCacheKey] = resampleCacheVal;

                        if (!Array.isArray(htfResult)) return null;

                        // Map HTF result back to chart bars
                        const mapped = new Array(savedBarCount).fill(NaN);
                        const { chartToHTF } = resampled;
                        for (let i = 0; i < savedBarCount; i++) {
                            const htfIdx = chartToHTF[i];
                            if (!isNaN(htfIdx) && htfIdx < htfResult.length) {
                                mapped[i] = htfResult[htfIdx];
                            }
                        }
                        return mapped;
                    }
                    // Resolve user function calls by inlining
                    if (this.userFunctions && this.userFunctions.has(fn)) {
                        const funcDef = this.userFunctions.get(fn);
                        // Build a mapping from param names → resolved arg values
                        const paramMap = new Map();
                        let paramIdx = 0;
                        for (const a of node.arguments) {
                            if (a.type === N.NamedArgument) continue;
                            if (paramIdx < funcDef.params.length) {
                                const r = resolveSeries(a);
                                if (r !== null) paramMap.set(funcDef.params[paramIdx].name, r);
                            }
                            paramIdx++;
                        }
                        // Temporarily add params to seriesData for body resolution
                        const savedEntries = new Map();
                        for (const [pName, pVal] of paramMap) {
                            if (this.seriesData.has(pName))
                                savedEntries.set(pName, this.seriesData.get(pName));
                            if (Array.isArray(pVal)) this.seriesData.set(pName, pVal);
                        }
                        try {
                            // Resolve the function body
                            const body = funcDef.body;
                            let bodyResult = null;
                            if (body.type === N.BlockStatement) {
                                for (const stmt of body.body) {
                                    if (stmt.type === N.ReturnStatement && stmt.value) {
                                        bodyResult = resolveSeries(stmt.value);
                                        break;
                                    } else if (stmt.type === N.VariableDeclaration && stmt.init) {
                                        const r = resolveSeries(stmt.init);
                                        if (r !== null && Array.isArray(r))
                                            this.seriesData.set(stmt.name, r);
                                        bodyResult = r;
                                    }
                                }
                            } else {
                                bodyResult = resolveSeries(body);
                            }
                            return bodyResult;
                        } finally {
                            // Restore seriesData
                            for (const [pName] of paramMap) {
                                if (savedEntries.has(pName))
                                    this.seriesData.set(pName, savedEntries.get(pName));
                                else this.seriesData.delete(pName);
                            }
                        }
                    }
                    return null;
                }
                // Handle unary minus: -expr
                if (node.type === N.UnaryExpression && node.operator === '-') {
                    const inner = resolveSeries(node.argument);
                    if (Array.isArray(inner)) return inner.map((v) => (isNaN(v) ? NaN : -v));
                    if (typeof inner === 'number') return -inner;
                    return null;
                }
                // Handle switch expression — resolve matching case or default
                if (node.type === N.SwitchStatement) {
                    let switchVal = resolveSeries(node.expression);
                    // If switchVal is an array (series), extract first element for matching
                    if (Array.isArray(switchVal))
                        switchVal = switchVal.find((v) => v !== null && v !== undefined) ?? null;
                    if (switchVal !== null && node.cases) {
                        // Find matching case
                        for (const c of node.cases) {
                            if (c.test) {
                                let testVal = resolveSeries(c.test);
                                if (Array.isArray(testVal)) testVal = testVal[0];
                                if (testVal === switchVal) {
                                    return resolveSeries(c.body);
                                }
                            }
                        }
                        // Default case (no test)
                        const defaultCase = node.cases.find((c) => !c.test);
                        if (defaultCase) return resolveSeries(defaultCase.body);
                    }
                    return null;
                }
                // Handle ternary: cond ? a : b — element-wise on arrays
                if (node.type === N.TernaryExpression || node.type === N.ConditionalExpression) {
                    const cond = resolveSeries(node.condition || node.test);
                    const consequent = resolveSeries(node.consequent);
                    const alternate = resolveSeries(node.alternate);
                    // If condition is an array, do element-wise selection
                    if (Array.isArray(cond)) {
                        // If both branches resolved, do full element-wise selection
                        if (consequent !== null && alternate !== null) {
                            return cond.map((c, i) => {
                                const cv = Array.isArray(consequent) ? consequent[i] : consequent;
                                const av = Array.isArray(alternate) ? alternate[i] : alternate;
                                const isNaVal = (v) =>
                                    v === null ||
                                    v === undefined ||
                                    (typeof v === 'number' && Number.isNaN(v));
                                return c ? (isNaVal(cv) ? NaN : cv) : isNaVal(av) ? NaN : av;
                            });
                        }
                        // If condition is uniform (all same value), pick the resolved branch
                        const allTrue = cond.every((c) => !!c);
                        const allFalse = cond.every((c) => !c);
                        if (allTrue && consequent !== null) return consequent;
                        if (allFalse && alternate !== null) return alternate;
                        // Mixed condition with one null branch — return what we can
                        if (consequent !== null && alternate === null) return consequent;
                        if (alternate !== null && consequent === null) return alternate;
                    }
                    // Scalar condition
                    if (cond !== null && typeof cond !== 'object') {
                        return cond ? consequent : alternate;
                    }
                    // Can't resolve — return whichever branch resolved
                    if (consequent !== null) return consequent;
                    return alternate;
                }
                // Handle comparison: a == b, a > b, etc. — element-wise
                if (
                    node.type === N.BinaryExpression &&
                    ['==', '!=', '>', '<', '>=', '<='].includes(node.operator)
                ) {
                    const left = resolveSeries(node.left);
                    const right = resolveSeries(node.right);
                    if (left === null || right === null) return null;
                    const cmpOp = (l, r) => {
                        switch (node.operator) {
                            case '==':
                                return l === r;
                            case '!=':
                                return l !== r;
                            case '>':
                                return l > r;
                            case '<':
                                return l < r;
                            case '>=':
                                return l >= r;
                            case '<=':
                                return l <= r;
                            default:
                                return false;
                        }
                    };
                    // Array vs scalar (number or string)
                    if (Array.isArray(left) && !Array.isArray(right))
                        return left.map((l) => cmpOp(l, right));
                    if (!Array.isArray(left) && Array.isArray(right))
                        return right.map((r) => cmpOp(left, r));
                    // Array vs Array
                    if (Array.isArray(left) && Array.isArray(right))
                        return left.map((l, i) => cmpOp(l, right[i]));
                    // Scalar vs scalar (number, string, boolean)
                    if (left !== null && right !== null) return cmpOp(left, right);
                    return null;
                }
                // Handle binary: a - b, a + b, a * b, a / b
                if (node.type === N.BinaryExpression) {
                    const left = resolveSeries(node.left);
                    const right = resolveSeries(node.right);
                    if (left === null || right === null) return null;
                    const applyOp = (l, r) => {
                        if (isNaN(l) || isNaN(r)) return NaN;
                        switch (node.operator) {
                            case '+':
                                return l + r;
                            case '-':
                                return l - r;
                            case '*':
                                return l * r;
                            case '/':
                                return r !== 0 ? l / r : NaN;
                            default:
                                return NaN;
                        }
                    };
                    if (Array.isArray(left) && Array.isArray(right))
                        return left.map((l, i) => applyOp(nz(l), nz(right[i])));
                    if (Array.isArray(left) && typeof right === 'number')
                        return left.map((l) => applyOp(nz(l), right));
                    if (typeof left === 'number' && Array.isArray(right))
                        return right.map((r) => applyOp(left, nz(r)));
                    if (typeof left === 'number' && typeof right === 'number')
                        return applyOp(left, right);
                    return null;
                }
                return null;
            };

            // Pass 0: Resolve input.source() declarations to OHLCV series
            const ohlcvNames = {
                close: true,
                open: true,
                high: true,
                low: true,
                volume: true,
                hl2: true,
                hlc3: true,
                ohlc4: true,
                hlcc4: true,
            };
            for (const node of ast.body) {
                if (
                    node.type === N.VariableDeclaration &&
                    node.init &&
                    (node.init.type === N.CallExpression ||
                        node.init.type === N.MethodCallExpression)
                ) {
                    const fn =
                        node.init.type === N.MethodCallExpression
                            ? (node.init.object?.name || node.init.object) + '.' + node.init.method
                            : this.buildCalleeName(node.init.callee);
                    if (fn === 'param.source' || fn === 'param') {
                        // Check if first arg is an OHLCV identifier
                        const firstArg = node.init.arguments[0];
                        if (
                            firstArg &&
                            firstArg.type === N.Identifier &&
                            ohlcvNames[firstArg.name]
                        ) {
                            // Check if there's an override for this input
                            const title = node.init.arguments.find(
                                (a) => a.type === N.NamedArgument && a.name === 'title'
                            );
                            const key = title
                                ? title.value.value.toLowerCase().replace(/\s+/g, '_')
                                : '';
                            const overrideVal = key ? this.inputs[key] : undefined;
                            // Use override source name if provided, otherwise use default
                            const srcName = (
                                typeof overrideVal === 'string' ? overrideVal : firstArg.name
                            ).toLowerCase();
                            if (this.seriesData.has(srcName)) {
                                this.seriesData.set(node.name, this.seriesData.get(srcName));
                            }
                        }
                    }
                }
            }

            // Multi-pass: resolve TA calls and expressions, chaining results
            const MAX_PASSES = 5;
            for (let pass = 0; pass < MAX_PASSES; pass++) {
                let progress = false;
                for (const node of ast.body) {
                    if (node.type !== N.VariableDeclaration || !node.init) continue;
                    // Skip already-resolved variables
                    const _hasValue = (v) =>
                        v !== null &&
                        v !== undefined &&
                        (typeof v !== 'number' || !Number.isNaN(v));
                    if (this.seriesData.has(node.name)) {
                        const existing = this.seriesData.get(node.name);
                        if (Array.isArray(existing) && existing.some(_hasValue)) continue;
                    }

                    const result = resolveSeries(node.init);
                    if (result !== null) {
                        if (Array.isArray(result)) {
                            if (result.some(_hasValue)) {
                                this.seriesData.set(node.name, result);
                                progress = true;
                            }
                        } else if (
                            typeof result === 'string' ||
                            typeof result === 'number' ||
                            typeof result === 'boolean'
                        ) {
                            // Scalar value (from switch, ternary, literal) — broadcast to array
                            this.seriesData.set(node.name, new Array(this.barCount).fill(result));
                            progress = true;
                        }
                    }
                }
                if (!progress) break;
            }
        }

        // ---- Node Execution ----
        execNode(node, env, bar) {
            switch (node.type) {
                case N.VariableDeclaration:
                    return this.execVarDecl(node, env, bar);
                case N.ReassignmentExpression:
                    return this.execReassign(node, env, bar);
                case N.CompoundAssignment:
                    return this.execCompound(node, env, bar);
                case N.IfStatement:
                    return this.execIf(node, env, bar);
                case N.ForStatement:
                    return this.execFor(node, env, bar);
                case N.ForInStatement:
                    return this.execForIn(node, env, bar);
                case N.WhileStatement:
                    return this.execWhile(node, env, bar);
                case N.SwitchStatement:
                    return this.execSwitch(node, env, bar);
                case N.BreakStatement:
                    throw new BreakSignal();
                case N.ContinueStatement:
                    throw new ContinueSignal();
                case N.ReturnStatement:
                    throw new ReturnSignal(node.value ? this.eval(node.value, env, bar) : null);
                case N.PlotStatement:
                    return this.execPlot(node, env, bar);
                case N.HlineStatement:
                    return this.execHline(node, env, bar);
                case N.BgColorStatement:
                    return this.execBgColor(node, env, bar);
                case N.FillStatement:
                    return this.execFill(node, env, bar);
                case N.AlertStatement:
                    return this.execAlert(node, env, bar);
                case N.InputDeclaration:
                    return this.execInput(node, env, bar);
                case N.BlockStatement: {
                    let lv = null;
                    for (const s of node.body) lv = this.execNode(s, env, bar);
                    return lv;
                }
                case N.FunctionDeclaration:
                    return; // Already collected in pass 1
                case N.MultiAssignment:
                    return this.execMultiAssign(node, env, bar);
                default:
                    return this.eval(node, env, bar);
            }
        }

        execVarDecl(node, env, bar) {
            const val = this.eval(node.init, env, bar);
            if (node.persistent) {
                if (bar === 0) this.persistentVars.set(node.name, val);
                env.set(node.name, this.persistentVars.get(node.name));
            } else {
                env.set(node.name, val);
            }
            if (node.name && !this.seriesData.has(node.name))
                this.seriesData.set(node.name, new Array(this.barCount).fill(NaN));
            if (node.name && this.seriesData.has(node.name))
                this.seriesData.get(node.name)[bar] = env.get(node.name);
            return env.get(node.name);
        }

        execReassign(node, env, bar) {
            const val = this.eval(node.value, env, bar);
            if (node.name) {
                if (!env.update(node.name, val)) env.set(node.name, val);
                if (this.persistentVars.has(node.name)) this.persistentVars.set(node.name, val);
                if (this.seriesData.has(node.name)) this.seriesData.get(node.name)[bar] = val;
            }
            return val;
        }

        execCompound(node, env, bar) {
            const cur = env.get(node.name),
                op = this.eval(node.value, env, bar);
            let r;
            switch (node.operator) {
                case '+':
                    r = cur + op;
                    break;
                case '-':
                    r = cur - op;
                    break;
                case '*':
                    r = cur * op;
                    break;
                case '/':
                    r = op ? cur / op : NaN;
                    break;
                default:
                    r = NaN;
            }
            env.update(node.name, r) || env.set(node.name, r);
            if (this.persistentVars.has(node.name)) this.persistentVars.set(node.name, r);
            if (this.seriesData.has(node.name)) this.seriesData.get(node.name)[bar] = r;
            return r;
        }

        execMultiAssign(node, env, bar) {
            const val = this.eval(node.init, env, bar);
            const arr = Array.isArray(val)
                ? val
                : val && typeof val === 'object'
                  ? Object.values(val)
                  : [val];
            for (let i = 0; i < node.names.length; i++) {
                const name = node.names[i];
                const v = i < arr.length ? arr[i] : NaN;
                if (node.reassign) {
                    if (!env.update(name, v)) env.set(name, v);
                } else {
                    env.set(name, v);
                }
                if (this.persistentVars.has(name)) this.persistentVars.set(name, v);
                if (!this.seriesData.has(name))
                    this.seriesData.set(name, new Array(this.barCount).fill(NaN));
                this.seriesData.get(name)[bar] = v;
            }
            return arr;
        }

        execIf(node, env, bar) {
            if (this.truthy(this.eval(node.condition, env, bar)))
                return this.execNode(node.consequent, env, bar);
            if (node.alternate) return this.execNode(node.alternate, env, bar);
            return null;
        }

        execFor(node, env, bar) {
            const start = this.eval(node.start, env, bar),
                end = this.eval(node.end, env, bar);
            const step = node.step ? this.eval(node.step, env, bar) : 1;
            let lv = null;
            const le = new Environment(env);
            for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
                le.set(node.variable, i);
                try {
                    lv = this.execNode(node.body, le, bar);
                } catch (e) {
                    if (e instanceof BreakSignal) break;
                    if (e instanceof ContinueSignal) continue;
                    throw e;
                }
            }
            return lv;
        }

        execForIn(node, env, bar) {
            const collection = this.eval(node.collection, env, bar);
            let items = [];
            if (Array.isArray(collection)) {
                items = collection;
            } else if (collection instanceof KuriMap) {
                items = collection.keys();
            } else {
                return null;
            }
            let lv = null;
            const le = new Environment(env);
            for (let i = 0; i < items.length; i++) {
                le.set(node.variable, items[i]);
                try {
                    lv = this.execNode(node.body, le, bar);
                } catch (e) {
                    if (e instanceof BreakSignal) break;
                    if (e instanceof ContinueSignal) continue;
                    throw e;
                }
            }
            return lv;
        }

        execWhile(node, env, bar) {
            let lv = null,
                safe = 0;
            while (this.truthy(this.eval(node.condition, env, bar))) {
                if (safe++ > 100000) throw new Error(`Runtime Error L${node.line}: Infinite loop`);
                try {
                    lv = this.execNode(node.body, env, bar);
                } catch (e) {
                    if (e instanceof BreakSignal) break;
                    if (e instanceof ContinueSignal) continue;
                    throw e;
                }
            }
            return lv;
        }

        execSwitch(node, env, bar) {
            const switchVal = node.expression ? this.eval(node.expression, env, bar) : null;
            for (const c of node.cases) {
                if (c.isDefault) {
                    return this.evalSwitchBody(c.body, env, bar);
                }
                const caseVal = this.eval(c.condition, env, bar);
                if (switchVal !== null) {
                    // Value-matching switch
                    if (
                        caseVal === switchVal ||
                        (typeof caseVal === 'string' &&
                            typeof switchVal === 'string' &&
                            caseVal === switchVal)
                    ) {
                        return this.evalSwitchBody(c.body, env, bar);
                    }
                } else {
                    // Condition switch (each case is a boolean)
                    if (this.truthy(caseVal)) {
                        return this.evalSwitchBody(c.body, env, bar);
                    }
                }
            }
            return null;
        }

        evalSwitchBody(body, env, bar) {
            if (body && body.type === N.BlockStatement) return this.execNode(body, env, bar);
            return this.eval(body, env, bar);
        }

        execPlot(node, env, bar) {
            const args = this.evalArgs(node.arguments, env, bar);
            const id = `plot_${this.plotIdCounter}`;
            this.plotIdCounter++; // Always increment so next plot() gets a different ID
            let entry = this.plots.find((p) => p.id === id);
            const isShape = node.kind === 'plotshape' || node.kind === 'plotchar';
            if (!entry) {
                entry = {
                    id,
                    kind: node.kind,
                    title: args.named.title || `Plot ${this.plots.length + 1}`,
                    color: args.named.color || '#2196F3',
                    colors: new Array(this.barCount).fill(null),
                    linewidth: args.named.linewidth || 1,
                    linewidths: new Array(this.barCount).fill(null),
                    style: args.named.style || (isShape ? 'circle' : 'line'),
                    overlay: this.indicator?.overlay ?? true,
                    data: new Array(this.barCount).fill(NaN),
                    display: args.named.display,
                };
                // Store plotshape/plotchar-specific fields
                if (isShape) {
                    entry.location = args.named.location || 'abovebar';
                    entry.size = args.named.size || 'small';
                    entry.text = args.named.text || '';
                    entry.textcolor = args.named.textcolor || args.named.color || '#2196F3';
                    entry.texts = new Array(this.barCount).fill(null);
                }
                this.plots.push(entry);
            }
            entry.data[bar] = args.positional[0] ?? NaN;
            if (args.named.color) {
                entry.color = args.named.color;
                entry.colors[bar] = args.named.color;
            }
            if (args.named.title) entry.title = args.named.title;
            if (args.named.linewidth) {
                entry.linewidth = args.named.linewidth;
                entry.linewidths[bar] = args.named.linewidth;
            }
            // Update per-bar text for plotshape (text may change per bar)
            if (isShape && entry.texts) {
                entry.texts[bar] = args.named.text || entry.text || null;
            }
            return entry;
        }

        execHline(node, env, bar) {
            if (bar > 0) return;
            const a = this.evalArgs(node.arguments, env, bar);
            this.hlines.push({
                price: a.positional[0],
                title: a.named.title || '',
                color: a.named.color || '#808080',
                linestyle: a.named.linestyle || 'dashed',
                linewidth: a.named.linewidth || 1,
                editable: a.named.editable !== false,
            });
        }

        execBgColor(node, env, bar) {
            const a = this.evalArgs(node.arguments, env, bar);
            if (
                !this.bgcolors.length ||
                this.bgcolors[this.bgcolors.length - 1].data.length < this.barCount
            )
                this.bgcolors.push({ data: new Array(this.barCount).fill(null) });
            this.bgcolors[this.bgcolors.length - 1].data[bar] = a.positional[0] || null;
        }

        execFill(node, env, bar) {
            if (bar > 0) return;
            const a = this.evalArgs(node.arguments, env, bar);
            this.fills.push({
                plot1: a.positional[0],
                plot2: a.positional[1],
                color: a.named.color || 'rgba(33,150,243,0.1)',
            });
        }
        execAlert(node, env, bar) {
            const a = this.evalArgs(node.arguments, env, bar);
            if (node.kind === 'alertcondition') {
                // Register alert on last bar if condition is true
                if (bar === this.barCount - 1 && this.truthy(a.positional[0])) {
                    this.alerts.push({
                        condition: true,
                        title: a.named.title || '',
                        message: a.named.message || a.positional[1] || 'Alert',
                        bar,
                    });
                }
            }
        }

        execInput(node, env, bar) {
            const a = this.evalArgs(node.arguments, env, bar);
            const defval = a.positional[0] ?? a.named.defval;
            const title = a.named.title || `Input`;
            const key = title.toLowerCase().replace(/\s+/g, '_');
            // Record input definition
            if (bar === 0) {
                this.inputDefs.push({
                    key,
                    title,
                    defval,
                    type: a.named.type || typeof defval,
                    options: a.named.options || null,
                    tooltip: a.named.tooltip || '',
                });
            }
            return this.inputs[key] !== undefined ? this.inputs[key] : defval;
        }

        // ---- Expression Evaluation ----
        eval(node, env, bar) {
            if (!node) return null;
            switch (node.type) {
                case N.NumberLiteral:
                    return node.value;
                case N.StringLiteral:
                    return node.value;
                case N.BooleanLiteral:
                    return node.value;
                case N.NaLiteral:
                    return NaN;
                case N.ColorLiteral:
                    return node.value;

                case N.ArrayLiteral:
                    return node.elements.map((e) => this.eval(e, env, bar));

                case N.Identifier:
                    return this.resolveId(node, env, bar);

                case N.BinaryExpression: {
                    const l = this.eval(node.left, env, bar),
                        r = this.eval(node.right, env, bar);
                    switch (node.operator) {
                        case '+':
                            return typeof l === 'string' || typeof r === 'string'
                                ? String(l) + String(r)
                                : l + r;
                        case '-':
                            return l - r;
                        case '*':
                            return l * r;
                        case '/':
                            return r ? l / r : NaN;
                        case '%':
                            return r ? l % r : NaN;
                        case '==':
                            return l === r || (Number.isNaN(l) && Number.isNaN(r));
                        case '!=':
                            return l !== r && !(Number.isNaN(l) && Number.isNaN(r));
                        case '>':
                            return l > r;
                        case '>=':
                            return l >= r;
                        case '<':
                            return l < r;
                        case '<=':
                            return l <= r;
                        case 'and':
                            return this.truthy(l) && this.truthy(r);
                        case 'or':
                            return this.truthy(l) || this.truthy(r);
                        default:
                            return NaN;
                    }
                }

                case N.UnaryExpression: {
                    const o = this.eval(node.operand, env, bar);
                    return node.operator === '-' ? -o : !this.truthy(o);
                }

                case N.TernaryExpression:
                    return this.truthy(this.eval(node.condition, env, bar))
                        ? this.eval(node.consequent, env, bar)
                        : this.eval(node.alternate, env, bar);

                case N.CallExpression:
                    return this.evalCall(node, env, bar);

                case N.MethodCallExpression:
                    return this.evalMethodCall(node, env, bar);

                case N.MemberExpression:
                    return this.evalMember(node, env, bar);

                case N.HistoryExpression: {
                    const off = this.eval(node.offset, env, bar),
                        tb = bar - Math.round(off);
                    if (tb < 0 || tb >= this.barCount) return NaN;
                    
                    if (node.source.type === N.Identifier) {
                        const id = node.source.name;
                        if (id === 'open') return (this.ohlcv.open || [])[tb] ?? NaN;
                        if (id === 'high') return (this.ohlcv.high || [])[tb] ?? NaN;
                        if (id === 'low') return (this.ohlcv.low || [])[tb] ?? NaN;
                        if (id === 'close') return (this.ohlcv.close || [])[tb] ?? NaN;
                        if (id === 'volume') return (this.ohlcv.volume || [])[tb] ?? NaN;
                        if (id === 'time') return (this.ohlcv.time || [])[tb] ?? NaN;
                        
                        if (this.seriesData.has(id)) return this.seriesData.get(id)[tb] ?? NaN;
                        
                        if (env.has(id)) {
                            let v = env.get(id);
                            if (Array.isArray(v)) return v[tb] ?? NaN;
                        }
                    }
                    
                    const histVal = this.eval(node.source, env, tb);
                    if (histVal !== undefined) return histVal;
                    return NaN;
                }

                case N.IfStatement:
                    return this.execIf(node, env, bar);
                case N.SwitchStatement:
                    return this.execSwitch(node, env, bar);
                case N.NamedArgument:
                    return this.eval(node.value, env, bar);
                case N.InputDeclaration:
                    return this.execInput(node, env, bar);
                case N.BlockStatement: {
                    let lv = null;
                    for (const s of node.body) lv = this.execNode(s, env, bar);
                    return lv;
                }

                default:
                    throw new Error(`Runtime Error L${node.line}: Cannot eval ${node.type}`);
            }
        }

        resolveId(node, env, bar) {
            const name = node.name;
            const v = env.get(name);
            if (v !== undefined) return v;
            if (this.seriesData.has(name)) return this.seriesData.get(name)[bar];
            // Check runtime constants
            const rc = runtimeConstants[name];
            if (rc !== undefined && rc !== null) return rc;
            // barstate.xxx
            const bstate = env.get('barstate');
            if (name === 'barstate' && bstate) return bstate;
            // color constants
            if (colorConstants['color.' + name]) return colorConstants['color.' + name];
            return NaN;
        }

        evalMember(node, env, bar) {
            const objName = this.buildCalleeName(node.object);
            const prop = node.property;
            const fullName = `${objName}.${prop}`;

            // barstate.isfirst, etc. — check env FIRST (set per-bar), before static constants
            if (objName === 'barstate') {
                const bs = env.get('barstate');
                if (bs && prop in bs) return bs[prop];
            }

            // syminfo.mintick etc — resolve from constants
            const rc = runtimeConstants[fullName];
            if (rc !== undefined) return rc;

            // color.green, color.teal, etc. — resolve from color constants
            const cc = colorConstants[fullName];
            if (cc !== undefined) return cc;

            // Object property access (for drawing objects, etc.)
            const objVal = this.eval(node.object, env, bar);
            if (objVal && typeof objVal === 'object' && prop in objVal) return objVal[prop];
            if (objVal && typeof objVal === 'object' && typeof objVal['get_' + prop] === 'function')
                return objVal['get_' + prop]();

            // Series member (e.g., macdResult.macdLine)
            if (this.seriesData.has(fullName)) return this.seriesData.get(fullName)[bar];

            return { __namespace: fullName };
        }

        evalCall(node, env, bar) {
            const fn = this.buildCalleeName(node.callee);
            const args = this.evalArgs(node.arguments, env, bar);

            // Input calls — Pine Script compatibility: route input.*() to handleInputCall
            if (fn === 'input' || fn.startsWith('input.')) {
                return this.handleInputCall(fn, args, env, bar);
            }

            // param.* — Kuri v2 syntax
            if (fn === 'param' || fn.startsWith('param.')) {
                return this.handleInputCall(fn.replace('param', 'input'), args, env, bar);
            }

            // Time function special handling
            if (fn === 'time') {
                const tf = args.positional[0];
                if (tf && typeof tf === 'string') {
                    return this._getHTFBarTime(tf, bar);
                }
                return (this.ohlcv.time || [])[bar] || NaN;
            }

            if (fn === 'timeframe.in_seconds') {
                return allFunctions[fn](args.positional);
            }

            // request.security() — Pine Script multi-timeframe data (flat call style)
            if (fn === 'request.security') {
                return this.evalRequestSecurity(node, args, env, bar);
            }

            // TA functions — Pine Script compatibility: route ta.*() to callTA
            if (fn.startsWith('ta.') && (taFunctions[fn] || allFunctions[fn])) {
                return this.callTA(fn, args, node, env, bar);
            }

            // All other built-in functions
            if (allFunctions[fn]) {
                // Drawing functions get named args passed through
                if (fn.startsWith('line.') || fn.startsWith('label.') || fn.startsWith('box.')) {
                    args.positional.named = args.named;
                    const result = allFunctions[fn](args.positional);
                    // Track created drawings and enforce limits
                    if (result instanceof DrawingLine) {
                        this.drawings.lines.push(result);
                        const maxLines = (this.indicator && this.indicator.max_lines_count) || 500;
                        while (this.drawings.lines.length > maxLines) this.drawings.lines.shift();
                    }
                    if (result instanceof DrawingLabel) {
                        this.drawings.labels.push(result);
                        const maxLabels =
                            (this.indicator && this.indicator.max_labels_count) || 500;
                        while (this.drawings.labels.length > maxLabels)
                            this.drawings.labels.shift();
                    }
                    if (result instanceof DrawingBox) {
                        this.drawings.boxes.push(result);
                        const maxBoxes = (this.indicator && this.indicator.max_boxes_count) || 500;
                        while (this.drawings.boxes.length > maxBoxes) this.drawings.boxes.shift();
                    }
                    return result;
                }
                return allFunctions[fn](args.positional);
            }

            // User-defined functions
            if (this.userFunctions.has(fn)) {
                return this.callUserFunction(fn, args, env, bar, node);
            }

            // Check if it's a method on an object (e.g., called via dot syntax but parsed as CallExpression)
            throw new Error(`Runtime Error L${node.line}: Unknown function: ${fn}`);
        }

        evalMethodCall(node, env, bar) {
            const objName = this.buildCalleeName(node.object);
            const method = node.method;
            const fullFn = objName + '.' + method;
            const args = this.evalArgs(node.arguments, env, bar);

            // Input method calls — Pine Script compatibility: route to handleInputCall
            if (objName === 'input') {
                return this.handleInputCall('input.' + method, args, env, bar);
            }

            // param.* → input.* alias (Kuri v2 syntax)
            if (objName === 'param') {
                return this.handleInputCall('input.' + method, args, env, bar);
            }

            // TA method calls — Pine Script compatibility: route ta.*() to callTA
            if (objName === 'ta' && (taFunctions[fullFn] || allFunctions[fullFn])) {
                return this.callTA(fullFn, args, node, env, bar);
            }

            // request.security() — Pine Script multi-timeframe data
            if (objName === 'request' && method === 'security') {
                return this.evalRequestSecurity(node, args, env, bar);
            }

            // kuri.* → ta.* alias (Kuri v2 syntax)
            if (objName === 'kuri') {
                const taFn = 'ta.' + method;
                if (taFunctions[taFn]) {
                    return this.callTA(taFn, args, node, env, bar);
                }
                if (allFunctions[taFn]) {
                    const cacheKey = `__ta_${taFn}_L${node.line || 0}`;
                    if (!this._taCache[cacheKey]) {
                        const resolvedArgs = [];
                        let posIdx = 0;
                        const ohlcvMap = {
                            close: this.ohlcv.close,
                            open: this.ohlcv.open,
                            high: this.ohlcv.high,
                            low: this.ohlcv.low,
                            volume: this.ohlcv.volume,
                        };
                        for (let ai = 0; ai < node.arguments.length; ai++) {
                            const argNode = node.arguments[ai];
                            if (argNode.type === N.NamedArgument) continue;
                            if (argNode.type === N.Identifier) {
                                if (ohlcvMap[argNode.name]) {
                                    resolvedArgs.push(ohlcvMap[argNode.name]);
                                } else if (argNode.name === 'hl2') {
                                    resolvedArgs.push(
                                        this.ohlcv.high.map((h, i) => (h + this.ohlcv.low[i]) / 2)
                                    );
                                } else if (argNode.name === 'hlc3') {
                                    resolvedArgs.push(
                                        this.ohlcv.high.map(
                                            (h, i) =>
                                                (h + this.ohlcv.low[i] + this.ohlcv.close[i]) / 3
                                        )
                                    );
                                } else if (argNode.name === 'ohlc4') {
                                    resolvedArgs.push(
                                        this.ohlcv.open.map(
                                            (o, i) =>
                                                (o +
                                                    this.ohlcv.high[i] +
                                                    this.ohlcv.low[i] +
                                                    this.ohlcv.close[i]) /
                                                4
                                        )
                                    );
                                } else if (argNode.name === 'hlcc4') {
                                    resolvedArgs.push(
                                        this.ohlcv.high.map(
                                            (h, i) =>
                                                (h + this.ohlcv.low[i] + this.ohlcv.close[i] * 2) /
                                                4
                                        )
                                    );
                                } else {
                                    const envVal = env ? env.get(argNode.name) : undefined;
                                    let matched = false;
                                    if (typeof envVal === 'number') {
                                        for (const [, arr] of Object.entries(ohlcvMap)) {
                                            if (arr[bar] === envVal) {
                                                resolvedArgs.push(arr);
                                                matched = true;
                                                break;
                                            }
                                        }
                                        if (!matched) {
                                            const hl2 =
                                                (this.ohlcv.high[bar] + this.ohlcv.low[bar]) / 2;
                                            const hlc3 =
                                                (this.ohlcv.high[bar] +
                                                    this.ohlcv.low[bar] +
                                                    this.ohlcv.close[bar]) /
                                                3;
                                            if (envVal === hl2) {
                                                resolvedArgs.push(
                                                    this.ohlcv.high.map(
                                                        (h, i) => (h + this.ohlcv.low[i]) / 2
                                                    )
                                                );
                                                matched = true;
                                            } else if (envVal === hlc3) {
                                                resolvedArgs.push(
                                                    this.ohlcv.high.map(
                                                        (h, i) =>
                                                            (h +
                                                                this.ohlcv.low[i] +
                                                                this.ohlcv.close[i]) /
                                                            3
                                                    )
                                                );
                                                matched = true;
                                            }
                                        }
                                    }
                                    if (!matched) {
                                        resolvedArgs.push(
                                            this.seriesData.has(argNode.name)
                                                ? this.seriesData.get(argNode.name)
                                                : (args.positional[posIdx] ?? NaN)
                                        );
                                    }
                                }
                            } else if (argNode.type === N.NumberLiteral) {
                                resolvedArgs.push(argNode.value);
                            } else {
                                resolvedArgs.push(args.positional[posIdx]);
                            }
                            posIdx++;
                        }
                        try {
                            this._taCache[cacheKey] = allFunctions[taFn](resolvedArgs);
                        } catch {
                            this._taCache[cacheKey] = NaN;
                        }
                    }
                    const cached = this._taCache[cacheKey];
                    return Array.isArray(cached) ? (cached[bar] ?? NaN) : (cached ?? NaN);
                }
                // kuri.alert() → alertcondition
                if (method === 'alert') {
                    return this.execAlert(
                        {
                            type: N.AlertStatement,
                            kind: 'alertcondition',
                            arguments: node.arguments,
                            line: node.line,
                        },
                        env,
                        bar
                    );
                }
                // kuri.smartalert() — stub for now
                if (method === 'smartalert') {
                    return this.execAlert(
                        {
                            type: N.AlertStatement,
                            kind: 'alertcondition',
                            arguments: node.arguments,
                            line: node.line,
                        },
                        env,
                        bar
                    );
                }
            }

            // Drawing static methods: line.new(), line.delete(), label.new(), etc.
            if (allFunctions[fullFn]) {
                args.positional.named = args.named;
                const result = allFunctions[fullFn](args.positional);
                // Track created drawings and enforce limits
                if (result instanceof DrawingLine) {
                    this.drawings.lines.push(result);
                    const maxLines = (this.indicator && this.indicator.max_lines_count) || 500;
                    while (this.drawings.lines.length > maxLines) this.drawings.lines.shift();
                }
                if (result instanceof DrawingLabel) {
                    this.drawings.labels.push(result);
                    const maxLabels = (this.indicator && this.indicator.max_labels_count) || 500;
                    while (this.drawings.labels.length > maxLabels) this.drawings.labels.shift();
                }
                if (result instanceof DrawingBox) {
                    this.drawings.boxes.push(result);
                    const maxBoxes = (this.indicator && this.indicator.max_boxes_count) || 500;
                    while (this.drawings.boxes.length > maxBoxes) this.drawings.boxes.shift();
                }
                return result;
            }

            // Instance method calls on drawing objects: myLine.get_y2(), myLabel.set_text(), etc.
            const obj = this.eval(node.object, env, bar);
            if (obj && typeof obj === 'object') {
                if (typeof obj[method] === 'function') return obj[method](...args.positional);
                if (typeof obj['set_' + method] === 'function')
                    return obj['set_' + method](...args.positional);
                if (typeof obj['get_' + method] === 'function') return obj['get_' + method]();
            }

            // Namespace lookup
            if (obj && obj.__namespace) {
                const nsFn = obj.__namespace + '.' + method;
                if (allFunctions[nsFn]) {
                    args.positional.named = args.named;
                    return allFunctions[nsFn](args.positional);
                }
            }

            throw new Error(`Runtime Error L${node.line}: Unknown method: ${fullFn}`);
        }

        callTA(fn, args, node, env, bar) {
            // Cache: same TA call on same line always produces same result
            const cacheKey = `__callTA_${fn}_L${node.line || 0}`;
            if (this._taCache[cacheKey]) {
                const cached = this._taCache[cacheKey];
                if (Array.isArray(cached) && cached.length > 0 && Array.isArray(cached[0])) {
                    return cached.map((s) => (Array.isArray(s) ? (s[bar] ?? NaN) : s));
                }
                if (Array.isArray(cached)) return cached[bar] ?? NaN;
                return cached;
            }

            // Resolve arguments: prefer OHLCV, then seriesData, then rebuild
            const resolvedArgs = [];
            let posIdx = 0;
            const ohlcvMap = {
                close: this.ohlcv.close,
                open: this.ohlcv.open,
                high: this.ohlcv.high,
                low: this.ohlcv.low,
                volume: this.ohlcv.volume,
            };
            for (let i = 0; i < node.arguments.length; i++) {
                const argNode = node.arguments[i];
                if (argNode.type === N.NamedArgument) continue;

                if (argNode.type === N.Identifier && ohlcvMap[argNode.name]) {
                    // Direct OHLCV identifier — always use the complete array
                    resolvedArgs.push(ohlcvMap[argNode.name]);
                } else if (argNode.type === N.Identifier && this.seriesData.has(argNode.name)) {
                    const sd = this.seriesData.get(argNode.name);
                    // Use seriesData only if the series has data beyond the current bar
                    // (meaning it was precomputed, not being accumulated bar-by-bar)
                    const isFilled =
                        Array.isArray(sd) && bar + 1 < sd.length && !isNaN(sd[bar + 1]);
                    if (isFilled) {
                        resolvedArgs.push(sd);
                    } else {
                        // Partially filled — try OHLCV value match for the scalar
                        const scalarVal = args.positional[posIdx];
                        let ohlcvMatched = false;
                        if (typeof scalarVal === 'number') {
                            for (const [, arr] of Object.entries(ohlcvMap)) {
                                if (arr[bar] === scalarVal) {
                                    resolvedArgs.push(arr);
                                    ohlcvMatched = true;
                                    break;
                                }
                            }
                        }
                        if (!ohlcvMatched) resolvedArgs.push(sd);
                    }
                } else if (
                    argNode.type === N.Identifier &&
                    (argNode.name === 'hl2' ||
                        argNode.name === 'hlc3' ||
                        argNode.name === 'ohlc4' ||
                        argNode.name === 'hlcc4')
                ) {
                    // Computed OHLCV series
                    if (argNode.name === 'hl2')
                        resolvedArgs.push(
                            this.ohlcv.high.map((h, idx) => (h + this.ohlcv.low[idx]) / 2)
                        );
                    else if (argNode.name === 'hlc3')
                        resolvedArgs.push(
                            this.ohlcv.high.map(
                                (h, idx) => (h + this.ohlcv.low[idx] + this.ohlcv.close[idx]) / 3
                            )
                        );
                    else if (argNode.name === 'hlcc4')
                        resolvedArgs.push(
                            this.ohlcv.high.map(
                                (h, idx) =>
                                    (h + this.ohlcv.low[idx] + this.ohlcv.close[idx] * 2) / 4
                            )
                        );
                    else
                        resolvedArgs.push(
                            this.ohlcv.open.map(
                                (o, idx) =>
                                    (o +
                                        this.ohlcv.high[idx] +
                                        this.ohlcv.low[idx] +
                                        this.ohlcv.close[idx]) /
                                    4
                            )
                        );
                } else if (argNode.type === N.NumberLiteral) {
                    resolvedArgs.push(argNode.value);
                } else {
                    // Try to match scalar value to an OHLCV series
                    const scalarVal = args.positional[posIdx];
                    let matched = false;
                    if (typeof scalarVal === 'number') {
                        for (const [, arr] of Object.entries(ohlcvMap)) {
                            if (arr[bar] === scalarVal) {
                                resolvedArgs.push(arr);
                                matched = true;
                                break;
                            }
                        }
                        if (!matched) {
                            const hl2 = (this.ohlcv.high[bar] + this.ohlcv.low[bar]) / 2;
                            const hlc3 =
                                (this.ohlcv.high[bar] +
                                    this.ohlcv.low[bar] +
                                    this.ohlcv.close[bar]) /
                                3;
                            const ohlc4 =
                                (this.ohlcv.open[bar] +
                                    this.ohlcv.high[bar] +
                                    this.ohlcv.low[bar] +
                                    this.ohlcv.close[bar]) /
                                4;
                            if (scalarVal === hl2) {
                                resolvedArgs.push(
                                    this.ohlcv.high.map((h, idx) => (h + this.ohlcv.low[idx]) / 2)
                                );
                                matched = true;
                            } else if (scalarVal === hlc3) {
                                resolvedArgs.push(
                                    this.ohlcv.high.map(
                                        (h, idx) =>
                                            (h + this.ohlcv.low[idx] + this.ohlcv.close[idx]) / 3
                                    )
                                );
                                matched = true;
                            } else if (scalarVal === ohlc4) {
                                resolvedArgs.push(
                                    this.ohlcv.open.map(
                                        (o, idx) =>
                                            (o +
                                                this.ohlcv.high[idx] +
                                                this.ohlcv.low[idx] +
                                                this.ohlcv.close[idx]) /
                                            4
                                    )
                                );
                                matched = true;
                            }
                        }
                    }
                    if (!matched) {
                        // Check if the identifier has accumulated series data
                        if (argNode.type === N.Identifier && this.seriesData.has(argNode.name)) {
                            const sd = this.seriesData.get(argNode.name);
                            if (Array.isArray(sd) && sd.some((v) => !isNaN(v))) {
                                resolvedArgs.push(sd);
                                matched = true;
                            }
                        }
                    }
                    if (!matched) {
                        if (typeof scalarVal === 'number') {
                            // Build full series by evaluating for every bar
                            const series = new Array(this.barCount).fill(NaN);
                            for (let b = 0; b < this.barCount; b++) {
                                try {
                                    series[b] = this.eval(argNode, env, b) ?? NaN;
                                } catch {
                                    series[b] = NaN;
                                }
                            }
                            resolvedArgs.push(series);
                        } else {
                            resolvedArgs.push(scalarVal);
                        }
                    }
                }
                posIdx++;
            }

            try {
                const taFunc = taFunctions[fn] || allFunctions[fn];
                const result = taFunc(resolvedArgs);
                // Cache if array args look complete (last element is not NaN)
                const argsComplete = resolvedArgs.every(
                    (a) => !Array.isArray(a) || (a.length > 0 && !isNaN(a[a.length - 1]))
                );
                if (argsComplete) this._taCache[cacheKey] = result;
                // Tuple return (MACD → [macd[], signal[], hist[]], BB → [upper[], basis[], lower[]])
                if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
                    return result.map((s) => (Array.isArray(s) ? (s[bar] ?? NaN) : s));
                }
                // Single series return
                if (Array.isArray(result)) {
                    return result[bar] ?? NaN;
                }
                return result;
            } catch (e) {
                return NaN;
            }
        }

        // ═══════════════════════════════════════════════════════
        // request.security() — multi-timeframe data resampling
        // Resamples OHLCV to the target timeframe, evaluates the
        // expression on that data, then maps results back.
        // ═══════════════════════════════════════════════════════
        evalRequestSecurity(node, args, env, bar) {
            const cacheKey = `__reqsec_L${node.line || 0}`;

            // Return cached series for this bar
            if (this._taCache[cacheKey]) {
                const cached = this._taCache[cacheKey];
                if (Array.isArray(cached) && cached.length > 0 && Array.isArray(cached[0])) {
                    return cached.map((s) => (Array.isArray(s) ? (s[bar] ?? NaN) : s));
                }
                if (Array.isArray(cached)) return cached[bar] ?? NaN;
                return cached;
            }

            // args: (symbol, timeframe, expression, ...)
            // node.arguments[2] is the AST of the expression to evaluate on HTF
            const tfArg = args.positional[1];
            const exprNode = (node.arguments || [])[2];

            if (!tfArg || !exprNode) {
                this._taCache[cacheKey] = NaN;
                return NaN;
            }

            // Validate the TF string can be converted
            const tfSec = allFunctions['timeframe.in_seconds']([tfArg]);
            if (!tfSec || tfSec <= 0) {
                this._taCache[cacheKey] = NaN;
                return NaN;
            }

            // ── Step 1: Resample current OHLCV to the higher timeframe ──
            // Use _getHTFBarTime() for correct calendar-based grouping (M, 3M, 12M)
            const times = this.ohlcv.time || [];
            const opens = this.ohlcv.open || [];
            const highs = this.ohlcv.high || [];
            const lows = this.ohlcv.low || [];
            const closes = this.ohlcv.close || [];
            const volumes = this.ohlcv.volume || [];

            // Group bars into HTF windows using _getHTFBarTime for proper boundaries
            const htfBars = []; // { o, h, l, c, v, t, startIdx, endIdx }
            let cur = null;
            for (let i = 0; i < times.length; i++) {
                const windowStart = this._getHTFBarTime(tfArg, i);
                if (!cur || cur.t !== windowStart) {
                    if (cur) htfBars.push(cur);
                    cur = {
                        t: windowStart,
                        o: opens[i],
                        h: highs[i],
                        l: lows[i],
                        c: closes[i],
                        v: volumes[i] || 0,
                        startIdx: i,
                        endIdx: i,
                    };
                } else {
                    cur.h = Math.max(cur.h, highs[i]);
                    cur.l = Math.min(cur.l, lows[i]);
                    cur.c = closes[i];
                    cur.v += volumes[i] || 0;
                    cur.endIdx = i;
                }
            }
            if (cur) htfBars.push(cur);

            if (htfBars.length === 0) {
                this._taCache[cacheKey] = NaN;
                return NaN;
            }

            // Build HTF OHLCV arrays
            const htfOpen = htfBars.map((b) => b.o);
            const htfHigh = htfBars.map((b) => b.h);
            const htfLow = htfBars.map((b) => b.l);
            const htfClose = htfBars.map((b) => b.c);
            const htfVolume = htfBars.map((b) => b.v);
            const htfTime = htfBars.map((b) => b.t);

            // ── Step 2: Evaluate the expression on HTF data ──
            // Detect if the expression is a TA function call (most common case)
            let htfResult = null;

            if (exprNode.type === N.CallExpression || exprNode.type === N.MethodCallExpression) {
                // Extract the function name from the expression
                let fnName;
                if (exprNode.type === N.MethodCallExpression) {
                    fnName = this.buildCalleeName(exprNode.object) + '.' + exprNode.method;
                } else {
                    fnName = this.buildCalleeName(exprNode.callee);
                }

                // Map ta.* / kuri.* to the actual TA function
                let taFnName = fnName;
                if (fnName.startsWith('kuri.')) taFnName = 'ta.' + fnName.slice(5);

                const taFunc = taFunctions[taFnName] || allFunctions[taFnName];
                if (taFunc) {
                    // Resolve arguments for the TA call on HTF data
                    const htfOhlcvMap = {
                        close: htfClose,
                        open: htfOpen,
                        high: htfHigh,
                        low: htfLow,
                        volume: htfVolume,
                        time: htfTime,
                        hl2: htfHigh.map((h, i) => (h + htfLow[i]) / 2),
                        hlc3: htfHigh.map((h, i) => (h + htfLow[i] + htfClose[i]) / 3),
                        ohlc4: htfOpen.map(
                            (o, i) => (o + htfHigh[i] + htfLow[i] + htfClose[i]) / 4
                        ),
                    };

                    const resolvedArgs = [];
                    const exprArgs = exprNode.arguments || [];
                    for (let ai = 0; ai < exprArgs.length; ai++) {
                        const argNode = exprArgs[ai];
                        if (argNode.type === N.NamedArgument) continue;
                        if (argNode.type === N.Identifier && htfOhlcvMap[argNode.name]) {
                            resolvedArgs.push(htfOhlcvMap[argNode.name]);
                        } else if (argNode.type === N.NumberLiteral) {
                            resolvedArgs.push(argNode.value);
                        } else {
                            // Evaluate as scalar and use as-is
                            try {
                                resolvedArgs.push(this.eval(argNode, env, bar));
                            } catch {
                                resolvedArgs.push(NaN);
                            }
                        }
                    }

                    // Some TA functions (like ta.atr) need high/low/close as implicit args
                    // If the function expects more arrays than provided, supply HTF OHLCV
                    if (
                        taFnName === 'ta.atr' &&
                        resolvedArgs.length === 1 &&
                        typeof resolvedArgs[0] === 'number'
                    ) {
                        // ta.atr(length) → ta.atr(high, low, close, length)
                        resolvedArgs.unshift(htfHigh, htfLow, htfClose);
                    } else if (taFnName === 'ta.tr' && resolvedArgs.length === 0) {
                        resolvedArgs.push(htfHigh, htfLow, htfClose);
                    }

                    // For functions that take (source, length) and source wasn't provided as array
                    if (
                        resolvedArgs.length >= 1 &&
                        typeof resolvedArgs[0] === 'number' &&
                        !Array.isArray(resolvedArgs[0])
                    ) {
                        // If first arg is a plain number and function expects a series,
                        // it might be length-only. Default source to close.
                        const needsSource = [
                            'ta.sma',
                            'ta.ema',
                            'ta.wma',
                            'ta.rma',
                            'ta.rsi',
                            'ta.stdev',
                            'ta.variance',
                            'ta.highest',
                            'ta.lowest',
                            'ta.change',
                        ];
                        if (needsSource.includes(taFnName) && resolvedArgs.length === 1) {
                            resolvedArgs.unshift(htfClose);
                        }
                    }

                    try {
                        htfResult = taFunc(resolvedArgs);
                    } catch {
                        htfResult = null;
                    }
                }
            }

            // If we couldn't evaluate as TA, try evaluating the expression
            // for each HTF bar using a temporary interpreter context
            if (htfResult === null) {
                const htfSeries = new Array(htfBars.length).fill(NaN);
                for (let hb = 0; hb < htfBars.length; hb++) {
                    try {
                        // Create a temporary OHLCV context up to this HTF bar
                        const savedOhlcv = this.ohlcv;
                        const savedBarCount = this.barCount;
                        this.ohlcv = {
                            open: htfOpen.slice(0, hb + 1),
                            high: htfHigh.slice(0, hb + 1),
                            low: htfLow.slice(0, hb + 1),
                            close: htfClose.slice(0, hb + 1),
                            volume: htfVolume.slice(0, hb + 1),
                            time: htfTime.slice(0, hb + 1),
                        };
                        this.barCount = hb + 1;
                        // Clear TA cache for fresh computation
                        const savedCache = this._taCache;
                        this._taCache = {};
                        htfSeries[hb] = this.eval(exprNode, env, hb);
                        this._taCache = savedCache;
                        this.ohlcv = savedOhlcv;
                        this.barCount = savedBarCount;
                    } catch {
                        htfSeries[hb] = NaN;
                    }
                }
                htfResult = htfSeries;
            }

            // ── Step 3: Map HTF results back to current timeframe bars ──
            // Each current bar gets the value of the most recent COMPLETED HTF bar
            const isTuple =
                Array.isArray(htfResult) && htfResult.length > 0 && Array.isArray(htfResult[0]);

            if (isTuple) {
                // Multiple series (e.g., MACD, BB)
                const numSeries = htfResult.length;
                const mapped = [];
                for (let s = 0; s < numSeries; s++) {
                    const htfSer = htfResult[s];
                    const currentSer = new Array(times.length).fill(NaN);
                    for (let hb = 0; hb < htfBars.length; hb++) {
                        const val = Array.isArray(htfSer) ? (htfSer[hb] ?? NaN) : NaN;
                        // Fill all current bars within this HTF window
                        for (let i = htfBars[hb].startIdx; i <= htfBars[hb].endIdx; i++) {
                            currentSer[i] = val;
                        }
                    }
                    mapped.push(currentSer);
                }
                this._taCache[cacheKey] = mapped;
                return mapped.map((s) => s[bar] ?? NaN);
            } else if (Array.isArray(htfResult)) {
                // Single series
                const currentSer = new Array(times.length).fill(NaN);
                for (let hb = 0; hb < htfBars.length; hb++) {
                    const val = htfResult[hb] ?? NaN;
                    for (let i = htfBars[hb].startIdx; i <= htfBars[hb].endIdx; i++) {
                        currentSer[i] = val;
                    }
                }
                this._taCache[cacheKey] = currentSer;
                return currentSer[bar] ?? NaN;
            }

            this._taCache[cacheKey] = NaN;
            return NaN;
        }

        // ═══════════════════════════════════════════════════════
        // Multi-timeframe helpers
        // ═══════════════════════════════════════════════════════

        /**
         * _tfToSeconds(tf) — convert a timeframe string to seconds.
         * Accepts: "D", "W", "M", "3M", "12M", "1Y", "60", "240", "1H", "4H", etc.
         */
        _tfToSeconds(tf) {
            if (!tf) return 0;
            const s = String(tf).toUpperCase();
            // Pure number = minutes
            if (/^\d+$/.test(s)) return parseInt(s) * 60;
            // Special named timeframes
            if (s === 'D' || s === '1D') return 86400;
            if (s === 'W' || s === '1W') return 604800;
            if (s === 'M' || s === '1M') return 2592000;
            if (s === '3M') return 7776000;
            if (s === '6M') return 15552000;
            if (s === '12M' || s === '1Y') return 31536000;
            // With suffix: "4H", "30S", "15M", "2D", "2W"
            const m = s.match(/^(\d+)([SMHDWY]?)$/);
            if (!m) return 0;
            const num = parseInt(m[1]);
            const unit = m[2] || 'M'; // default to minutes
            switch (unit) {
                case 'S':
                    return num;
                case 'M':
                    return num * 60;
                case 'H':
                    return num * 3600;
                case 'D':
                    return num * 86400;
                case 'W':
                    return num * 604800;
                case 'Y':
                    return num * 31536000;
                default:
                    return num * 60;
            }
        }

        /**
         * _getHTFBarTime(tf, bar) — returns the opening timestamp (ms) of the
         * higher-timeframe bar that contains chart bar `bar`.
         */
        _getHTFBarTime(tf, bar) {
            const barTime = (this.ohlcv.time || [])[bar];
            if (!barTime) return NaN;
            const barTimeMs = barTime * (barTime < 1e12 ? 1000 : 1); // handle seconds vs ms
            const d = new Date(barTimeMs);
            const s = String(tf).toUpperCase();

            if (s === 'D' || s === '1D') {
                d.setUTCHours(0, 0, 0, 0);
            } else if (s === 'W' || s === '1W') {
                d.setUTCHours(0, 0, 0, 0);
                // Floor to Monday (getUTCDay: 0=Sun)
                const dow = d.getUTCDay();
                d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
            } else if (s === 'M' || s === '1M') {
                d.setUTCDate(1);
                d.setUTCHours(0, 0, 0, 0);
            } else if (s === '3M') {
                const q = Math.floor(d.getUTCMonth() / 3) * 3;
                d.setUTCMonth(q, 1);
                d.setUTCHours(0, 0, 0, 0);
            } else if (s === '6M') {
                const h = Math.floor(d.getUTCMonth() / 6) * 6;
                d.setUTCMonth(h, 1);
                d.setUTCHours(0, 0, 0, 0);
            } else if (s === '12M' || s === '1Y') {
                d.setUTCMonth(0, 1);
                d.setUTCHours(0, 0, 0, 0);
            } else {
                // Intraday: floor to tfSeconds boundary from epoch
                const tfSeconds = this._tfToSeconds(tf);
                if (!tfSeconds) return barTimeMs;
                const epoch = Math.floor(barTimeMs / (tfSeconds * 1000)) * (tfSeconds * 1000);
                return epoch;
            }
            return d.getTime();
        }

        /**
         * _resampleOHLCV(tf) — resample chart OHLCV data into higher-timeframe bars.
         * Returns { htfOHLCV, chartToHTF, htfBars } or null.
         * Cached in _taCache.
         */
        _resampleOHLCV(tf) {
            const cacheKey = `__resample_${tf}`;
            if (this._taCache[cacheKey]) return this._taCache[cacheKey];

            const times = this.ohlcv.time || [];
            if (times.length === 0) return null;

            // Group chart bars into HTF bars
            const htfBars = [];
            let currentHTFTime = null;
            let currentBar = null;

            for (let i = 0; i < times.length; i++) {
                const htfTime = this._getHTFBarTime(tf, i);
                if (htfTime !== currentHTFTime) {
                    if (currentBar) htfBars.push(currentBar);
                    currentHTFTime = htfTime;
                    currentBar = {
                        time: htfTime,
                        open: this.ohlcv.open[i],
                        high: this.ohlcv.high[i],
                        low: this.ohlcv.low[i],
                        close: this.ohlcv.close[i],
                        volume: (this.ohlcv.volume || [])[i] || 0,
                        chartBars: [i],
                    };
                } else if (currentBar) {
                    currentBar.high = Math.max(currentBar.high, this.ohlcv.high[i]);
                    currentBar.low = Math.min(currentBar.low, this.ohlcv.low[i]);
                    currentBar.close = this.ohlcv.close[i];
                    currentBar.volume += (this.ohlcv.volume || [])[i] || 0;
                    currentBar.chartBars.push(i);
                }
            }
            if (currentBar) htfBars.push(currentBar);

            // Build OHLCV arrays for the HTF
            const htfOHLCV = {
                open: htfBars.map((b) => b.open),
                high: htfBars.map((b) => b.high),
                low: htfBars.map((b) => b.low),
                close: htfBars.map((b) => b.close),
                volume: htfBars.map((b) => b.volume),
                time: htfBars.map((b) => b.time),
            };

            // Build mapping: for each chart bar, which HTF bar index does it belong to?
            const chartToHTF = new Array(times.length).fill(NaN);
            htfBars.forEach((htfBar, htfIdx) => {
                for (const chartIdx of htfBar.chartBars) {
                    chartToHTF[chartIdx] = htfIdx;
                }
            });

            const result = { htfOHLCV, chartToHTF, htfBars };
            this._taCache[cacheKey] = result;
            return result;
        }

        callUserFunction(name, args, env, bar, callNode) {
            const funcDef = this.userFunctions.get(name);
            const funcEnv = new Environment(env);

            // Bind parameters — also link series data for TA function resolution
            const callArgs = callNode?.arguments || [];
            for (let i = 0; i < funcDef.params.length; i++) {
                const param = funcDef.params[i];
                let val;
                // Check named args first
                if (args.named[param.name] !== undefined) {
                    val = args.named[param.name];
                } else if (i < args.positional.length) {
                    val = args.positional[i];
                } else if (param.default) {
                    val = this.eval(param.default, env, bar);
                } else {
                    val = NaN;
                }
                funcEnv.set(param.name, val);

                // If the call-site arg is a series identifier, link seriesData
                // so ta.* calls inside the function can resolve the full series
                const callArg = callArgs[i];
                if (callArg && callArg.type === N.Identifier && this.seriesData.has(callArg.name)) {
                    if (!this.seriesData.has(param.name)) {
                        this.seriesData.set(param.name, this.seriesData.get(callArg.name));
                    }
                }
            }

            // Execute function body
            try {
                if (funcDef.body.type === N.BlockStatement) {
                    let lastVal = null;
                    for (const stmt of funcDef.body.body) {
                        lastVal = this.execNode(stmt, funcEnv, bar);
                    }
                    return lastVal;
                } else {
                    return this.eval(funcDef.body, funcEnv, bar);
                }
            } catch (e) {
                if (e instanceof ReturnSignal) return e.value;
                throw e;
            }
        }

        handleInputCall(fn, args, env, bar) {
            const defval = args.positional[0] ?? args.named.defval;
            // Pine Script passes title as 2nd positional arg: input.string("default", "Title", ...)
            const title =
                args.named.title ||
                (typeof args.positional[1] === 'string' ? args.positional[1] : null) ||
                `Input ${this.inputDefs.length + 1}`;
            const key = title.toLowerCase().replace(/\s+/g, '_');
            const options = args.named.options || null;
            const tooltip =
                args.named.tooltip ||
                (typeof args.positional[2] === 'string' && !args.named.options
                    ? args.positional[2]
                    : '') ||
                '';

            // Determine type from function name
            let inputType = 'auto';
            if (fn === 'input.string') inputType = 'string';
            else if (fn === 'input.int') inputType = 'int';
            else if (fn === 'input.float') inputType = 'float';
            else if (fn === 'input.bool') inputType = 'bool';
            else if (fn === 'input.color') inputType = 'color';
            else if (fn === 'input.timeframe') inputType = 'timeframe';
            else if (fn === 'input.source') inputType = 'source';
            else if (fn === 'input.session') inputType = 'session';
            else if (fn === 'input.symbol') inputType = 'symbol';
            else if (fn === 'input.text_area') inputType = 'text_area';
            else inputType = typeof defval;

            if (bar === 0) {
                const def = { key, title, defval, type: inputType, options, tooltip };
                if (args.named.minval !== undefined) def.minval = args.named.minval;
                else if (args.named.min !== undefined) def.minval = args.named.min;
                if (args.named.maxval !== undefined) def.maxval = args.named.maxval;
                else if (args.named.max !== undefined) def.maxval = args.named.max;
                if (args.named.step !== undefined) def.step = args.named.step;
                if (args.named.group) def.group = args.named.group;
                if (args.named.inline) def.inline = args.named.inline;
                if (args.named.confirm) def.confirm = true;
                this.inputDefs.push(def);
            }
            return this.inputs[key] !== undefined ? this.inputs[key] : defval;
        }

        // ---- Helpers ----
        buildCalleeName(node) {
            if (!node) return '';
            if (node.type === N.Identifier) return node.name;
            if (node.type === N.MemberExpression)
                return `${this.buildCalleeName(node.object)}.${node.property}`;
            if (node.__namespace) return node.__namespace;
            return '';
        }

        evalArgs(argNodes, env, bar) {
            const pos = [],
                named = {};
            for (const a of argNodes) {
                if (a.type === N.NamedArgument) named[a.name] = this.eval(a.value, env, bar);
                else pos.push(this.eval(a, env, bar));
            }
            return { positional: pos, named };
        }

        evalIndicatorDecl(node) {
            const args = {};
            for (const a of node.arguments) {
                if (a.type === N.NamedArgument) {
                    if (
                        a.value.type === N.StringLiteral ||
                        a.value.type === N.NumberLiteral ||
                        a.value.type === N.BooleanLiteral
                    )
                        args[a.name] = a.value.value;
                    else args[a.name] = a.value;
                } else if (a.type === N.StringLiteral && !args.title) args.title = a.value;
                else if (a.type === N.BooleanLiteral && !('overlay' in args))
                    args.overlay = a.value;
            }
            return {
                kind: node.kind,
                title: args.title || 'Kuri Indicator',
                overlay: args.overlay ?? false,
                shorttitle: args.shorttitle || args.title || 'Kuri',
                max_labels_count: args.max_labels_count || 500,
                max_lines_count: args.max_lines_count || 500,
                max_boxes_count: args.max_boxes_count || 500,
            };
        }

        truthy(v) {
            return (
                v !== null &&
                v !== undefined &&
                !Number.isNaN(v) &&
                v !== 0 &&
                v !== false &&
                v !== ''
            );
        }
    }

    // ============================================================
    // KURI ENGINE — Top-Level API
    // ============================================================
    class KuriEngine {
        constructor(opts = {}) {
            this.debug = opts.debug || false;
            this.maxBars = opts.maxBars || 50000;
        }

        compile(source) {
            const errors = [];
            let tokens = [],
                ast = null;
            try {
                tokens = new Lexer(source).tokenize();
            } catch (e) {
                errors.push({ phase: 'lexer', message: e.message, line: e.line, col: e.col });
                return { ast: null, tokens: [], errors };
            }
            try {
                const p = new Parser(tokens);
                ast = p.parse();
                for (const e of ast.errors) errors.push({ phase: 'parser', message: e.message });
            } catch (e) {
                errors.push({ phase: 'parser', message: e.message });
            }
            return { ast, tokens, errors };
        }

        run(source, ohlcv, inputOverrides = {}) {
            const t0 = performance.now();
            const { ast, tokens, errors: ce } = this.compile(source);
            if (!ast)
                return {
                    success: false,
                    errors: ce,
                    indicator: null,
                    inputDefs: [],
                    plots: [],
                    hlines: [],
                    drawings: { lines: [], labels: [], boxes: [] },
                    compileTime: performance.now() - t0,
                    executeTime: 0,
                };
            const ct = performance.now() - t0;
            const t1 = performance.now();
            let result;
            try {
                const bc = Math.min(ohlcv.close.length, this.maxBars);
                // Skip slicing if data is already within limits
                const td =
                    bc >= ohlcv.close.length
                        ? ohlcv
                        : {
                              open: ohlcv.open.slice(0, bc),
                              high: ohlcv.high.slice(0, bc),
                              low: ohlcv.low.slice(0, bc),
                              close: ohlcv.close.slice(0, bc),
                              volume: ohlcv.volume.slice(0, bc),
                              time: (ohlcv.time || []).slice(0, bc),
                          };
                // Auto-detect chart timeframe from candle spacing and set timeframe.* constants
                const _times = td.time || [];
                let chartTFSeconds = 3600; // default 1H
                if (_times.length >= 2) {
                    const spacings = [];
                    for (let i = 1; i < Math.min(_times.length, 50); i++) {
                        const diff = Math.abs(_times[i] - _times[i - 1]);
                        const diffSec = diff < 1e10 ? diff : diff / 1000; // handle ms vs sec
                        if (diffSec > 0 && diffSec < 31536000) spacings.push(diffSec);
                    }
                    spacings.sort((a, b) => a - b);
                    if (spacings.length > 0)
                        chartTFSeconds = spacings[Math.floor(spacings.length / 2)];
                }

                runtimeConstants['timeframe.multiplier'] =
                    chartTFSeconds < 86400 ? Math.round(chartTFSeconds / 60) : 1;
                runtimeConstants['timeframe.period'] =
                    chartTFSeconds < 3600
                        ? String(Math.round(chartTFSeconds / 60))
                        : chartTFSeconds < 86400
                          ? String(Math.round(chartTFSeconds / 3600)) + 'H'
                          : chartTFSeconds < 604800
                            ? 'D'
                            : chartTFSeconds < 2592000
                              ? 'W'
                              : 'M';
                runtimeConstants['timeframe.isseconds'] = chartTFSeconds < 60;
                runtimeConstants['timeframe.isminutes'] =
                    chartTFSeconds >= 60 && chartTFSeconds < 3600;
                runtimeConstants['timeframe.isintraday'] = chartTFSeconds < 86400;
                runtimeConstants['timeframe.isdaily'] =
                    chartTFSeconds >= 86400 && chartTFSeconds < 604800;
                runtimeConstants['timeframe.isweekly'] =
                    chartTFSeconds >= 604800 && chartTFSeconds < 2592000;
                runtimeConstants['timeframe.ismonthly'] = chartTFSeconds >= 2592000;
                runtimeConstants['timeframe.isdwm'] = chartTFSeconds >= 86400;

                _strat.orders = [];
                result = new KuriInterpreter().execute(ast, td, inputOverrides);
            } catch (e) {
                return {
                    success: false,
                    errors: [...ce, { phase: 'runtime', message: e.message }],
                    indicator: null,
                    inputDefs: [],
                    plots: [],
                    hlines: [],
                    drawings: { lines: [], labels: [], boxes: [] },
                    compileTime: ct,
                    executeTime: performance.now() - t1,
                };
            }
            const et = performance.now() - t1;
            const allErrors = [...ce, ...result.errors.map((e) => ({ phase: 'runtime', ...e }))];
            return {
                success: allErrors.length === 0,
                errors: allErrors,
                indicator: result.indicator,
                plots: result.plots,
                hlines: result.hlines,
                bgcolors: result.bgcolors,
                fills: result.fills,
                alerts: result.alerts,
                seriesData: result.seriesData,
                drawings: result.drawings,
                inputDefs: result.inputDefs,
                strategy: { orders: _strat.orders.slice() },
                compileTime: ct,
                executeTime: et,
                totalTime: ct + et,
                barCount: ohlcv.close.length,
            };
        }

        validate(source) {
            const { errors } = this.compile(source);
            return { valid: errors.length === 0, errors };
        }

        static getBuiltinList() {
            return {
                functions: Object.keys(allFunctions),
                colors: Object.keys(colorConstants),
                constants: Object.keys(runtimeConstants),
                series: [
                    'open',
                    'high',
                    'low',
                    'close',
                    'volume',
                    'time',
                    'bar_index',
                    'hl2',
                    'hlc3',
                    'ohlc4',
                ],
                keywords: [
                    'indicator',
                    'strategy',
                    'input',
                    'plot',
                    'hline',
                    'bgcolor',
                    'fill',
                    'switch',
                    'if',
                    'else',
                    'for',
                    'to',
                    'by',
                    'while',
                    'break',
                    'continue',
                    'return',
                    'var',
                    'varip',
                    'true',
                    'false',
                    'na',
                    'and',
                    'or',
                    'not',
                    'plotshape',
                    'plotchar',
                    'plotarrow',
                    'alertcondition',
                    'line',
                    'label',
                    'box',
                    'table',
                    'array',
                    'matrix',
                    'map',
                    'type',
                    'method',
                    'export',
                    'import',
                ],
            };
        }
    }

    function generateSampleOHLCV(bars = 200, startPrice = 100) {
        const o = [startPrice],
            h = [],
            l = [],
            c = [],
            v = [],
            t = [];
        const sd = Date.now() - bars * 86400000;
        for (let i = 0; i < bars; i++) {
            const op = i === 0 ? startPrice : c[i - 1];
            const ch = (Math.random() - 0.48) * 3;
            const cl = op + ch;
            const hi = Math.max(op, cl) + Math.random() * 2;
            const lo = Math.min(op, cl) - Math.random() * 2;
            o[i] = Math.round(op * 100) / 100;
            h[i] = Math.round(hi * 100) / 100;
            l[i] = Math.round(lo * 100) / 100;
            c[i] = Math.round(cl * 100) / 100;
            v[i] = Math.floor(Math.random() * 1e6) + 1e5;
            t[i] = sd + i * 86400000;
        }
        return { open: o, high: h, low: l, close: c, volume: v, time: t };
    }

    // ============================================================
    // EXPANSION PACK v2.1 — 216 additional Kuri Script functions
    // ============================================================
    // ════════════════════════════════════════════════════════
    // 1. TA FUNCTIONS — 35 missing indicators + utilities
    // ════════════════════════════════════════════════════════

    // --- Moving Averages ---
    allFunctions['ta.hma'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const half = Math.max(1, Math.floor(len / 2)),
            sqr = Math.max(1, Math.floor(Math.sqrt(len)));
        const wma1 = allFunctions['ta.wma']([src, half]),
            wma2 = allFunctions['ta.wma']([src, len]);
        const diff = wma1.map((v, i) => (isNa(v) || isNa(wma2[i]) ? NaN : 2 * v - wma2[i]));
        return allFunctions['ta.wma']([diff, sqr]);
    };

    allFunctions['ta.dema'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const e1 = allFunctions['ta.ema']([src, len]),
            e2 = allFunctions['ta.ema']([e1, len]);
        return e1.map((v, i) => (isNa(v) || isNa(e2[i]) ? NaN : 2 * v - e2[i]));
    };

    allFunctions['ta.tema'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const e1 = allFunctions['ta.ema']([src, len]),
            e2 = allFunctions['ta.ema']([e1, len]),
            e3 = allFunctions['ta.ema']([e2, len]);
        return e1.map((v, i) =>
            isNa(v) || isNa(e2[i]) || isNa(e3[i]) ? NaN : 3 * v - 3 * e2[i] + e3[i]
        );
    };

    allFunctions['ta.swma'] = (a) => {
        const src = a[0];
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = 3; i < src.length; i++)
            r[i] = (nz(src[i - 3]) + 3 * nz(src[i - 2]) + 3 * nz(src[i - 1]) + nz(src[i])) / 8;
        return r;
    };

    allFunctions['ta.alma'] = (a) => {
        const src = a[0],
            len = a[1],
            offset = a[2] || 0.85,
            sigma = a[3] || 6;
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        const m = Math.floor(offset * (len - 1)),
            s = len / sigma;
        for (let i = len - 1; i < src.length; i++) {
            let wsum = 0,
                norm = 0;
            for (let j = 0; j < len; j++) {
                const w = Math.exp(-((j - m) * (j - m)) / (2 * s * s));
                wsum += w * nz(src[i - len + 1 + j]);
                norm += w;
            }
            r[i] = norm ? wsum / norm : NaN;
        }
        return r;
    };

    // --- Oscillators ---
    allFunctions['ta.mfi'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len; i < src.length; i++) {
            let posFlow = 0,
                negFlow = 0;
            for (let j = 0; j < len; j++) {
                const idx = i - j,
                    prev = idx - 1;
                if (prev < 0) continue;
                const mf = nz(src[idx]) * 1; // simplified: use src as typical price * volume proxy
                if (nz(src[idx]) > nz(src[prev])) posFlow += Math.abs(mf);
                else negFlow += Math.abs(mf);
            }
            const ratio = negFlow === 0 ? 100 : posFlow / negFlow;
            r[i] = 100 - 100 / (1 + ratio);
        }
        return r;
    };

    allFunctions['ta.cci'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const ma = allFunctions['ta.sma']([src, len]);
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            let sumDev = 0;
            for (let j = 0; j < len; j++) sumDev += Math.abs(nz(src[i - j]) - ma[i]);
            const meanDev = sumDev / len;
            r[i] = meanDev ? (nz(src[i]) - ma[i]) / (0.015 * meanDev) : 0;
        }
        return r;
    };

    allFunctions['ta.cmo'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len; i < src.length; i++) {
            let sU = 0,
                sD = 0;
            for (let j = 0; j < len; j++) {
                const diff = nz(src[i - j]) - nz(src[i - j - 1]);
                if (diff > 0) sU += diff;
                else sD += Math.abs(diff);
            }
            r[i] = sU + sD ? ((sU - sD) / (sU + sD)) * 100 : 0;
        }
        return r;
    };

    allFunctions['ta.cog'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            let num = 0,
                den = 0;
            for (let j = 0; j < len; j++) {
                num -= (j + 1) * nz(src[i - j]);
                den += nz(src[i - j]);
            }
            r[i] = den ? num / den : 0;
        }
        return r;
    };

    allFunctions['ta.mom'] = (a) => {
        const src = a[0],
            len = a[1] || 10;
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len; i < src.length; i++) r[i] = nz(src[i]) - nz(src[i - len]);
        return r;
    };

    allFunctions['ta.roc'] = (a) => {
        const src = a[0],
            len = a[1] || 10;
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len; i < src.length; i++) {
            const prev = nz(src[i - len]);
            r[i] = prev ? ((nz(src[i]) - prev) / prev) * 100 : 0;
        }
        return r;
    };

    // --- Volatility extensions ---
    allFunctions['ta.bbw'] = (a) => {
        const src = a[0],
            len = a[1] || 20,
            mult = a[2] || 2;
        const bb = allFunctions['ta.bb']([src, len, mult]);
        return bb[1].map((u, i) =>
            isNa(u) || isNa(bb[2][i]) || isNa(bb[0][i]) || bb[0][i] === 0
                ? NaN
                : (u - bb[2][i]) / bb[0][i]
        );
    };

    allFunctions['ta.kc'] = (a) => {
        const src = a[0],
            len = a[1] || 20,
            mult = a[2] || 1.5,
            atrLen = a[3] || 10;
        const ma = allFunctions['ta.ema']([src, len]);
        // Need high,low,close for ATR - use src as proxy
        const atr = allFunctions['ta.rma']([
            src.map((v, i) => Math.abs(nz(v) - nz(src[i - 1] || v))),
            atrLen,
        ]);
        return [
            ma,
            ma.map((v, i) => (isNa(v) || isNa(atr[i]) ? NaN : v + mult * atr[i])),
            ma.map((v, i) => (isNa(v) || isNa(atr[i]) ? NaN : v - mult * atr[i])),
        ];
    };

    allFunctions['ta.kcw'] = (a) => {
        const kc = allFunctions['ta.kc'](a);
        return kc[0].map((m, i) => (m === 0 || isNa(m) ? NaN : (kc[1][i] - kc[2][i]) / m));
    };

    // --- Trend ---
    allFunctions['ta.supertrend'] = (a) => {
        const factor = a[0],
            atrPeriod = a[1];
        // Simplified: needs OHLC context. Returns [supertrend, direction] as series
        return [new Array(1).fill(NaN), new Array(1).fill(1)];
    };

    allFunctions['ta.dmi'] = (a) => {
        const diLen = a[0],
            adxLen = a[1];
        return [new Array(1).fill(NaN), new Array(1).fill(NaN), new Array(1).fill(NaN)]; // [plus,minus,adx]
    };

    allFunctions['ta.adx'] = (a) => {
        // Simplified ADX - needs high/low/close series
        return new Array(1).fill(NaN);
    };

    allFunctions['ta.aroon'] = (a) => {
        const src = a[0],
            len = a[1] || 14;
        if (!Array.isArray(src)) return [NaN, NaN];
        const up = new Array(src.length).fill(NaN),
            dn = new Array(src.length).fill(NaN);
        for (let i = len; i < src.length; i++) {
            let hIdx = 0,
                lIdx = 0,
                hVal = -Infinity,
                lVal = Infinity;
            for (let j = 0; j <= len; j++) {
                if (nz(src[i - j]) > hVal) {
                    hVal = nz(src[i - j]);
                    hIdx = j;
                }
                if (nz(src[i - j]) < lVal) {
                    lVal = nz(src[i - j]);
                    lIdx = j;
                }
            }
            up[i] = ((len - hIdx) / len) * 100;
            dn[i] = ((len - lIdx) / len) * 100;
        }
        return [up, dn];
    };

    allFunctions['ta.psar'] = (a) => {
        const start = a[0] || 0.02,
            inc = a[1] || 0.02,
            mx = a[2] || 0.2;
        return new Array(1).fill(NaN); // Needs OHLC context
    };

    allFunctions['ta.sar'] = allFunctions['ta.psar'];

    // --- TA Utility extensions ---
    allFunctions['ta.highestbars'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            let mx = -Infinity,
                mxIdx = 0;
            for (let j = 0; j < len; j++) {
                if (nz(src[i - j]) > mx) {
                    mx = nz(src[i - j]);
                    mxIdx = -j;
                }
            }
            r[i] = mxIdx;
        }
        return r;
    };

    allFunctions['ta.lowestbars'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            let mn = Infinity,
                mnIdx = 0;
            for (let j = 0; j < len; j++) {
                if (nz(src[i - j]) < mn) {
                    mn = nz(src[i - j]);
                    mnIdx = -j;
                }
            }
            r[i] = mnIdx;
        }
        return r;
    };

    allFunctions['ta.cross'] = (a) => {
        const x = allFunctions['ta.crossover'](a),
            y = allFunctions['ta.crossunder'](a);
        return x.map((v, i) => v || y[i]);
    };

    allFunctions['ta.valuewhen'] = (a) => {
        const cond = a[0],
            src = a[1],
            occ = a[2] || 0;
        if (!Array.isArray(cond)) return NaN;
        const r = new Array(cond.length).fill(NaN);
        const vals = [];
        for (let i = 0; i < cond.length; i++) {
            if (cond[i]) vals.push(Array.isArray(src) ? src[i] : src);
            if (vals.length > occ) r[i] = vals[vals.length - 1 - occ];
        }
        return r;
    };

    allFunctions['ta.rising'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return false;
        const r = new Array(src.length).fill(false);
        for (let i = len; i < src.length; i++) {
            let rising = true;
            for (let j = 0; j < len; j++) {
                if (nz(src[i - j]) <= nz(src[i - j - 1])) {
                    rising = false;
                    break;
                }
            }
            r[i] = rising;
        }
        return r;
    };

    allFunctions['ta.falling'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return false;
        const r = new Array(src.length).fill(false);
        for (let i = len; i < src.length; i++) {
            let falling = true;
            for (let j = 0; j < len; j++) {
                if (nz(src[i - j]) >= nz(src[i - j - 1])) {
                    falling = false;
                    break;
                }
            }
            r[i] = falling;
        }
        return r;
    };

    allFunctions['ta.percentrank'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len; i < src.length; i++) {
            let count = 0;
            for (let j = 1; j <= len; j++) {
                if (nz(src[i - j]) < nz(src[i])) count++;
            }
            r[i] = (count / len) * 100;
        }
        return r;
    };

    allFunctions['ta.percentile_linear_interpolation'] = (a) => {
        const src = a[0],
            len = a[1],
            pct = a[2];
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            const window = [];
            for (let j = 0; j < len; j++) window.push(nz(src[i - j]));
            window.sort((x, y) => x - y);
            const idx = (pct / 100) * (window.length - 1);
            const lo = Math.floor(idx),
                hi = Math.ceil(idx);
            r[i] = lo === hi ? window[lo] : window[lo] + (window[hi] - window[lo]) * (idx - lo);
        }
        return r;
    };

    allFunctions['ta.percentile_nearest_rank'] = (a) => {
        const src = a[0],
            len = a[1],
            pct = a[2];
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            const w = [];
            for (let j = 0; j < len; j++) w.push(nz(src[i - j]));
            w.sort((x, y) => x - y);
            r[i] = w[Math.min(w.length - 1, Math.max(0, Math.ceil((pct / 100) * w.length) - 1))];
        }
        return r;
    };

    allFunctions['ta.correlation'] = (a) => {
        const src1 = a[0],
            src2 = a[1],
            len = a[2];
        if (!Array.isArray(src1) || !Array.isArray(src2)) return NaN;
        const r = new Array(src1.length).fill(NaN);
        for (let i = len - 1; i < src1.length; i++) {
            let sx = 0,
                sy = 0,
                sxy = 0,
                sxx = 0,
                syy = 0;
            for (let j = 0; j < len; j++) {
                const x = nz(src1[i - j]),
                    y = nz(src2[i - j]);
                sx += x;
                sy += y;
                sxy += x * y;
                sxx += x * x;
                syy += y * y;
            }
            const d = Math.sqrt((len * sxx - sx * sx) * (len * syy - sy * sy));
            r[i] = d ? (len * sxy - sx * sy) / d : 0;
        }
        return r;
    };

    allFunctions['ta.dev'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const ma = allFunctions['ta.sma']([src, len]);
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            let s = 0;
            for (let j = 0; j < len; j++) s += Math.abs(nz(src[i - j]) - ma[i]);
            r[i] = s / len;
        }
        return r;
    };

    allFunctions['ta.median'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            const w = [];
            for (let j = 0; j < len; j++) w.push(nz(src[i - j]));
            w.sort((x, y) => x - y);
            r[i] =
                w.length % 2
                    ? w[Math.floor(w.length / 2)]
                    : (w[w.length / 2 - 1] + w[w.length / 2]) / 2;
        }
        return r;
    };

    allFunctions['ta.mode'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            const counts = {};
            for (let j = 0; j < len; j++) {
                const v = Math.round(nz(src[i - j]) * 100) / 100;
                counts[v] = (counts[v] || 0) + 1;
            }
            let maxC = 0,
                mode = NaN;
            for (const [k, c] of Object.entries(counts)) {
                if (c > maxC) {
                    maxC = c;
                    mode = Number(k);
                }
            }
            r[i] = mode;
        }
        return r;
    };

    allFunctions['ta.range'] = (a) => {
        const src = a[0],
            len = _unwrapPeriod(a[1]);
        if (!Array.isArray(src)) return NaN;
        const h = allFunctions['ta.highest']([src, len]),
            l = allFunctions['ta.lowest']([src, len]);
        return h.map((v, i) => (isNa(v) || isNa(l[i]) ? NaN : v - l[i]));
    };

    allFunctions['ta.linreg'] = (a) => {
        const src = a[0],
            len = a[1],
            offset = a[2] || 0;
        if (!Array.isArray(src)) return NaN;
        const r = new Array(src.length).fill(NaN);
        for (let i = len - 1; i < src.length; i++) {
            let sx = 0,
                sy = 0,
                sxy = 0,
                sxx = 0;
            for (let j = 0; j < len; j++) {
                const x = j,
                    y = nz(src[i - len + 1 + j]);
                sx += x;
                sy += y;
                sxy += x * y;
                sxx += x * x;
            }
            const d = len * sxx - sx * sx;
            if (d) {
                const slope = (len * sxy - sx * sy) / d,
                    intercept = (sy - slope * sx) / len;
                r[i] = intercept + slope * (len - 1 + offset);
            }
        }
        return r;
    };

    // ════════════════════════════════════════════════════════
    // 2. MATH — Trig, exp, constants
    // ════════════════════════════════════════════════════════
    allFunctions['math.exp'] = (a) => (typeof a[0] === 'number' ? Math.exp(a[0]) : NaN);
    allFunctions['math.acos'] = (a) => (typeof a[0] === 'number' ? Math.acos(a[0]) : NaN);
    allFunctions['math.asin'] = (a) => (typeof a[0] === 'number' ? Math.asin(a[0]) : NaN);
    allFunctions['math.atan'] = (a) => (typeof a[0] === 'number' ? Math.atan(a[0]) : NaN);
    allFunctions['math.atan2'] = (a) => Math.atan2(a[0], a[1]);
    allFunctions['math.cos'] = (a) => (typeof a[0] === 'number' ? Math.cos(a[0]) : NaN);
    allFunctions['math.sin'] = (a) => (typeof a[0] === 'number' ? Math.sin(a[0]) : NaN);
    allFunctions['math.tan'] = (a) => (typeof a[0] === 'number' ? Math.tan(a[0]) : NaN);
    allFunctions['math.round_to_mintick'] = (a) => {
        const v = a[0],
            mt = runtimeConstants['syminfo.mintick'] || 0.01;
        return typeof v === 'number' ? Math.round(v / mt) * mt : NaN;
    };

    // Math constants (registered as both functions and runtime constants)
    runtimeConstants['math.pi'] = Math.PI;
    allFunctions['math.pi'] = (a) => Math.PI;
    runtimeConstants['math.e'] = Math.E;
    allFunctions['math.e'] = (a) => Math.E;
    runtimeConstants['math.phi'] = 1.618033988749895;
    allFunctions['math.phi'] = (a) => 1.618033988749895;
    runtimeConstants['math.rphi'] = 0.618033988749895;
    allFunctions['math.rphi'] = (a) => 0.618033988749895;

    // ════════════════════════════════════════════════════════
    // 3. STRING — Missing 3 functions
    // ════════════════════════════════════════════════════════
    allFunctions['str.format_time'] = (a) => {
        const ts = a[0],
            fmt = a[1] || 'yyyy-MM-dd',
            tz = a[2] || 'UTC';
        const d = new Date(ts);
        return fmt
            .replace('yyyy', d.getFullYear())
            .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
            .replace('dd', String(d.getDate()).padStart(2, '0'))
            .replace('HH', String(d.getHours()).padStart(2, '0'))
            .replace('mm', String(d.getMinutes()).padStart(2, '0'))
            .replace('ss', String(d.getSeconds()).padStart(2, '0'));
    };
    allFunctions['str.match'] = (a) => {
        const m = (a[0] || '').match(new RegExp(a[1]));
        return m ? m[0] : '';
    };
    allFunctions['str.indexof'] = (a) =>
        typeof a[0] === 'string' ? a[0].indexOf(a[1], a[2] || 0) : -1;

    // ════════════════════════════════════════════════════════
    // 4. ARRAY — Missing 12 functions
    // ════════════════════════════════════════════════════════
    allFunctions['array.new_box'] = (a) => new Array(a[0] || 0).fill(null);
    allFunctions['array.new_table'] = (a) => new Array(a[0] || 0).fill(null);
    allFunctions['array.new'] = (a) => new Array(a[0] || 0).fill(a[1] ?? null);
    allFunctions['array.lastindexof'] = (a) => (Array.isArray(a[0]) ? a[0].lastIndexOf(a[1]) : -1);
    allFunctions['array.variance'] = (a) => {
        if (!Array.isArray(a[0])) return NaN;
        const v = a[0].filter((x) => !isNa(x));
        if (!v.length) return NaN;
        const m = v.reduce((s, x) => s + x, 0) / v.length;
        return v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length;
    };
    allFunctions['array.range'] = (a) => {
        if (!Array.isArray(a[0])) return NaN;
        const v = a[0].filter((x) => !isNa(x));
        return v.length ? Math.max(...v) - Math.min(...v) : NaN;
    };
    allFunctions['array.covariance'] = (a) => {
        if (!Array.isArray(a[0]) || !Array.isArray(a[1])) return NaN;
        const x = a[0],
            y = a[1],
            n = Math.min(x.length, y.length);
        if (!n) return NaN;
        const mx = x.reduce((s, v) => s + nz(v), 0) / n,
            my = y.reduce((s, v) => s + nz(v), 0) / n;
        return x.reduce((s, v, i) => s + (nz(v) - mx) * (nz(y[i]) - my), 0) / n;
    };
    allFunctions['array.binary_search_leftmost'] = (a) => {
        if (!Array.isArray(a[0])) return -1;
        const arr = a[0],
            val = a[1];
        let lo = 0,
            hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            arr[mid] < val ? (lo = mid + 1) : (hi = mid);
        }
        return lo;
    };
    allFunctions['array.binary_search_rightmost'] = (a) => {
        if (!Array.isArray(a[0])) return -1;
        const arr = a[0],
            val = a[1];
        let lo = 0,
            hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            arr[mid] <= val ? (lo = mid + 1) : (hi = mid);
        }
        return lo - 1;
    };
    allFunctions['array.percentile_linear_interpolation'] = (a) => {
        if (!Array.isArray(a[0])) return NaN;
        const s = [...a[0]].filter((v) => !isNa(v)).sort((x, y) => x - y);
        if (!s.length) return NaN;
        const idx = (a[1] / 100) * (s.length - 1),
            lo = Math.floor(idx),
            hi = Math.ceil(idx);
        return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
    };
    allFunctions['array.percentile_nearest_rank'] = (a) => {
        if (!Array.isArray(a[0])) return NaN;
        const s = [...a[0]].filter((v) => !isNa(v)).sort((x, y) => x - y);
        return s.length
            ? s[Math.min(s.length - 1, Math.max(0, Math.ceil((a[1] / 100) * s.length) - 1))]
            : NaN;
    };
    allFunctions['array.percentrank'] = (a) => {
        if (!Array.isArray(a[0])) return NaN;
        const arr = a[0],
            val = a[1];
        let below = 0;
        arr.forEach((v) => {
            if (!isNa(v) && v < val) below++;
        });
        const total = arr.filter((v) => !isNa(v)).length;
        return total ? (below / total) * 100 : NaN;
    };

    // ════════════════════════════════════════════════════════
    // 5. MAP — Full namespace (11 functions)
    // ════════════════════════════════════════════════════════
    class KuriMap {
        constructor() {
            this._data = new Map();
        }
        put(k, v) {
            this._data.set(k, v);
            return this;
        }
        get(k) {
            return this._data.has(k) ? this._data.get(k) : NaN;
        }
        remove(k) {
            this._data.delete(k);
            return this;
        }
        contains(k) {
            return this._data.has(k);
        }
        size() {
            return this._data.size;
        }
        keys() {
            return [...this._data.keys()];
        }
        values() {
            return [...this._data.values()];
        }
        clear() {
            this._data.clear();
        }
        copy() {
            const m = new KuriMap();
            this._data.forEach((v, k) => m.put(k, v));
            return m;
        }
        put_all(other) {
            if (other && other._data) other._data.forEach((v, k) => this._data.set(k, v));
        }
    }
    allFunctions['map.new'] = (a) => new KuriMap();
    allFunctions['map.put'] = (a) => {
        if (a[0] && a[0].put) a[0].put(a[1], a[2]);
    };
    allFunctions['map.get'] = (a) => (a[0] && a[0].get ? a[0].get(a[1]) : NaN);
    allFunctions['map.remove'] = (a) => {
        if (a[0] && a[0].remove) a[0].remove(a[1]);
    };
    allFunctions['map.contains'] = (a) => (a[0] && a[0].contains ? a[0].contains(a[1]) : false);
    allFunctions['map.size'] = (a) => (a[0] && a[0].size ? a[0].size() : 0);
    allFunctions['map.keys'] = (a) => (a[0] && a[0].keys ? a[0].keys() : []);
    allFunctions['map.values'] = (a) => (a[0] && a[0].values ? a[0].values() : []);
    allFunctions['map.clear'] = (a) => {
        if (a[0] && a[0].clear) a[0].clear();
    };
    allFunctions['map.copy'] = (a) => (a[0] && a[0].copy ? a[0].copy() : new KuriMap());
    allFunctions['map.put_all'] = (a) => {
        if (a[0] && a[0].put_all && a[1]) a[0].put_all(a[1]);
    };

    // ════════════════════════════════════════════════════════
    // 6. MATRIX — Full namespace (46 functions)
    // ════════════════════════════════════════════════════════
    class KuriMatrix {
        constructor(rows = 0, cols = 0, val = 0) {
            this.data = [];
            for (let r = 0; r < rows; r++) {
                this.data.push(new Array(cols).fill(val));
            }
        }
        rows() {
            return this.data.length;
        }
        columns() {
            return this.data[0]?.length || 0;
        }
        get(r, c) {
            return this.data[r]?.[c] ?? NaN;
        }
        set(r, c, v) {
            if (this.data[r]) this.data[r][c] = v;
        }
        row(r) {
            return this.data[r] ? [...this.data[r]] : [];
        }
        col(c) {
            return this.data.map((r) => r[c] ?? NaN);
        }
        add_row(idx, arr) {
            this.data.splice(idx, 0, [...(arr || new Array(this.columns()).fill(0))]);
        }
        add_col(idx, arr) {
            this.data.forEach((r, i) => r.splice(idx, 0, arr ? (arr[i] ?? 0) : 0));
        }
        remove_row(idx) {
            this.data.splice(idx, 1);
        }
        remove_col(idx) {
            this.data.forEach((r) => r.splice(idx, 1));
        }
        swap_rows(a, b) {
            [this.data[a], this.data[b]] = [this.data[b], this.data[a]];
        }
        swap_columns(a, b) {
            this.data.forEach((r) => {
                [r[a], r[b]] = [r[b], r[a]];
            });
        }
        fill(v) {
            this.data.forEach((r) => r.fill(v));
        }
        copy() {
            const m = new KuriMatrix();
            m.data = this.data.map((r) => [...r]);
            return m;
        }
        submatrix(r1, c1, r2, c2) {
            const m = new KuriMatrix();
            for (let r = r1; r <= r2; r++) m.data.push(this.data[r]?.slice(c1, c2 + 1) || []);
            return m;
        }
        reverse() {
            this.data.reverse();
        }
        reshape(rows, cols) {
            const flat = this.data.flat();
            this.data = [];
            for (let r = 0; r < rows; r++) this.data.push(flat.splice(0, cols));
        }
        concat(other, dim = 0) {
            const m = this.copy();
            if (dim === 0) m.data.push(...other.data.map((r) => [...r]));
            else m.data.forEach((r, i) => r.push(...(other.data[i] || [])));
            return m;
        }
        transpose() {
            const t = new KuriMatrix(this.columns(), this.rows());
            for (let r = 0; r < this.rows(); r++)
                for (let c = 0; c < this.columns(); c++) t.set(c, r, this.get(r, c));
            return t;
        }
        sort(col, order) {
            this.data.sort((a, b) =>
                order === 'descending'
                    ? (b[col] || 0) - (a[col] || 0)
                    : (a[col] || 0) - (b[col] || 0)
            );
        }
        avg() {
            let s = 0,
                n = 0;
            this.data.forEach((r) =>
                r.forEach((v) => {
                    if (!isNa(v)) {
                        s += v;
                        n++;
                    }
                })
            );
            return n ? s / n : NaN;
        }
        max() {
            let m = -Infinity;
            this.data.forEach((r) =>
                r.forEach((v) => {
                    if (!isNa(v) && v > m) m = v;
                })
            );
            return m === -Infinity ? NaN : m;
        }
        min() {
            let m = Infinity;
            this.data.forEach((r) =>
                r.forEach((v) => {
                    if (!isNa(v) && v < m) m = v;
                })
            );
            return m === Infinity ? NaN : m;
        }
        sum() {
            let s = 0;
            this.data.forEach((r) =>
                r.forEach((v) => {
                    if (!isNa(v)) s += v;
                })
            );
            return s;
        }
        median() {
            const f = this.data
                .flat()
                .filter((v) => !isNa(v))
                .sort((a, b) => a - b);
            return f.length
                ? f.length % 2
                    ? f[f.length >> 1]
                    : (f[f.length / 2 - 1] + f[f.length / 2]) / 2
                : NaN;
        }
        mode() {
            const counts = {};
            this.data.flat().forEach((v) => {
                const k = Math.round(nz(v) * 100) / 100;
                counts[k] = (counts[k] || 0) + 1;
            });
            let mc = 0,
                mv = NaN;
            for (const [k, c] of Object.entries(counts))
                if (c > mc) {
                    mc = c;
                    mv = Number(k);
                }
            return mv;
        }
        det() {
            const n = this.rows();
            if (n !== this.columns()) return NaN;
            if (n === 1) return this.get(0, 0);
            if (n === 2) return this.get(0, 0) * this.get(1, 1) - this.get(0, 1) * this.get(1, 0);
            let d = 0;
            for (let j = 0; j < n; j++) {
                const sub = new KuriMatrix();
                for (let r = 1; r < n; r++) {
                    const row = [];
                    for (let c = 0; c < n; c++) if (c !== j) row.push(this.get(r, c));
                    sub.data.push(row);
                }
                d += (j % 2 === 0 ? 1 : -1) * this.get(0, j) * sub.det();
            }
            return d;
        }
        inv() {
            const n = this.rows();
            if (n !== this.columns()) return null;
            const d = this.det();
            if (d === 0 || isNa(d)) return null;
            const m = new KuriMatrix(n, n);
            if (n === 2) {
                m.set(0, 0, this.get(1, 1) / d);
                m.set(0, 1, -this.get(0, 1) / d);
                m.set(1, 0, -this.get(1, 0) / d);
                m.set(1, 1, this.get(0, 0) / d);
                return m;
            }
            return m; /* simplified for n>2 */
        }
        pinv() {
            return this.inv(); /* simplified pseudo-inverse */
        }
        rank() {
            let r = 0;
            const m = this.copy();
            const rows = m.rows(),
                cols = m.columns();
            for (let c = 0; c < cols && r < rows; c++) {
                let pivot = -1;
                for (let i = r; i < rows; i++) {
                    if (Math.abs(m.get(i, c)) > 1e-10) {
                        pivot = i;
                        break;
                    }
                }
                if (pivot === -1) continue;
                if (pivot !== r) m.swap_rows(pivot, r);
                const pv = m.get(r, c);
                for (let j = 0; j < cols; j++) m.set(r, j, m.get(r, j) / pv);
                for (let i = 0; i < rows; i++) {
                    if (i === r) continue;
                    const f = m.get(i, c);
                    for (let j = 0; j < cols; j++) m.set(i, j, m.get(i, j) - f * m.get(r, j));
                }
                r++;
            }
            return r;
        }
        trace() {
            let s = 0;
            for (let i = 0; i < Math.min(this.rows(), this.columns()); i++) s += nz(this.get(i, i));
            return s;
        }
        eigenvalues() {
            if (this.rows() === 2 && this.columns() === 2) {
                const a = this.get(0, 0),
                    b = this.get(0, 1),
                    c = this.get(1, 0),
                    d = this.get(1, 1);
                const tr = a + d,
                    det = a * d - b * c,
                    disc = tr * tr - 4 * det;
                if (disc < 0) return [NaN, NaN];
                return [(tr + Math.sqrt(disc)) / 2, (tr - Math.sqrt(disc)) / 2];
            }
            return [];
        }
        eigenvectors() {
            return new KuriMatrix(); /* simplified */
        }
        kron(other) {
            const m = new KuriMatrix();
            for (let r = 0; r < this.rows(); r++)
                for (let or = 0; or < other.rows(); or++) {
                    const row = [];
                    for (let c = 0; c < this.columns(); c++)
                        for (let oc = 0; oc < other.columns(); oc++)
                            row.push(this.get(r, c) * other.get(or, oc));
                    m.data.push(row);
                }
            return m;
        }
        mult(other) {
            if (other instanceof KuriMatrix) {
                const m = new KuriMatrix(this.rows(), other.columns());
                for (let r = 0; r < this.rows(); r++)
                    for (let c = 0; c < other.columns(); c++) {
                        let s = 0;
                        for (let k = 0; k < this.columns(); k++)
                            s += nz(this.get(r, k)) * nz(other.get(k, c));
                        m.set(r, c, s);
                    }
                return m;
            }
            const m = this.copy();
            m.data = m.data.map((r) => r.map((v) => nz(v) * nz(other)));
            return m;
        }
        diff(other) {
            const m = new KuriMatrix(this.rows(), this.columns());
            for (let r = 0; r < this.rows(); r++)
                for (let c = 0; c < this.columns(); c++)
                    m.set(r, c, nz(this.get(r, c)) - nz(other.get(r, c)));
            return m;
        }
        is_square() {
            return this.rows() === this.columns();
        }
        is_symmetric() {
            if (!this.is_square()) return false;
            for (let r = 0; r < this.rows(); r++)
                for (let c = r + 1; c < this.columns(); c++)
                    if (Math.abs(this.get(r, c) - this.get(c, r)) > 1e-10) return false;
            return true;
        }
        is_identity() {
            if (!this.is_square()) return false;
            for (let r = 0; r < this.rows(); r++)
                for (let c = 0; c < this.columns(); c++)
                    if (Math.abs(this.get(r, c) - (r === c ? 1 : 0)) > 1e-10) return false;
            return true;
        }
        is_binary() {
            return this.data.flat().every((v) => v === 0 || v === 1);
        }
        is_zero() {
            return this.data.flat().every((v) => Math.abs(nz(v)) < 1e-10);
        }
        is_triangular() {
            const n = this.rows();
            let upper = true,
                lower = true;
            for (let r = 0; r < n; r++)
                for (let c = 0; c < n; c++) {
                    if (r > c && Math.abs(this.get(r, c)) > 1e-10) upper = false;
                    if (r < c && Math.abs(this.get(r, c)) > 1e-10) lower = false;
                }
            return upper || lower;
        }
        is_stochastic() {
            for (const r of this.data) {
                const s = r.reduce((a, v) => a + nz(v), 0);
                if (Math.abs(s - 1) > 1e-6) return false;
                if (r.some((v) => v < 0)) return false;
            }
            return true;
        }
        is_antisymmetric() {
            if (!this.is_square()) return false;
            for (let r = 0; r < this.rows(); r++)
                for (let c = r; c < this.columns(); c++)
                    if (Math.abs(this.get(r, c) + this.get(c, r)) > 1e-10) return false;
            return true;
        }
        is_diagonal() {
            if (!this.is_square()) return false;
            for (let r = 0; r < this.rows(); r++)
                for (let c = 0; c < this.columns(); c++)
                    if (r !== c && Math.abs(this.get(r, c)) > 1e-10) return false;
            return true;
        }
    }

    const mx = (name, fn) => {
        allFunctions['matrix.' + name] = (a) => {
            const m = a[0];
            if (m instanceof KuriMatrix) return m[fn] ? m[fn](...a.slice(1)) : NaN;
            return NaN;
        };
    };
    allFunctions['matrix.new'] = (a) => new KuriMatrix(a[0] || 0, a[1] || 0, a[2] || 0);
    mx('row', 'row');
    mx('col', 'col');
    mx('get', 'get');
    mx('set', 'set');
    mx('rows', 'rows');
    mx('columns', 'columns');
    mx('add_row', 'add_row');
    mx('add_col', 'add_col');
    mx('remove_row', 'remove_row');
    mx('remove_col', 'remove_col');
    mx('swap_rows', 'swap_rows');
    mx('swap_columns', 'swap_columns');
    mx('fill', 'fill');
    mx('copy', 'copy');
    mx('submatrix', 'submatrix');
    mx('reverse', 'reverse');
    mx('reshape', 'reshape');
    mx('concat', 'concat');
    mx('sum', 'sum');
    mx('diff', 'diff');
    mx('mult', 'mult');
    mx('sort', 'sort');
    mx('avg', 'avg');
    mx('max', 'max');
    mx('min', 'min');
    mx('median', 'median');
    mx('mode', 'mode');
    mx('det', 'det');
    mx('inv', 'inv');
    mx('pinv', 'pinv');
    mx('rank', 'rank');
    mx('trace', 'trace');
    mx('eigenvalues', 'eigenvalues');
    mx('eigenvectors', 'eigenvectors');
    mx('kron', 'kron');
    mx('transpose', 'transpose');
    mx('is_square', 'is_square');
    mx('is_symmetric', 'is_symmetric');
    mx('is_identity', 'is_identity');
    mx('is_binary', 'is_binary');
    mx('is_zero', 'is_zero');
    mx('is_triangular', 'is_triangular');
    mx('is_stochastic', 'is_stochastic');
    mx('is_antisymmetric', 'is_antisymmetric');
    mx('is_diagonal', 'is_diagonal');

    // ════════════════════════════════════════════════════════
    // 7. TABLE — Full namespace (21 functions)
    // ════════════════════════════════════════════════════════
    class KuriTable {
        constructor(pos, cols, rows) {
            this.position = pos;
            this.numCols = cols;
            this.numRows = rows;
            this.cells = {};
            this.props = {
                bgcolor: 'transparent',
                border_color: '#808080',
                border_width: 1,
                frame_color: '#808080',
                frame_width: 1,
            };
        }
        cellKey(c, r) {
            return c + ',' + r;
        }
        setCell(col, row, opts = {}) {
            this.cells[this.cellKey(col, row)] = {
                text: opts.text || '',
                bgcolor: opts.bgcolor || 'transparent',
                text_color: opts.text_color || '#FFFFFF',
                text_size: opts.text_size || 'normal',
                text_halign: opts.text_halign || 'center',
                text_valign: opts.text_valign || 'center',
                text_font_family: opts.text_font_family || 'default',
                tooltip: opts.tooltip || '',
                width: opts.width || 0,
                height: opts.height || 0,
            };
        }
        getCell(col, row) {
            return this.cells[this.cellKey(col, row)] || null;
        }
        clear(startCol, startRow, endCol, endRow) {
            for (let c = startCol || 0; c <= (endCol || this.numCols - 1); c++)
                for (let r = startRow || 0; r <= (endRow || this.numRows - 1); r++)
                    delete this.cells[this.cellKey(c, r)];
        }
        delete() {
            this.cells = {};
        }
    }

    allFunctions['table.new'] = (a) => new KuriTable(a[0] || 'top_right', a[1] || 1, a[2] || 1);
    allFunctions['table.delete'] = (a) => {
        if (a[0] && a[0].delete) a[0].delete();
    };
    allFunctions['table.clear'] = (a) => {
        if (a[0] && a[0].clear) a[0].clear(a[1], a[2], a[3], a[4]);
    };
    allFunctions['table.cell'] = (a) => {
        if (a[0] && a[0].setCell)
            a[0].setCell(a[1], a[2], {
                text: a.named?.text || a[3] || '',
                bgcolor: a.named?.bgcolor,
                text_color: a.named?.text_color,
                text_size: a.named?.text_size,
                text_halign: a.named?.text_halign,
                text_valign: a.named?.text_valign,
                tooltip: a.named?.tooltip,
                width: a.named?.width,
                height: a.named?.height,
            });
    };
    allFunctions['table.cell_set_text'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.text = a[3] || '';
    };
    allFunctions['table.cell_set_bgcolor'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.bgcolor = a[3];
    };
    allFunctions['table.cell_set_text_color'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.text_color = a[3];
    };
    allFunctions['table.cell_set_text_size'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.text_size = a[3];
    };
    allFunctions['table.cell_set_text_halign'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.text_halign = a[3];
    };
    allFunctions['table.cell_set_text_valign'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.text_valign = a[3];
    };
    allFunctions['table.cell_set_text_font_family'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.text_font_family = a[3];
    };
    allFunctions['table.cell_set_tooltip'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.tooltip = a[3];
    };
    allFunctions['table.cell_set_height'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.height = a[3];
    };
    allFunctions['table.cell_set_width'] = (a) => {
        const c = a[0]?.getCell(a[1], a[2]);
        if (c) c.width = a[3];
    };
    allFunctions['table.merge_cells'] = (a) => {
        /* merging is visual-only, stored as metadata */
    };
    allFunctions['table.set_bgcolor'] = (a) => {
        if (a[0]) a[0].props.bgcolor = a[1];
    };
    allFunctions['table.set_border_color'] = (a) => {
        if (a[0]) a[0].props.border_color = a[1];
    };
    allFunctions['table.set_border_width'] = (a) => {
        if (a[0]) a[0].props.border_width = a[1];
    };
    allFunctions['table.set_frame_color'] = (a) => {
        if (a[0]) a[0].props.frame_color = a[1];
    };
    allFunctions['table.set_frame_width'] = (a) => {
        if (a[0]) a[0].props.frame_width = a[1];
    };
    allFunctions['table.set_position'] = (a) => {
        if (a[0]) a[0].position = a[1];
    };

    // ════════════════════════════════════════════════════════
    // 8. DRAWING EXTENSIONS — line, label, box, polyline, linefill
    // ════════════════════════════════════════════════════════

    // Line extensions
    allFunctions['line.set_xy1'] = (a) => {
        if (a[0]) {
            a[0].x1 = a[1];
            a[0].y1 = a[2];
        }
    };
    allFunctions['line.set_xy2'] = (a) => {
        if (a[0]) {
            a[0].x2 = a[1];
            a[0].y2 = a[2];
        }
    };
    allFunctions['line.set_first_point'] = (a) => {
        if (a[0] && a[1]) {
            a[0].x1 = a[1].index ?? a[1].time;
            a[0].y1 = a[1].price;
        }
    };
    allFunctions['line.set_second_point'] = (a) => {
        if (a[0] && a[1]) {
            a[0].x2 = a[1].index ?? a[1].time;
            a[0].y2 = a[1].price;
        }
    };
    allFunctions['line.all'] = (a) => []; // Would need drawing context

    // Label extensions
    allFunctions['label.set_xy'] = (a) => {
        if (a[0]) {
            a[0].x = a[1];
            a[0].y = a[2];
        }
    };
    allFunctions['label.set_point'] = (a) => {
        if (a[0] && a[1]) {
            a[0].x = a[1].index ?? a[1].time;
            a[0].y = a[1].price;
        }
    };
    allFunctions['label.set_text_font_family'] = (a) => {
        if (a[0]) a[0].font_family = a[1];
    };
    allFunctions['label.all'] = (a) => [];

    // Box extensions
    allFunctions['box.copy'] = (a) => {
        if (!a[0]) return null;
        const b = new root.Kuri.DrawingBox(a[0].left, a[0].top, a[0].right, a[0].bottom, {
            border_color: a[0].border_color,
            bgcolor: a[0].bgcolor,
            border_width: a[0].border_width,
        });
        return b;
    };
    allFunctions['box.get_left'] = (a) => (a[0] ? a[0].left : NaN);
    allFunctions['box.get_top'] = (a) => (a[0] ? a[0].top : NaN);
    allFunctions['box.get_right'] = (a) => (a[0] ? a[0].right : NaN);
    allFunctions['box.get_bottom'] = (a) => (a[0] ? a[0].bottom : NaN);
    allFunctions['box.set_lefttop'] = (a) => {
        if (a[0]) {
            a[0].left = a[1];
            a[0].top = a[2];
        }
    };
    allFunctions['box.set_rightbottom'] = (a) => {
        if (a[0]) {
            a[0].right = a[1];
            a[0].bottom = a[2];
        }
    };
    allFunctions['box.set_border_color'] = (a) => {
        if (a[0]) a[0].border_color = a[1];
    };
    allFunctions['box.set_border_width'] = (a) => {
        if (a[0]) a[0].border_width = a[1];
    };
    allFunctions['box.set_border_style'] = (a) => {
        if (a[0]) a[0].border_style = a[1];
    };
    allFunctions['box.set_text_color'] = (a) => {
        if (a[0]) a[0].text_color = a[1];
    };
    allFunctions['box.set_text_size'] = (a) => {
        if (a[0]) a[0].text_size = a[1];
    };
    allFunctions['box.set_text_font_family'] = (a) => {
        if (a[0]) a[0].text_font_family = a[1];
    };
    allFunctions['box.set_text_halign'] = (a) => {
        if (a[0]) a[0].text_halign = a[1];
    };
    allFunctions['box.set_text_valign'] = (a) => {
        if (a[0]) a[0].text_valign = a[1];
    };
    allFunctions['box.set_extend'] = (a) => {
        if (a[0]) a[0].extend = a[1];
    };
    allFunctions['box.all'] = (a) => [];

    // Polyline
    class KuriPolyline {
        constructor(pts, opts = {}) {
            this.points = pts || [];
            this.closed = opts.closed || false;
            this.color = opts.line_color || '#808080';
            this.style = opts.line_style || 'solid';
            this.width = opts.line_width || 1;
            this.deleted = false;
        }
        delete() {
            this.deleted = true;
        }
    }
    allFunctions['polyline.new'] = (a) => {
        const pts = a[0] || [];
        const opts = a.named || {};
        return new KuriPolyline(pts, opts);
    };
    allFunctions['polyline.delete'] = (a) => {
        if (a[0] && a[0].delete) a[0].delete();
    };
    allFunctions['polyline.all'] = (a) => [];

    // Linefill
    class KuriLinefill {
        constructor(l1, l2, color) {
            this.line1 = l1;
            this.line2 = l2;
            this.color = color || 'transparent';
            this.deleted = false;
        }
        delete() {
            this.deleted = true;
        }
        get_line1() {
            return this.line1;
        }
        get_line2() {
            return this.line2;
        }
        set_color(c) {
            this.color = c;
        }
    }
    allFunctions['linefill.new'] = (a) => new KuriLinefill(a[0], a[1], a[2]);
    allFunctions['linefill.delete'] = (a) => {
        if (a[0] && a[0].delete) a[0].delete();
    };
    allFunctions['linefill.set_color'] = (a) => {
        if (a[0] && a[0].set_color) a[0].set_color(a[1]);
    };
    allFunctions['linefill.get_line1'] = (a) => (a[0] ? a[0].get_line1() : null);
    allFunctions['linefill.get_line2'] = (a) => (a[0] ? a[0].get_line2() : null);
    allFunctions['linefill.all'] = (a) => [];

    // ════════════════════════════════════════════════════════
    // 9. STRATEGY — Full namespace (17 functions)
    // ════════════════════════════════════════════════════════
    class StrategyEngine {
        constructor() {
            this.positions = [];
            this.orders = [];
            this.equity = 100000;
            this.openTrades = [];
            this.closedTrades = [];
        }
        entry(id, dir, qty = 1, opts = {}) {
            this.orders.push({
                type: 'entry',
                id,
                direction: dir,
                qty,
                limit: opts.limit,
                stop: opts.stop,
            });
            this.openTrades.push({
                id,
                dir,
                qty,
                entry_price: opts.price || 0,
                entry_bar: opts.bar || 0,
            });
        }
        exit(id, opts = {}) {
            this.orders.push({ type: 'exit', id, ...opts });
        }
        close(id) {
            this.orders.push({ type: 'close', id });
        }
        close_all() {
            this.orders.push({ type: 'close_all' });
        }
        cancel(id) {
            this.orders = this.orders.filter((o) => o.id !== id);
        }
        cancel_all() {
            this.orders = [];
        }
        order(id, dir, qty, opts = {}) {
            this.orders.push({ type: 'order', id, direction: dir, qty, ...opts });
        }
    }

    const _strat = new StrategyEngine();
    allFunctions['strategy'] = (a) => null;
    allFunctions['strategy.entry'] = (a) => {
        _strat.entry(a[0], a[1], a[2] || 1, a.named || {});
    };
    allFunctions['strategy.exit'] = (a) => {
        _strat.exit(a[0], a.named || {});
    };
    allFunctions['strategy.close'] = (a) => {
        _strat.close(a[0]);
    };
    allFunctions['strategy.close_all'] = (a) => {
        _strat.close_all();
    };
    allFunctions['strategy.cancel'] = (a) => {
        _strat.cancel(a[0]);
    };
    allFunctions['strategy.cancel_all'] = (a) => {
        _strat.cancel_all();
    };
    allFunctions['strategy.order'] = (a) => {
        _strat.order(a[0], a[1], a[2], a.named || {});
    };
    allFunctions['strategy.risk.max_drawdown'] = (a) => {};
    allFunctions['strategy.risk.max_intraday_filled_orders'] = (a) => {};
    allFunctions['strategy.risk.max_intraday_loss'] = (a) => {};
    allFunctions['strategy.risk.max_position_size'] = (a) => {};
    allFunctions['strategy.risk.allow_entry_in'] = (a) => {};
    allFunctions['strategy.opentrades.entry_price'] = (a) => 0;
    allFunctions['strategy.opentrades.size'] = (a) => 0;
    allFunctions['strategy.closedtrades.entry_price'] = (a) => 0;
    allFunctions['strategy.closedtrades.exit_price'] = (a) => 0;

    // Mark drawing style constants
    runtimeConstants['mark.draw_line'] = 'line';
    runtimeConstants['mark.draw_bar'] = 'columns';
    runtimeConstants['mark.draw_columns'] = 'columns';
    runtimeConstants['mark.draw_circles'] = 'circles';
    runtimeConstants['mark.draw_area'] = 'area';
    runtimeConstants['mark.draw_stepline'] = 'stepline';
    runtimeConstants['mark.draw_cross'] = 'cross';
    runtimeConstants['mark.draw_xcross'] = 'xcross';
    runtimeConstants['mark.draw_histogram'] = 'histogram';

    // Strategy constants
    runtimeConstants['strategy.long'] = 'long';
    runtimeConstants['strategy.short'] = 'short';
    runtimeConstants['strategy.cash'] = 'cash';
    runtimeConstants['strategy.percent_of_equity'] = 'percent_of_equity';
    runtimeConstants['strategy.fixed'] = 'fixed';
    runtimeConstants['strategy.equity'] = 100000;
    runtimeConstants['strategy.position_size'] = 0;
    runtimeConstants['strategy.initial_capital'] = 100000;

    // ════════════════════════════════════════════════════════
    // 10. REQUEST — Server-side data functions
    // ════════════════════════════════════════════════════════
    allFunctions['request.security_lower_tf'] = (a) => NaN;
    allFunctions['request.currency_rate'] = (a) => 1.0;
    allFunctions['request.dividends'] = (a) => NaN;
    allFunctions['request.earnings'] = (a) => NaN;
    allFunctions['request.financial'] = (a) => NaN;
    allFunctions['request.quandl'] = (a) => NaN;
    allFunctions['request.splits'] = (a) => NaN;
    allFunctions['request.seed'] = (a) => NaN;

    // ════════════════════════════════════════════════════════
    // 11. LOG, RUNTIME, CHART.POINT
    // ════════════════════════════════════════════════════════
    allFunctions['log.info'] = (a) => {
        console.log('[Kuri INFO]', a[0]);
    };
    allFunctions['log.warning'] = (a) => {
        console.warn('[Kuri WARN]', a[0]);
    };
    allFunctions['log.error'] = (a) => {
        console.error('[Kuri ERROR]', a[0]);
    };
    allFunctions['runtime.error'] = (a) => {
        throw new Error(a[0] || 'Runtime error');
    };

    class ChartPoint {
        constructor(t, idx, price) {
            this.time = t;
            this.index = idx;
            this.price = price;
        }
    }
    allFunctions['chart.point.new'] = (a) => new ChartPoint(a[0], a[1], a[2]);
    allFunctions['chart.point.from_index'] = (a) => new ChartPoint(null, a[0], a[1]);
    allFunctions['chart.point.from_time'] = (a) => new ChartPoint(a[0], null, a[1]);
    allFunctions['chart.point.copy'] = (a) =>
        a[0] ? new ChartPoint(a[0].time, a[0].index, a[0].price) : null;

    // ════════════════════════════════════════════════════════
    // 12. TICKER — Full namespace
    // ════════════════════════════════════════════════════════
    allFunctions['ticker.standard'] = (a) => a[0] || '';
    allFunctions['ticker.modify'] = (a) => a[0] || '';
    allFunctions['ticker.heikinashi'] = (a) => (a[0] ? a[0] + ':heikinashi' : ':heikinashi');
    allFunctions['ticker.renko'] = (a) => (a[0] ? a[0] + ':renko' : ':renko');
    allFunctions['ticker.linebreak'] = (a) => (a[0] ? a[0] + ':linebreak' : ':linebreak');
    allFunctions['ticker.kagi'] = (a) => (a[0] ? a[0] + ':kagi' : ':kagi');
    allFunctions['ticker.pointfigure'] = (a) => (a[0] ? a[0] + ':pointfigure' : ':pointfigure');

    // ════════════════════════════════════════════════════════
    // 13. INPUT — input.enum (v6 new feature)
    // ════════════════════════════════════════════════════════
    allFunctions['input.enum'] = (a) => a[0]; // Returns default enum value

    // ════════════════════════════════════════════════════════
    // 14. ADDITIONAL CONSTANTS
    // ════════════════════════════════════════════════════════
    // Table positions
    runtimeConstants['position.top_left'] = 'top_left';
    runtimeConstants['position.top_center'] = 'top_center';
    runtimeConstants['position.top_right'] = 'top_right';
    runtimeConstants['position.middle_left'] = 'middle_left';
    runtimeConstants['position.middle_center'] = 'middle_center';
    runtimeConstants['position.middle_right'] = 'middle_right';
    runtimeConstants['position.bottom_left'] = 'bottom_left';
    runtimeConstants['position.bottom_center'] = 'bottom_center';
    runtimeConstants['position.bottom_right'] = 'bottom_right';

    // Text formatting (v6)
    runtimeConstants['text.format_bold'] = 'bold';
    runtimeConstants['text.format_italic'] = 'italic';
    runtimeConstants['text.format_none'] = 'none';
    runtimeConstants['font.family_default'] = 'default';
    runtimeConstants['font.family_monospace'] = 'monospace';

    // Display constants
    runtimeConstants['display.all'] = 'all';
    runtimeConstants['display.none'] = 'none';
    runtimeConstants['display.pane'] = 'pane';
    runtimeConstants['display.data_window'] = 'data_window';
    runtimeConstants['display.price_scale'] = 'price_scale';
    runtimeConstants['display.status_line'] = 'status_line';

    // Chart info
    runtimeConstants['chart.bg_color'] = '#131722';
    runtimeConstants['chart.fg_color'] = '#FFFFFF';
    runtimeConstants['chart.is_heikinashi'] = false;
    runtimeConstants['chart.is_renko'] = false;
    runtimeConstants['chart.is_linebreak'] = false;
    runtimeConstants['chart.is_kagi'] = false;
    runtimeConstants['chart.is_pnf'] = false;
    runtimeConstants['chart.is_range'] = false;
    runtimeConstants['chart.is_standard'] = true;

    // Session constants
    runtimeConstants['session.regular'] = 'regular';
    runtimeConstants['session.extended'] = 'extended';
    runtimeConstants['session.ismarket'] = true;
    runtimeConstants['session.ispremarket'] = false;
    runtimeConstants['session.ispostmarket'] = false;

    // Barmerge
    runtimeConstants['barmerge.gaps_on'] = true;
    runtimeConstants['barmerge.gaps_off'] = false;
    runtimeConstants['barmerge.lookahead_on'] = true;
    runtimeConstants['barmerge.lookahead_off'] = false;

    // Adjustment
    runtimeConstants['adjustment.none'] = 'none';
    runtimeConstants['adjustment.splits'] = 'splits';
    runtimeConstants['adjustment.dividends'] = 'dividends';

    // Currency
    runtimeConstants['currency.USD'] = 'USD';
    runtimeConstants['currency.EUR'] = 'EUR';
    runtimeConstants['currency.GBP'] = 'GBP';
    runtimeConstants['currency.JPY'] = 'JPY';
    runtimeConstants['currency.CAD'] = 'CAD';
    runtimeConstants['currency.AUD'] = 'AUD';
    runtimeConstants['currency.CHF'] = 'CHF';
    runtimeConstants['currency.CNY'] = 'CNY';
    runtimeConstants['currency.HKD'] = 'HKD';
    runtimeConstants['currency.NZD'] = 'NZD';
    runtimeConstants['currency.RUB'] = 'RUB';
    runtimeConstants['currency.NONE'] = '';

    // Earnings
    runtimeConstants['earnings.actual'] = 'actual';
    runtimeConstants['earnings.estimate'] = 'estimate';
    runtimeConstants['earnings.standardized'] = 'standardized';

    // Polyline
    runtimeConstants['polyline.all'] = 'all';

    // ============================================================
    // FINAL EXPORT
    // ============================================================
    const Kuri = {
        KuriEngine,
        Lexer,
        Parser,
        KuriInterpreter,
        Environment,
        TokenType: T,
        NodeType: N,
        builtinFunctions: allFunctions,
        colorConstants,
        runtimeConstants,
        DrawingLine,
        DrawingLabel,
        DrawingBox,
        generateSampleOHLCV,
        nz,
        isNa,
        KuriMap,
        KuriMatrix,
        KuriTable,
        KuriPolyline,
        KuriLinefill,
        ChartPoint,
        StrategyEngine,
        VERSION: '2.1.0',
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Kuri;
    else root.Kuri = Kuri;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
