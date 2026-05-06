class DslSyntaxError extends Error {
    constructor(message, position) {
        super(`${message} at position ${position}`);
        this.name = "DslSyntaxError";
        this.position = position;
        this.rawMessage = message;
    }
}

class LdapDslConverter {
    static toLdap(input) {
        const parser = new LdapDslParser(input);
        const ast = parser.parse();
        return compileLdap(ast);
    }
}

class LdapDslParser {
    constructor(input) {
        this.input = input ?? "";
        this.tokens = tokenize(this.input);
        this.pos = 0;
    }

    static tryParse(input) {
        try {
            const parser = new LdapDslParser(input);
            const ast = parser.parse();

            return {
                ok: true,
                ast,
                error: null
            };
        } catch (error) {
            if (error instanceof DslSyntaxError) {
                return {
                    ok: false,
                    ast: null,
                    error: {
                        message: error.rawMessage,
                        position: error.position,
                        fullMessage: error.message
                    }
                };
            }

            throw error;
        }
    }

    parse() {
        this.skipNewlines();
        const node = this.parseExpression();
        this.skipNewlines();

        if (!this.isEof()) {
            throw new DslSyntaxError("Unexpected trailing token", this.peek().position);
        }

        return node;
    }

    parseExpression() {
        const children = [this.parsePrimaryExpression()];

        while (this.matchOrOperator()) {
            this.skipNewlines();

            let child;

            if (this.matchWord("not")) {
                this.skipNewlines();
                child = {
                    type: "not",
                    child: this.parsePrimaryExpression()
                };
            } else {
                child = this.parsePrimaryExpression();
            }

            children.push(child);
        }

        if (children.length === 1) {
            return children[0];
        }

        return {
            type: "or",
            children
        };
    }

    matchOrOperator() {
        const start = this.pos;

        this.skipNewlines();

        if (this.matchWord("or")) {
            return true;
        }

        this.pos = start;
        return false;
    }

    parsePrimaryExpression() {
        if (this.matchWord("all")) {
            return this.parseGroup("and");
        }

        if (this.checkSymbol("{")) {
            return this.parseGroup("and");
        }

        if (this.matchWord("not")) {
            const child = this.parsePrimaryExpression();

            return {
                type: "not",
                child
            };
        }

        return this.parseComparison();
    }

    parseGroup(type) {
        this.expectSymbol("{");
        this.skipNewlines();

        const children = [];

        while (!this.checkSymbol("}")) {
            if (this.isEof()) {
                throw new DslSyntaxError("Missing closing '}'", this.previousPosition());
            }

            children.push(this.parseExpression());

            if (this.checkSymbol("}")) {
                break;
            }

            if (!this.consumeNewline()) {
                throw new DslSyntaxError("Expected newline between expressions", this.currentPosition());
            }

            this.skipNewlines();
        }

        this.expectSymbol("}");

        if (children.length === 0) {
            throw new DslSyntaxError(`${type} group must contain at least one expression`, this.previousPosition());
        }

        return {
            type,
            children
        };
    }

