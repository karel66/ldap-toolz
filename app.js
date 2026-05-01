
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


function escapeSelectedLdapValue(inputEl) {
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;

    if (start == null || end == null || start === end) {
        return;
    }

    const selected = inputEl.value.slice(start, end);

    const escaped = selected
        .replace(/\\/g, "\\5c")
        .replace(/\*/g, "\\2a")
        .replace(/\(/g, "\\28")
        .replace(/\)/g, "\\29")
        .replace(/\0/g, "\\00");

    inputEl.focus();

    // Select current range (ensure it's active)
    inputEl.setSelectionRange(start, end);

    // Delete selection (like pressing Delete key)
    document.execCommand("delete");

    // Insert escaped text (like typing)
    document.execCommand("insertText", false, escaped);
}

// Returns { ok: boolean, ast?: object, error?: { fullMessage: string, position: number } }
function validateLdapFilter(input) {
    return LdapFilterParser.tryParse(input);
}



const filterInput = document.getElementById("filterInput");
const parseBtn = document.getElementById("parseBtn");
const formatBtn = document.getElementById("formatBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBadge = document.getElementById("statusBadge");
const errorBox = document.getElementById("errorBox");
const errorMessage = document.getElementById("errorMessage");
const errorCaret = document.getElementById("errorCaret");
const lengthValue = document.getElementById("lengthValue");
const formatAndCopyBtn = document.getElementById("formatAndCopyBtn");
const copyEscapeBtn = document.getElementById("copyEscapeBtn");
const escapeBtn = document.getElementById("escapeBtn");

let debounceHandle = null;

function setStatus(text, kind) {
    const icons = {
        ok: "✔",
        error: "✖",
        warn: "⚠"
    };

    const icon = icons[kind];

    if (icon) {
        statusBadge.innerHTML = `<span class="icon">${icon}</span> ${text}`;
    } else {
        statusBadge.textContent = text;
    }

    statusBadge.className = `status status-inline ${kind}`;
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


function render() {
    const value = filterInput.value;

    if (value.trim() === "") {
        setStatus("", "warn");
        errorBox.classList.add("d-none");
        document.getElementById("syntaxTree").textContent = "";
        return;
    }

    const result = validateLdapFilter(value);

    if (!result.ok) {
        setStatus("", "error");
        errorBox.classList.remove("d-none");
        errorMessage.textContent = result.error.fullMessage;
        errorCaret.textContent = makeCaretPointer(value, result.error.position);
        return;
    }

    document.getElementById("syntaxTree").textContent = JSON.stringify(result.ast, null, 2);

    setStatus("", "ok");
    errorBox.classList.add("d-none");
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
    }

    filterInput.focus();

    // Select current range (ensure it's active)
    filterInput.setSelectionRange(0, filterInput.value.length);

    // Delete selection (like pressing Delete key)
    document.execCommand("delete");

    // Insert escaped text (like typing)
    document.execCommand("insertText", false, formatLdapFilter(result.ast));
    render();
});

formatAndCopyBtn.addEventListener("click", () => {
    formatBtn.click();
    copyText(filterInput.value, "Copied", formatAndCopyBtn);
});

clearBtn.addEventListener("click", () => {
    filterInput.focus();
    filterInput.setSelectionRange(0, filterInput.value.length);
    // Delete selection (like pressing Delete key)
    document.execCommand("delete");

    errorBox.classList.add("d-none");
    render();
});

escapeBtn.addEventListener("click", () => {
    escapeSelectedLdapValue(filterInput);
});

filterInput.addEventListener("input", renderDebounced);

render();