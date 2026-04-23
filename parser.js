class LdapFilterSyntaxError extends Error {
    constructor(message, position) {
        super(`${message} at position ${position}`);
        this.name = "LdapFilterSyntaxError";
        this.position = position;
        this.rawMessage = message;
    }
}

class LdapFilterParser {
    constructor(input) {
        this.input = input ?? "";
        this.pos = 0;
    }

    parse() {
        this._skipWhitespace();
        const node = this._parseFilter();
        this._skipWhitespace();

        if (!this._isEof()) {
            throw new LdapFilterSyntaxError("Unexpected trailing characters", this.pos);
        }

        return node;
    }

    static tryParse(input) {
        try {
            const parser = new LdapFilterParser(input);
            const ast = parser.parse();

            return {
                ok: true,
                ast,
                error: null
            };
        } catch (error) {
            if (error instanceof LdapFilterSyntaxError) {
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

    _parseFilter() {
        this._skipWhitespace();
        this._expect("(");
        this._skipWhitespace();

        const ch = this._peek();
        let node;

        if (ch === "&") {
            node = this._parseAnd();
        } else if (ch === "|") {
            node = this._parseOr();
        } else if (ch === "!") {
            node = this._parseNot();
        } else {
            node = this._parseItem();
        }

        this._skipWhitespace();
        this._expect(")");
        return node;
    }

    _parseAnd() {
        this._expect("&");
        const children = this._parseFilterList();

        if (children.length === 0) {
            throw new LdapFilterSyntaxError("AND filter must contain at least one child", this.pos);
        }

        return {
            type: "and",
            children
        };
    }

    _parseOr() {
        this._expect("|");
        const children = this._parseFilterList();

        if (children.length === 0) {
            throw new LdapFilterSyntaxError("OR filter must contain at least one child", this.pos);
        }

        return {
            type: "or",
            children
        };
    }

    _parseNot() {
        this._expect("!");
        this._skipWhitespace();

        if (this._peek() !== "(") {
            throw new LdapFilterSyntaxError("NOT filter must contain exactly one child filter", this.pos);
        }

        const child = this._parseFilter();

        return {
            type: "not",
            child
        };
    }

    _parseFilterList() {
        const children = [];

        while (true) {
            this._skipWhitespace();

            if (this._peek() !== "(") {
                break;
            }

            children.push(this._parseFilter());
        }

        return children;
    }

    _parseItem() {
        const attribute = this._parseAttribute();
        const operator = this._parseOperator();
        const value = this._parseValueUntilRightParen({
            allowWildcard: operator === "="
        });

        if (operator === "=") {
            if (value === "*") {
                return {
                    type: "present",
                    attribute
                };
            }

            if (value.includes("*")) {
                return this._buildSubstringNode(attribute, value);
            }

            return {
                type: "equal",
                attribute,
                value
            };
        }

        if (operator === ">=") {
            return {
                type: "greaterOrEqual",
                attribute,
                value
            };
        }

        if (operator === "<=") {
            return {
                type: "lessOrEqual",
                attribute,
                value
            };
        }

        if (operator === "~=") {
            return {
                type: "approx",
                attribute,
                value
            };
        }

        throw new LdapFilterSyntaxError(`Unsupported operator '${operator}'`, this.pos);
    }

    _buildSubstringNode(attribute, rawValue) {
        const parts = [];
        let current = "";

        for (let i = 0; i < rawValue.length; i++) {
            const ch = rawValue[i];

            if (ch === "\\") {
                if (i + 2 >= rawValue.length) {
                    throw new LdapFilterSyntaxError("Incomplete escape sequence in substring value", this.pos);
                }

                current += rawValue[i];
                current += rawValue[i + 1];
                current += rawValue[i + 2];
                i += 2;
                continue;
            }

            if (ch === "*") {
                parts.push(current);
                current = "";
                continue;
            }

            current += ch;
        }

        parts.push(current);

        const startsWithWildcard = rawValue.startsWith("*");
        const endsWithWildcard = rawValue.endsWith("*");

        return {
            type: "substring",
            attribute,
            initial: startsWithWildcard ? null : parts[0],
            any: parts.slice(startsWithWildcard ? 0 : 1, endsWithWildcard ? parts.length : parts.length - 1),
            final: endsWithWildcard ? null : parts[parts.length - 1],
            rawValue
        };
    }

    _parseAttribute() {
        const start = this.pos;
        let value = "";

        while (!this._isEof()) {
            const ch = this._peek();

            if (ch === "=" || ch === ">" || ch === "<" || ch === "~" || ch === ")") {
                break;
            }

            value += ch;
            this.pos++;
        }

        value = value.trim();

        if (value.length === 0) {
            throw new LdapFilterSyntaxError("Missing attribute name", start);
        }

        if (!/^[a-zA-Z][a-zA-Z0-9;-]*$/.test(value)) {
            throw new LdapFilterSyntaxError(`Invalid attribute name '${value}'`, start);
        }

        return value;
    }

    _parseOperator() {
        if (this._match("=")) {
            return "=";
        }

        if (this._match(">=")) {
            return ">=";
        }

        if (this._match("<=")) {
            return "<=";
        }

        if (this._match("~=")) {
            return "~=";
        }

        throw new LdapFilterSyntaxError("Expected filter operator", this.pos);
    }

    _parseValueUntilRightParen(options = {}) {
        const { allowWildcard = false } = options;
        const start = this.pos;
        let value = "";

        while (!this._isEof()) {
            const ch = this._peek();

            if (ch === ")") {
                break;
            }

            if (ch === "\\") {
                value += this._parseEscapeSequence();
                continue;
            }

            if (ch === "(" || ch === "\0" || (!allowWildcard && ch === "*")) {
                throw new LdapFilterSyntaxError(
                    `Unescaped reserved character '${ch === "\0" ? "\\0" : ch}' inside assertion value`,
                    this.pos
                );
            }

            value += ch;
            this.pos++;
        }

        if (this._isEof()) {
            throw new LdapFilterSyntaxError("Missing closing ')'", start);
        }

        return value;
    }

    _parseEscapeSequence() {
        const start = this.pos;
        this._expect("\\");

        const a = this._peek();
        const b = this._peek(1);

        if (!this._isHexDigit(a) || !this._isHexDigit(b)) {
            throw new LdapFilterSyntaxError("Invalid escape sequence, expected two hex digits", start);
        }

        const result = "\\" + a + b;
        this.pos += 2;
        return result;
    }

    _isHexDigit(ch) {
        return /^[0-9A-Fa-f]$/.test(ch ?? "");
    }

    _skipWhitespace() {
        while (!this._isEof() && /\s/.test(this._peek())) {
            this.pos++;
        }
    }

    _expect(expected) {
        if (!this._match(expected)) {
            throw new LdapFilterSyntaxError(`Expected '${expected}'`, this.pos);
        }
    }

    _match(text) {
        if (this.input.slice(this.pos, this.pos + text.length) === text) {
            this.pos += text.length;
            return true;
        }

        return false;
    }

    _peek(offset = 0) {
        return this.input[this.pos + offset];
    }

    _isEof() {
        return this.pos >= this.input.length;
    }
}

