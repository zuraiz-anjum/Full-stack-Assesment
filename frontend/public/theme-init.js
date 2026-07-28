// Sets the theme before first paint, so there's no flash of the wrong
// theme -- loaded as a same-origin <script src> (not inline) because the
// site's CSP is `script-src 'self'` with no 'unsafe-inline'.
(function () {
  try {
    var stored = localStorage.getItem("routelog-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch {
    // Storage disabled -- default to light, ThemeToggle will still work.
  }
})();