    parseComparison() {
        const attribute = this.expectIdentifier("Expected attribute name").value;

        if (this.matchSymbol(":")) {
            if (this.matchSymbol(">=")) {
                const value = this.expectString("Expected value after ': >='").value;

                return {
                    type: "greaterOrEqual",
                    attribute,
                    value
                };
            }

            if (this.matchSymbol("<=")) {
                const value = this.expectString("Expected value after ': <='").value;

                return {
                    type: "lessOrEqual",
                    attribute,
                    value
                };
            }

            if (this.matchSymbol("<")) {
                const value = this.expectString("Expected value after ': <'").value;

                return {
                    type: "not",
                    child: {
                        type: "greaterOrEqual",
                        attribute,
                        value
                    }
                };
            }

            if (this.matchSymbol(">")) {
                const value = this.expectString("Expected value after ': >'").value;

                return {
                    type: "not",
                    child: {
                        type: "lessOrEqual",
                        attribute,
                        value
                    }
                };
            }

            if (this.matchWord("all")) {
                this.expectWord("of");

                return this.parseSetEquality(attribute, "and", ": all of");
            }

            if (this.matchWord("any")) {
                if (!this.matchWord("of")) {
                    return {
                        type: "present",
                        attribute
                    };
                }

                return this.parseSetEquality(attribute, "or", ": any of");
            }

            if (this.matchWord("not")) {
                if (this.matchWord("similar")) {
                    this.expectWord("to");

                    const value = this.expectString("Expected value after ': not similar to'").value;

                    return {
                        type: "not",
                        child: {
                            type: "approx",
                            attribute,
                            value
                        }
                    };
                }

                if (this.matchWord("all")) {
                    this.expectWord("of");

                    return {
                        type: "not",
                        child: this.parseSetEquality(attribute, "and", ": not all of")
                    };
                }

                if (this.matchWord("any")) {
                    if (!this.matchWord("of")) {
                        return {
                            type: "not",
                            child: {
                                type: "present",
                                attribute
                            }
                        };
                    }

                    return {
                        type: "not",
                        child: this.parseSetEquality(attribute, "or", ": not any of")
                    };
                }

                const value = this.expectString("Expected value after ': not'").value;

                return {
                    type: "not",
                    child: {
                        type: "equal",
                        attribute,
                        value
                    }
                };
            }

            if (this.matchWord("similar")) {
                this.expectWord("to");

                const value = this.expectString("Expected value after ': similar to'").value;

                return {
                    type: "approx",
                    attribute,
                    value
                };
            }

            const value = this.expectString("Expected value after ':'").value;

            return {
                type: "equal",
                attribute,
                value
            };
        }

        if (this.matchSymbol("~=")) {
            const value = this.expectString("Expected value after '~='").value;

            return {
                type: "approx",
                attribute,
                value
            };
        }

        throw new DslSyntaxError("Expected comparison operator", this.currentPosition());
    }

    parseSetEquality(attribute, type, operatorText) {
        const values = [
            this.expectString(`Expected value after '${operatorText}'`).value
        ];

        while (this.matchSymbol(",")) {
            values.push(this.expectString(`Expected value after ',' in '${operatorText}'`).value);
        }

        return {
            type,
            children: values.map((value) => ({
                type: "equal",
                attribute,
                value
            }))
        };
    }

    consumeNewline() {
        if (this.peek()?.type !== "newline") {
            return false;
        }

        this.pos++;
        return true;
    }

    skipNewlines() {
        while (this.consumeNewline()) {
            // Keep consuming blank lines.
        }
    }

    matchWord(value) {
        if (this.checkWord(value)) {
            this.pos++;
            return true;
        }

        return false;
    }

    expectWord(value) {
        if (!this.matchWord(value)) {
            throw new DslSyntaxError(`Expected '${value}'`, this.currentPosition());
        }
    }

    checkWord(value) {
        const token = this.peek();
        return token?.type === "word" && token.value.toLowerCase() === value.toLowerCase();
    }

    matchSymbol(value) {
        if (this.checkSymbol(value)) {
            this.pos++;
            return true;
        }

        return false;
    }

    expectSymbol(value) {
        if (!this.matchSymbol(value)) {
            throw new DslSyntaxError(`Expected '${value}'`, this.currentPosition());
        }
    }

    checkSymbol(value) {
        const token = this.peek();
        return token?.type === "symbol" && token.value === value;
    }

    expectIdentifier(message) {
        const token = this.peek();

        if (token?.type !== "word") {
            throw new DslSyntaxError(message, this.currentPosition());
        }

        if (!/^[a-zA-Z][a-zA-Z0-9;-]*$/.test(token.value)) {
            throw new DslSyntaxError(`Invalid attribute name '${token.value}'`, token.position);
        }

        this.pos++;
        return token;
    }

    expectString(message) {
        const token = this.peek();

        if (token?.type !== "string") {
            throw new DslSyntaxError(message, this.currentPosition());
        }

        this.pos++;
        return token;
    }

    peek() {
        return this.tokens[this.pos];
    }

    isEof() {
        return this.pos >= this.tokens.length;
    }

    currentPosition() {
        return this.peek()?.position ?? this.input.length;
    }

    previousPosition() {
        return this.tokens[this.pos - 1]?.position ?? this.input.length;
    }
}

