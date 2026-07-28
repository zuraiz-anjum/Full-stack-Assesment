import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, resolveInitialTheme } from "../lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to night driving mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to night driving mode"}
      className="rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-800 dark:hover:text-ink-50"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
