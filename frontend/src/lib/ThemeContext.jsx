import { createContext, useContext, useEffect, useState } from "react";
import { applyTheme, resolveInitialTheme } from "./theme";

const ThemeContext = createContext(null);

// A tiny context instead of each ThemeToggle owning its own local state --
// the command palette also needs to flip the theme and show the current
// state in its own label, and without a shared source of truth the header
// toggle's icon and the palette's "Switch to..." label would drift out of
// sync with each other.
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
