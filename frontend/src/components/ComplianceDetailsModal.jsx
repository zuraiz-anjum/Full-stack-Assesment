import { X } from "lucide-react";
import { useEffect } from "react";

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
    {
      label: "Busiest driving day",
      value: maxDrivingDay,
      limit: 11,
      description: "The most hours driven in any single day of this trip, against the 11-hour daily driving limit.",
    },
    {
      label: "70-hr/8-day cycle",
      value: cycleUsed,
      limit: 70,
      description:
        "On-duty hours used so far (your starting cycle hours plus every driving and on-duty hour this trip adds), against the 70-hour/8-day cap.",
    },
  ];
}

function MarginBar({ label, value, limit, description }) {
  const pct = Math.min(100, Math.max(0, (value / limit) * 100));
  const color = pct >= 90 ? "var(--color-amber-600)" : pct >= 70 ? "var(--color-amber-500)" : "var(--color-status-driving)";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-ink-800 dark:text-ink-200">{label}</span>
        <span className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">
          {value.toFixed(1)}h <span className="text-ink-400 dark:text-ink-500">/ {limit}h</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {description && <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{description}</p>}
    </div>
  );
}

export default function ComplianceDetailsModal({ result, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const margins = computeMargins(result);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-950/40 px-4 backdrop-blur-sm dark:bg-black/60">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-ink-100 bg-white p-5 shadow-2xl dark:border-ink-800 dark:bg-ink-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight text-ink-950 dark:text-ink-50">HOS margin details</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-800 dark:hover:text-ink-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5">
          {margins.map((m) => (
            <MarginBar key={m.label} {...m} />
          ))}
        </div>
      </div>
    </div>
  );
}
