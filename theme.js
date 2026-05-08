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

(function () {
    const storageKey = "ldap-toolz-theme";
    const root = document.documentElement;

    function getPreferredTheme() {
        const saved = localStorage.getItem(storageKey);

        if (saved === "light" || saved === "dark") {
            return saved;
        }

        return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }

    function applyTheme(theme) {
        root.dataset.theme = theme;
        root.style.colorScheme = theme;

        const toggle = document.getElementById("themeToggle");

        if (toggle) {
            toggle.textContent = theme === "dark" ? "Light" : "Dark";
            toggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
        }
    }

    function toggleTheme() {
        const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
        localStorage.setItem(storageKey, nextTheme);
        applyTheme(nextTheme);
    }

    function addThemeToggle() {
        const toggle = document.createElement("button");
        toggle.id = "themeToggle";
        toggle.type = "button";
        toggle.className = "theme-toggle";
        toggle.addEventListener("click", toggleTheme);
        document.body.appendChild(toggle);
        applyTheme(root.dataset.theme || getPreferredTheme());
    }

    applyTheme(getPreferredTheme());

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", addThemeToggle);
    } else {
        addThemeToggle();
    }
})();
