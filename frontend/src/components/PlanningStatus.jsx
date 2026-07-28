import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import GlobeHero from "./GlobeHero";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// These four map directly onto plan_trip()'s real steps (trip_planner.py):
// geocode the three locations, fetch both route legs, run the HOS engine,
// then build the daily log sheets -- so this isn't a fake progress bar,
// it's naming the actual work happening server-side while the one HTTP
// request is in flight. If the response comes back before the sequence
// finishes, the parent unmounts this (result becomes truthy) and the timers
// get cleared -- we never artificially hold the user up. If it runs long,
// the sequence just holds on the last step with its spinner still going,
// rather than looking stuck.
const STEPS = [
  "Geocoding pickup and drop-off",
  "Calculating the route",
  "Applying HOS rules (11/14/70-hour limits)",
  "Building daily log sheets",
];
const STEP_MS = 1100;

export default function PlanningStatus() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (REDUCED_MOTION) return;
    const timers = STEPS.slice(1).map((_, i) =>
      setTimeout(() => setActiveStep(i + 1), STEP_MS * (i + 1)),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white/40 px-6 text-center dark:border-ink-800 dark:bg-ink-900/30">
      <GlobeHero />
      {REDUCED_MOTION ? (
        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-ink-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
          Planning your trip…
        </p>
      ) : (
        <ul className="mt-1 space-y-2.5 text-left">
          {STEPS.map((label, i) => {
            const state = i < activeStep ? "done" : i === activeStep ? "active" : "pending";
            return (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {state === "done" && <Check className="h-4 w-4 text-status-driving" />}
                  {state === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />}
                  {state === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-ink-300 dark:bg-ink-700" />}
                </span>
                <span
                  className={
                    state === "pending"
                      ? "text-ink-400 dark:text-ink-600"
                      : state === "active"
                        ? "font-medium text-ink-900 dark:text-ink-100"
                        : "text-ink-500 dark:text-ink-400"
                  }
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
