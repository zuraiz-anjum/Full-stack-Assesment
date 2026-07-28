import { Truck } from "lucide-react";
import { useEffect, useRef } from "react";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 70;
const PERIOD_MS = 7000;

// A small globe with the truck genuinely orbiting it -- computed via
// requestAnimationFrame + trig rather than CSS `offset-path`, so the motion
// is a plain `transform: translate()` every frame (compositor-only, same
// reasoning as the splash screen's drive) instead of relying on offset-path
// coordinate-system quirks across browsers.
function OrbitingTruck() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (REDUCED_MOTION) {
      el.style.transform = `translate(${CENTER}px, ${CENTER - RADIUS}px) translate(-50%, -50%)`;
      return;
    }
    let raf;
    const start = performance.now();
    function tick(now) {
      const t = ((now - start) % PERIOD_MS) / PERIOD_MS;
      const angle = t * Math.PI * 2 - Math.PI / 2; // start at the top, go clockwise
      const x = CENTER + RADIUS * Math.cos(angle);
      const y = CENTER + RADIUS * Math.sin(angle);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={ref} className="absolute top-0 left-0 text-ink-950" style={{ willChange: "transform" }}>
      <Truck className="h-6 w-6" strokeWidth={2} />
    </div>
  );
}

export default function GlobeHero() {
  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }} aria-hidden="true">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        {/* The orbit ring -- static (no marching-ants animation here; the
            truck itself is what should read as moving, not the path). */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--color-ink-200)"
          strokeWidth="1.75"
          strokeDasharray="4 7"
        />
        {/* Latitude/meridian grid lines, purely decorative -- suggests a
            globe without needing an actual 3D rendering. */}
        <ellipse cx={CENTER} cy={CENTER} rx={RADIUS} ry={RADIUS * 0.34} fill="none" stroke="var(--color-ink-100)" strokeWidth="1.25" />
        <ellipse cx={CENTER} cy={CENTER} rx={RADIUS * 0.34} ry={RADIUS} fill="none" stroke="var(--color-ink-100)" strokeWidth="1.25" />
        <line x1={CENTER - RADIUS} y1={CENTER} x2={CENTER + RADIUS} y2={CENTER} stroke="var(--color-ink-100)" strokeWidth="1.25" />
        <line x1={CENTER} y1={CENTER - RADIUS} x2={CENTER} y2={CENTER + RADIUS} stroke="var(--color-ink-100)" strokeWidth="1.25" />

        {/* A couple of static "stop" dots on the ring, one marked as the
            destination in the accent color. */}
        <circle cx={CENTER - RADIUS * 0.71} cy={CENTER - RADIUS * 0.71} r="2.5" fill="var(--color-ink-300)" />
        <circle cx={CENTER + RADIUS * 0.95} cy={CENTER + RADIUS * 0.31} r="3.5" fill="var(--color-amber-600)" />
        <circle cx={CENTER + RADIUS * 0.95} cy={CENTER + RADIUS * 0.31} r="1.3" fill="white" />
      </svg>
      <OrbitingTruck />
    </div>
  );
}
