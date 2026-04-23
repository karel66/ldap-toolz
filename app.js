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

function formatLdapFilter(ast, indent = 0) {
    const pad = "  ".repeat(indent);

    switch (ast.type) {
        case "and":
            return [
                `${pad}(&`,
                ...ast.children.map((child) => formatLdapFilter(child, indent + 1)),
                `${pad})`
            ].join("\n");

        case "or":
            return [
                `${pad}(|`,
                ...ast.children.map((child) => formatLdapFilter(child, indent + 1)),
                `${pad})`
            ].join("\n");

        case "not":
            return [
                `${pad}(!`,
                formatLdapFilter(ast.child, indent + 1),
                `${pad})`
            ].join("\n");

        case "equal":
            return `${pad}(${ast.attribute}=${ast.value})`;

        case "present":
            return `${pad}(${ast.attribute}=*)`;

        case "greaterOrEqual":
            return `${pad}(${ast.attribute}>=${ast.value})`;

        case "lessOrEqual":
            return `${pad}(${ast.attribute}<=${ast.value})`;

        case "approx":
            return `${pad}(${ast.attribute}~=${ast.value})`;

        case "substring":
            return `${pad}(${ast.attribute}=${ast.rawValue})`;

        default:
            throw new Error(`Unknown AST node type '${ast.type}'`);
    }
}

function escapeLdapFilterValue(value) {
    if (value == null) {
        return "";
    }

    return String(value)
        .replace(/\\/g, "\\5c")
        .replace(/\*/g, "\\2a")
        .replace(/\(/g, "\\28")
        .replace(/\)/g, "\\29")
        .replace(/\0/g, "\\00");
}

function validateLdapFilter(input) {
    return LdapFilterParser.tryParse(input);
}

const filterInput = document.getElementById("filterInput");
const parseBtn = document.getElementById("parseBtn");
const formatBtn = document.getElementById("formatBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBadge = document.getElementById("statusBadge");
const formattedOutput = document.getElementById("formattedOutput");
const astOutput = document.getElementById("astOutput");
const errorBox = document.getElementById("errorBox");
const errorMessage = document.getElementById("errorMessage");
const errorCaret = document.getElementById("errorCaret");
const escapeInput = document.getElementById("escapeInput");
const escapeOutput = document.getElementById("escapeOutput");
const lengthValue = document.getElementById("lengthValue");
const formatAndCopyBtn = document.getElementById("formatAndCopyBtn");
const copyEscapeBtn = document.getElementById("copyEscapeBtn");

let lastAstJson = "";
let debounceHandle = null;

function setStatus(text, kind) {
    statusBadge.textContent = text;
    statusBadge.className = `status ${kind}`;
}

function makeCaretPointer(source, position) {
    const safePos = Math.max(0, Math.min(position, source.length));
    const prefix = source.slice(0, safePos);
    const lineStart = prefix.lastIndexOf("\n") + 1;
    const lineEndIndex = source.indexOf("\n", safePos);
    const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
    const line = source.slice(lineStart, lineEnd);
    const col = safePos - lineStart;

    return `${line}\n${" ".repeat(col)}^`;
}

function updateEscapeHelper() {
    escapeOutput.value = escapeLdapFilterValue(escapeInput.value);
}

function render() {
    const value = filterInput.value;
    lengthValue.textContent = String(value.length);

    if (value.trim() === "") {
        setStatus("Empty input", "warn");
        formattedOutput.textContent = "";
        astOutput.textContent = "";
        errorBox.style.display = "none";
        lastAstJson = "";
        return;
    }

    const result = validateLdapFilter(value);

    if (!result.ok) {
        setStatus("Invalid filter", "error");
        formattedOutput.textContent = "";
        astOutput.textContent = "";
        lastAstJson = "";

        errorBox.style.display = "block";
        errorMessage.textContent = result.error.fullMessage;
        errorCaret.textContent = makeCaretPointer(value, result.error.position);
        return;
    }

    setStatus("Valid filter", "ok");
    formattedOutput.textContent = formatLdapFilter(result.ast);
    lastAstJson = JSON.stringify(result.ast, null, 2);
    astOutput.textContent = lastAstJson;
    errorBox.style.display = "none";
}

function renderDebounced() {
    window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(render, 220);
}

async function copyText(text, successLabel, button) {
    if (!text) {
        return;
    }

    const original = button.textContent;

    try {
        await navigator.clipboard.writeText(text);
        button.textContent = successLabel;
        window.setTimeout(() => {
            button.textContent = original;
        }, 1200);
    } catch {
        button.textContent = "Copy failed";
        window.setTimeout(() => {
            button.textContent = original;
        }, 1200);
    }
}

parseBtn.addEventListener("click", render);

formatBtn.addEventListener("click", () => {
    const result = validateLdapFilter(filterInput.value);

    if (!result.ok) {
        render();
        return false;
    }

    filterInput.value = formatLdapFilter(result.ast);
    render();
    return true;
});

formatAndCopyBtn.addEventListener("click", () => {
    if(formatBtn.click()) {
        copyText(filterInput.value, "Copied", formatAndCopyBtn);
    }
});

clearBtn.addEventListener("click", () => {
    filterInput.value = "";
    formattedOutput.textContent = "";
    astOutput.textContent = "";
    errorBox.style.display = "none";
    lastAstJson = "";
    render();
});

filterInput.addEventListener("input", renderDebounced);
escapeInput.addEventListener("input", updateEscapeHelper);

copyEscapeBtn.addEventListener("click", () => {
    copyText(escapeOutput.value, "Copied", copyEscapeBtn);
});

updateEscapeHelper();
render();