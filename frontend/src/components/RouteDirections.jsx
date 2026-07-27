import { ChevronDown, MapPin, Milestone } from "lucide-react";
import { useState } from "react";

export default function RouteDirections({ legs }) {
  const [open, setOpen] = useState(false);
  // `steps` didn't always exist on stored trip results (older trips predate
  // turn-by-turn directions) -- default missing ones to empty rather than
  // crashing when reloading a trip from history.
  const totalSteps = legs.reduce((sum, leg) => sum + (leg.steps?.length ?? 0), 0);

  if (totalSteps === 0) return null;

  return (
    <div className="rounded-2xl border border-ink-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Milestone className="h-4 w-4 text-ink-500" />
          Turn-by-turn directions ({totalSteps} steps)
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="max-h-96 overflow-y-auto border-t border-ink-100 px-5 pb-4">
          {legs.map((leg, legIdx) => (
            <div key={leg.name}>
              <p className="mt-4 mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                <MapPin className="h-3 w-3" />
                {legIdx === 0 ? "Current → Pickup" : "Pickup → Drop-off"}
              </p>
              <ol className="space-y-2">
                {(leg.steps ?? []).map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[10px] font-semibold text-ink-500">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-ink-700">{step.instruction}</span>
                    <span className="shrink-0 text-xs text-ink-500">
                      {step.distance_miles >= 0.1 ? `${step.distance_miles.toFixed(1)} mi` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