function tokenize(input) {
    const tokens = [];
    let pos = 0;

    while (pos < input.length) {
        const ch = input[pos];

        if (ch === "\r" || ch === "\n") {
            const start = pos;

            if (ch === "\r" && input[pos + 1] === "\n") {
                pos += 2;
            } else {
                pos++;
            }

            tokens.push({ type: "newline", value: "\n", position: start });
            continue;
        }

        if (/\s/.test(ch)) {
            pos++;
            continue;
        }

        if (ch === "{") {
            tokens.push({ type: "symbol", value: "{", position: pos });
            pos++;
            continue;
        }

        if (ch === "}" || ch === "," || ch === ":") {
            tokens.push({ type: "symbol", value: ch, position: pos });
            pos++;
            continue;
        }

        if (input.startsWith(">=", pos) || input.startsWith("<=", pos) || input.startsWith("~=", pos)) {
            tokens.push({ type: "symbol", value: input.slice(pos, pos + 2), position: pos });
            pos += 2;
            continue;
        }

        if (ch === "<" || ch === ">") {
            tokens.push({ type: "symbol", value: ch, position: pos });
            pos++;
            continue;
        }

        if (ch === '"') {
            tokens.push(readString(input, pos));
            pos = tokens[tokens.length - 1].end;
            continue;
        }

        if (/[a-zA-Z_]/.test(ch)) {
            const start = pos;
            let value = "";

            while (pos < input.length && /[a-zA-Z0-9_;-]/.test(input[pos])) {
                value += input[pos];
                pos++;
            }

            tokens.push({
                type: "word",
                value,
                position: start
            });

            continue;
        }

        throw new DslSyntaxError(`Unexpected character '${ch}'`, pos);
    }

    return tokens;
}

function readString(input, start) {
    let pos = start + 1;
    let value = "";

    while (pos < input.length) {
        const ch = input[pos];

        if (ch === '"') {
            return {
                type: "string",
                value,
                position: start,
                end: pos + 1
            };
        }

        if (ch === "\\") {
            const next = input[pos + 1];

            if (next === undefined) {
                throw new DslSyntaxError("Incomplete string escape", pos);
            }

            if (next === '"' || next === "\\") {
                value += next;
                pos += 2;
                continue;
            }

            throw new DslSyntaxError(`Unsupported string escape '\\${next}'`, pos);
        }

        value += ch;
        pos++;
    }

    throw new DslSyntaxError("Unterminated string literal", start);
}

function substringNode(attribute, initial, any, final) {
    return {
        type: "substring",
        attribute,
        initial,
        any,
        final,
        rawValue: buildRawSubstringValue(initial, any, final)
    };
}

function buildRawSubstringValue(initial, any, final) {
    const parts = [];

    if (initial !== null) {
        parts.push(initial);
    }

    parts.push("*");

    for (const item of any) {
        parts.push(item);
        parts.push("*");
    }

    if (final !== null) {
        parts.push(final);
    }

    return parts.join("");
}

function compileLdap(node) {
    switch (node.type) {
        case "and":
            return `(&${node.children.map(compileLdap).join("")})`;

        case "or":
            return `(|${node.children.map(compileLdap).join("")})`;

        case "not":
            return `(!${compileLdap(node.child)})`;

        case "present":
            return `(${node.attribute}=*)`;

        case "equal":
            return `(${node.attribute}=${escapeLdapValueWithWildcards(node.value)})`;

        case "substring":
            return compileSubstring(node);

        case "greaterOrEqual":
            return `(${node.attribute}>=${escapeLdapValue(node.value)})`;

        case "lessOrEqual":
            return `(${node.attribute}<=${escapeLdapValue(node.value)})`;

        case "approx":
            return `(${node.attribute}~=${escapeLdapValue(node.value)})`;

        default:
            throw new Error(`Unsupported AST node type '${node.type}'`);
    }
}

function compileSubstring(node) {
    let value = "";

    if (node.initial !== null) {
        value += escapeLdapValue(node.initial);
    }

    value += "*";

    for (const item of node.any) {
        value += escapeLdapValue(item);
        value += "*";
    }

    if (node.final !== null) {
        value += escapeLdapValue(node.final);
    }

    return `(${node.attribute}=${value})`;
}

function escapeLdapValue(value) {
    return String(value)
        .replace(/\\/g, "\\5c")
        .replace(/\*/g, "\\2a")
        .replace(/\(/g, "\\28")
        .replace(/\)/g, "\\29")
        .replace(/\0/g, "\\00");
}

function escapeLdapValueWithWildcards(value) {
    return String(value)
        .replace(/\\/g, "\\5c")
        .replace(/\(/g, "\\28")
        .replace(/\)/g, "\\29")
        .replace(/\0/g, "\\00");
}
