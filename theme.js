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
