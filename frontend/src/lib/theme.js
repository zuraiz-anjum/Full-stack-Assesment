const STORAGE_KEY = "routelog-theme";

export function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function resolveInitialTheme() {
  const stored = getStoredTheme();
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing / storage disabled -- theme just won't persist.
  }
}

// The daily log sheets need to print on plain white paper regardless of
// which theme is active on screen -- printed dark-mode text would be
// near-white on the forced-white print background (see the `background:
// white !important` print rule) and vanish. `beforeprint`/`afterprint`
// catch every way printing can be triggered (button, Ctrl+P, browser
// menu), not just the in-app Print button.
export function forceLightForPrint() {
  let previous = null;
  window.addEventListener("beforeprint", () => {
    previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "light";
  });
  window.addEventListener("afterprint", () => {
    if (previous) document.documentElement.dataset.theme = previous;
  });
}
