const dslParseBtn = document.getElementById("dslParseBtn");
const dslClearBtn = document.getElementById("dslClearBtn");

const dslInput = document.getElementById("dslInput");
const dslStatusBadge = document.getElementById("dslStatusBadge");
const dslErrorBox = document.getElementById("dslError");
const dslErrorMessage = document.getElementById("dslErrorMessage");
const dslErrorCaret = document.getElementById("dslErrorCaret");
const ldapFilter = document.getElementById("ldapFilter");

let debounceHandle = null;

function setStatus(statusBadge, text, kind) {
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

function dslRender() {
    const value = dslInput.value;

    if (value.trim() === "") {
        setStatus(dslStatusBadge, "", "warn");
        dslErrorBox.classList.add("d-none");
        return;
    }

    const result = LdapDslParser.tryParse(value);

    if (!result.ok) {
        setStatus(dslStatusBadge, "", "error");
        dslErrorBox.classList.remove("d-none");
        dslErrorMessage.textContent = result.error.fullMessage;
        dslErrorCaret.textContent = makeCaretPointer(value, result.error.position);
        return;
    }

    ldapFilter.textContent = LdapDslConverter.toLdap(value);

    setStatus(dslStatusBadge, "", "ok");
    dslErrorBox.classList.add("d-none");
}



function handleDslInputTab(event) {
    if (event.key !== "Tab") {
        return;
    }

    event.preventDefault();

    const start = dslInput.selectionStart;
    const end = dslInput.selectionEnd;
    dslInput.setRangeText("    ", start, end, "end");
    renderDebounced();
}

function renderDebounced() {
    window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(dslRender, 220);
}

async function copyText(text, successLabel, button) {
    if (!text) {
        return;
    }

    const original = button.textContent;

    try {
        await navigator.clipboard.writeText(text);
        button.textContent = successLabel;
        window.setTimeout(() => { button.textContent = original; }, 1200);
    }
    catch {
        button.textContent = "Copy failed";
        window.setTimeout(() => { button.textContent = original; }, 1200);
    }
}

function resetInput() {
    dslInput.focus();
    dslInput.setSelectionRange(0, dslInput.value.length);
    document.execCommand("delete");
    dslInput.value = "{\r\n objectClass: \"*\"\r\n}";
}

dslParseBtn.addEventListener("click", dslRender);
dslInput.addEventListener("keydown", handleDslInputTab);

dslClearBtn.addEventListener("click", () => {
    resetInput();
    dslErrorBox.classList.add("d-none");
});

resetInput();
dslRender();
