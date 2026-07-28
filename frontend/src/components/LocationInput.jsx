import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { autocompleteLocation } from "../lib/api";

export default function LocationInput({ id, label, placeholder, value, onChange, icon: Icon = MapPin }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(e) {
    const text = e.target.value;
    onChange(text);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      let results;
      try {
        results = await autocompleteLocation(text);
      } catch {
        // Autocomplete is a nice-to-have (typing still works fine without
        // it) -- a transient network error or hitting the rate limit
        // shouldn't surface as an unhandled rejection or block typing.
        return;
      }
      // Don't reopen the dropdown for a request that resolves after the
      // user has already moved on to another field.
      if (document.activeElement !== inputRef.current) return;
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 300);
  }

  function selectSuggestion(suggestion) {
    onChange(suggestion.label);
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-300">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-400" />
        <input
          id={id}
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder}
          required
          className="w-full rounded-lg border border-ink-200 bg-white py-2.5 pr-3 pl-9 text-sm text-ink-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg dark:border-ink-700 dark:bg-ink-900">
          {suggestions.map((s, idx) => (
            <li key={`${s.lat}-${s.lon}-${idx}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${
                  idx === activeIndex
                    ? "bg-amber-500/10 text-ink-900 dark:text-ink-50"
                    : "text-ink-700 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
                }`}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500 dark:text-ink-400" />
                <span className="min-w-0">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
