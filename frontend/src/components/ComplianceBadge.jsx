import { useEffect, useRef } from "react";

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

// Both metrics here are plain sums the FMCSA rules are themselves defined
// as sums of (not e.g. the 14-hour window, which is elapsed wall-clock
// time since shift start and would need a shakier derivation from block
// timestamps) -- so these numbers are exactly what a dispatcher would get
// pulling out a calculator, not an approximation dressed up as one.
function computeMargins(result) {
  const days = result.daily_logs ?? [];
  const maxDrivingDay = Math.max(0, ...days.map((d) => d.totals?.DRIVING ?? 0));
  const cycleStart = result.input?.current_cycle_used_hours ?? 0;
  const tripOnDuty = (result.summary?.driving_hours ?? 0) + (result.summary?.on_duty_not_driving_hours ?? 0);
  const cycleUsed = cycleStart + tripOnDuty;
  return [
    { label: "Busiest driving day", value: maxDrivingDay, limit: 11 },
    { label: "70-hr/8-day cycle", value: cycleUsed, limit: 70 },
  ];
}

function MarginBar({ label, value, limit }) {
  const pct = Math.min(100, Math.max(0, (value / limit) * 100));
  const color = pct >= 90 ? "var(--color-amber-600)" : pct >= 70 ? "var(--color-amber-500)" : "var(--color-status-driving)";
  return (
    <div className="min-w-[150px] flex-1">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink-500 dark:text-ink-400">{label}</span>
        <span className="font-semibold tabular-nums text-ink-800 dark:text-ink-200">
          {value.toFixed(1)}h <span className="text-ink-400 dark:text-ink-500">/ {limit}h</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function ComplianceBadge({ result }) {
  const shieldRef = useRef(null);
  const checkRef = useRef(null);
  useDrawIn(shieldRef);
  useDrawIn(checkRef, { delay: 550 });
  const margins = result ? computeMargins(result) : [];

  return (
    <div className="animate-fade-in-up rounded-xl border border-ink-100 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900/40">
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
      {margins.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-100 pt-3 dark:border-ink-800">
          {margins.map((m) => (
            <MarginBar key={m.label} {...m} />
          ))}
        </div>
      )}
    </div>
  );
}
