import { Truck } from "lucide-react";
import { useEffect, useState } from "react";

const DRIVE_MS = 2400;
const HOLD_MS = 300;

// A brief truck-on-the-road intro played once per page load, then it fades
// out and never mounts again for the rest of the session -- a first
// impression, not a recurring interruption.
export default function SplashIntro() {
  const [phase, setPhase] = useState("driving"); // driving -> leaving -> gone

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("leaving"), DRIVE_MS + HOLD_MS);
    const t2 = setTimeout(() => setPhase("gone"), DRIVE_MS + HOLD_MS + 450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink-50 transition-opacity duration-[450ms] ${
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-ink-950 p-2.5 text-amber-500">
          <Truck className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold tracking-tight text-ink-950">RouteLog</p>
      </div>

      <div className="drive-track relative mt-10 h-10 w-64 overflow-hidden sm:w-80">
        <svg className="absolute top-1/2 left-0 w-full -translate-y-1/2" height="2" viewBox="0 0 320 2">
          <line x1="0" y1="1" x2="320" y2="1" stroke="var(--color-ink-200)" strokeWidth="2" strokeDasharray="10 8" />
        </svg>
        {/* The drive animates `transform` using container-query width units
            (cqw) -- resolves against `.drive-track` above, same intent as a
            percentage but staying on the compositor thread (no layout
            recalculation per frame, unlike `left`/`top`, which is what
            caused visible stutter). Vertical centering is the other half of
            the same translate() call, using a plain % (correctly self-
            relative for that purpose). The bob lives on the inner div so it
            doesn't fight the outer div's transform for the same property. */}
        <div
          className="absolute top-1/2 text-amber-600"
          style={{ animation: `truck-drive ${DRIVE_MS}ms ease-in-out forwards` }}
        >
          <div style={{ animation: "truck-bob 0.7s ease-in-out infinite" }}>
            <Truck className="h-7 w-7" strokeWidth={2.25} />
          </div>
        </div>
      </div>
    </div>
  );
}
