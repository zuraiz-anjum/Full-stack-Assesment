import { Download, History, Moon, Plus, Printer, Search, Share2, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadTripPdf } from "../lib/api";
import { generateTripSummaryImage } from "../lib/shareImage";
import { useTheme } from "../lib/ThemeContext";

async function handleShareLink(shareToken) {
  const url = `${window.location.origin}/shared/${shareToken}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt("Copy this link to share the trip:", url);
  }
}

async function handleShareImage(result, tripId) {
  const blob = await generateTripSummaryImage(result);
  if (!blob) return;
  const filename = `routelog-trip-${tripId ?? "summary"}.png`;
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "RouteLog trip summary" });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// A keyboard-first quick-actions palette: Cmd/Ctrl+K opens it from anywhere
// in the app, typing filters both static commands and recent trips, arrow
// keys move the selection, Enter runs it. The command list is built fresh
// each render from props so it only ever shows actions that are actually
// possible right now (no "Download PDF" with nothing to download).
export default function CommandPalette({ trips, onSelectTrip, onNewTrip, activeTrip, submitting }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    function onKeyDown(e) {
      const isCombo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCombo) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    // Also openable from a plain button click (header trigger) for people
    // who'd never discover the shortcut otherwise -- a custom event keeps
    // that trigger decoupled rather than lifting `open` into a shared
    // parent just for this.
    function onExternalOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("routelog:open-command-palette", onExternalOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("routelog:open-command-palette", onExternalOpen);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo(() => {
    const close = (fn) => () => {
      setOpen(false);
      fn();
    };
    const commands = [];
    // A trip currently being planned will call setTrip(created) once it
    // resolves -- jumping to a different trip (a reset or a history pick)
    // in the meantime would just get silently clobbered when that finally
    // lands, so both are left out of the list entirely while submitting
    // rather than letting the user start an interaction that's going to
    // lose to a race a few seconds later.
    if (!submitting) {
      commands.push({
        id: "new-trip",
        icon: Plus,
        label: "Plan a new trip",
        hint: "Reset the form",
        run: close(() => onNewTrip()),
      });
    }
    commands.push({
      id: "toggle-theme",
      icon: theme === "dark" ? Sun : Moon,
      label: theme === "dark" ? "Switch to light mode" : "Switch to night driving mode",
      run: close(toggleTheme),
    });
    if (activeTrip?.id) {
      commands.push({
        id: "download-pdf",
        icon: Download,
        label: "Download PDF",
        hint: "Daily log sheets",
        run: close(() => downloadTripPdf(activeTrip.id).catch(() => {})),
      });
      commands.push({
        id: "share-image",
        icon: Share2,
        label: "Share summary image",
        run: close(() => handleShareImage(activeTrip.result, activeTrip.id).catch(() => {})),
      });
      commands.push({
        id: "print",
        icon: Printer,
        label: "Print daily logs",
        run: close(() => window.print()),
      });
    }
    if (activeTrip?.share_token) {
      commands.push({
        id: "copy-link",
        icon: Share2,
        label: "Copy share link",
        run: close(() => handleShareLink(activeTrip.share_token).catch(() => {})),
      });
    }

    const tripItems = submitting
      ? []
      : (trips ?? []).map((t) => ({
          id: `trip-${t.id}`,
          icon: History,
          label: `${t.pickup_location} → ${t.dropoff_location}`,
          hint: new Date(t.created_at).toLocaleDateString(),
          group: "Recent trips",
          run: close(() => onSelectTrip(t.id)),
        }));

    return [...commands, ...tripItems];
  }, [trips, activeTrip, theme, toggleTheme, onNewTrip, onSelectTrip, submitting]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function onKeyDownList(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[activeIndex]?.run();
    }
  }

  if (!open) return null;

  let lastGroup = null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-ink-950/40 px-4 pt-[12vh] backdrop-blur-sm dark:bg-black/60">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 cursor-default"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-ink-100 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDownList}
            placeholder="Jump to a trip or run a command…"
            className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-ink-50"
          />
          <kbd className="shrink-0 rounded border border-ink-200 px-1.5 py-0.5 text-[10px] text-ink-400 dark:border-ink-700">
            esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-ink-400">No matches.</p>
          )}
          {filtered.map((item, idx) => {
            const showGroupLabel = item.group && item.group !== lastGroup;
            lastGroup = item.group ?? lastGroup;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {showGroupLabel && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  onClick={item.run}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                    idx === activeIndex
                      ? "bg-amber-500/10 text-ink-900 dark:text-ink-50"
                      : "text-ink-700 dark:text-ink-300"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-400" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-xs text-ink-400">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-ink-100 px-4 py-2 text-[11px] text-ink-400 dark:border-ink-800">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
