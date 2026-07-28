import { Truck } from "lucide-react";
import RouteMark from "./RouteMark";
import ThemeToggle from "./ThemeToggle";

// A dashed road that just stops, and a truck tipped over where it ends --
// the RouteMark squiggle's destination dot swapped for a dead end. Kept to
// the same hand-drawn-SVG language as everything else (RouteMark,
// ComplianceBadge, GlobeHero) rather than reaching for a stock 404 image.
function StalledTruck() {
  return (
    <svg width="220" height="120" viewBox="0 0 220 120" fill="none" aria-hidden="true">
      <line
        x1="10"
        y1="90"
        x2="140"
        y2="90"
        stroke="var(--color-ink-200)"
        strokeWidth="3"
        strokeDasharray="10 8"
        strokeLinecap="round"
      />
      <circle cx="150" cy="90" r="3" fill="var(--color-ink-300)" />
      <g transform="translate(150, 62) rotate(12)">
        <Truck className="h-10 w-10 text-ink-400 dark:text-ink-500" strokeWidth={1.6} />
      </g>
      <text x="178" y="52" fontSize="20" fill="var(--color-amber-600)">
        ?
      </text>
    </svg>
  );
}

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50 dark:bg-transparent">
      <header className="print-hide border-b border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-950/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-ink-950 dark:text-ink-50" strokeWidth={1.75} />
            <p className="flex items-center gap-2 text-sm font-bold tracking-tight text-ink-950 dark:text-ink-50">
              RouteLog
              <RouteMark />
            </p>
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <StalledTruck />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl dark:text-ink-50">
          Wrong turn
        </h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
          There's no route to this page. It may have been mistyped, or the link you followed is
          out of date.
        </p>
        <a
          href="/"
          className="mt-6 rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
        >
          Back to RouteLog
        </a>
      </main>
    </div>
  );
}
