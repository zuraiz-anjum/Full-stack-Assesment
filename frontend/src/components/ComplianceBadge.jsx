import { BarChart3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ComplianceDetailsModal from "./ComplianceDetailsModal";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Draws the shield outline in (same stroke-dashoffset trick used for the
// route polyline), then the checkmark pops in once the outline finishes --
// a quick, once-per-trip affirmation that the generated schedule doesn't
// break any HOS rule, rather than a static icon that'd get lost next to
// the summary cards.
function useDrawIn(ref, { delay = 0 } = {}) {
  useEffect(() => {
    const path = ref.current;
    if (!path || REDUCED_MOTION || typeof path.getTotalLength !== "function") return;
    const length = path.getTotalLength();
    path.style.transition = "none";
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset 0.6s cubic-bezier(0.65, 0, 0.35, 1) ${delay}ms`;
    const raf = requestAnimationFrame(() => {
      path.style.strokeDashoffset = "0";
    });
    return () => cancelAnimationFrame(raf);
  }, [ref, delay]);
}

// The margin bars (busiest driving day / cycle usage) used to live inline
// here, but that's supplementary analysis, not part of the actual daily
// log a driver hands in -- keeping this card to just the pass/fail
// affirmation (matching how the log sheets themselves now mirror the real
// paper form exactly) and tucking the numbers behind their own button
// keeps the two concerns separate.
export default function ComplianceBadge({ result }) {
  const shieldRef = useRef(null);
  const checkRef = useRef(null);
  useDrawIn(shieldRef);
  useDrawIn(checkRef, { delay: 550 });
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="animate-fade-in-up flex items-center justify-between gap-2.5 rounded-xl border border-ink-100 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="flex items-center gap-2.5">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="shrink-0">
          <path
            ref={shieldRef}
            d="M13 2.5 L22.5 6 V12.5 C22.5 18.5 18.5 22.5 13 23.5 C7.5 22.5 3.5 18.5 3.5 12.5 V6 Z"
            stroke="var(--color-status-driving)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            ref={checkRef}
            d="M8.5 13 L11.5 16 L17.5 9.5"
            stroke="var(--color-status-driving)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-950 dark:text-ink-50">Schedule is HOS compliant</p>
          <p className="text-xs text-ink-500 dark:text-ink-400">49 CFR Part 395 · 70-hr/8-day cycle, no adverse conditions</p>
        </div>
      </div>
      {result && (
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-100 px-2.5 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-200 hover:bg-ink-50 dark:border-ink-800 dark:text-ink-300 dark:hover:border-ink-700 dark:hover:bg-ink-800"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">View margins</span>
        </button>
      )}
      {detailsOpen && result && <ComplianceDetailsModal result={result} onClose={() => setDetailsOpen(false)} />}
    </div>
  );
}
