/*
MIT License

Copyright (c) 2026 ldap-toolz contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const dslParseBtn = document.getElementById("dslParseBtn");
const dslClearBtn = document.getElementById("dslClearBtn");
const dslCopyBtn = document.getElementById("dslCopyBtn");

const dslInput = document.getElementById("dslInput");
const dslErrorBox = document.getElementById("dslError");
const dslErrorMessage = document.getElementById("dslErrorMessage");
const dslErrorCaret = document.getElementById("dslErrorCaret");
const ldapFilter = document.getElementById("ldapFilter");
const btnCopy = document.getElementById("btnCopy");
const ldapFormatToggle = document.getElementById("ldapFormatToggle");
const dslCompileToggle = document.getElementById("dslCompileToggle");

let debounceHandle = null;
const formatOutputKey = "format-ldap-output";

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

function buildLdapOutput(value) {
    const ldapValue = LdapDslConverter.toLdap(value);

    if (!ldapFormatToggle.checked) {
        return ldapValue;
    }

    const ldapResult = LdapFilterParser.tryParse(ldapValue);
    return ldapResult.ok ? LdapFilterParser.formatLdapFilter(ldapResult.ast) : ldapValue;
}

function dslRender() {
    ldapFilter.textContent = "";

    const value = dslInput.value;

    if (value.trim() === "") {
        dslErrorBox.classList.add("d-none");
        return;
    }

    const result = LdapDslParser.tryParse(value);

    if (!result.ok) {
        dslErrorBox.classList.remove("d-none");
        dslErrorMessage.textContent = result.error.fullMessage;
        dslErrorCaret.textContent = makeCaretPointer(value, result.error.position);
        return;
    }

    localStorage.setItem('last-input', value);

    ldapFilter.textContent = buildLdapOutput(value);

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
    document.execCommand("insertText", false, "{\r\n    objectClass: \"*\"\r\n}");
}

dslParseBtn.addEventListener("click", dslRender);

dslInput.addEventListener("keydown", handleDslInputTab);

dslInput.addEventListener("input", () => { if (dslCompileToggle.checked) renderDebounced(); });

dslClearBtn.addEventListener("click", () => {
    resetInput();
    dslErrorBox.classList.add("d-none");
});

btnCopy.addEventListener("click", () => {
    copyText(ldapFilter.textContent, "Copied!", btnCopy);
});

dslCopyBtn.addEventListener("click", () => {
    copyText(dslInput.value, "Copied!", dslCopyBtn);
});

ldapFormatToggle.addEventListener("change", () => {
    localStorage.setItem(formatOutputKey, ldapFormatToggle.checked ? "true" : "false");
    dslRender();
});



ldapFormatToggle.checked = localStorage.getItem(formatOutputKey) === "true";

const lastInput = localStorage.getItem('last-input');
if (lastInput) {
    dslInput.value = lastInput;
}
else {
    resetInput();
}

dslRender();
