import { Truck } from "lucide-react";
import { useEffect, useRef } from "react";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const SIZE = 200;
const CENTER = SIZE / 2;
const GLOBE_R = 52;
const ORBIT_R = 74;
const PERIOD_MS = 8000;

// The truck orbits just outside the globe (satellite-style) on a circle
// computed via requestAnimationFrame + trig, applied as a single
// `transform: translate()` per frame -- compositor-only, same reasoning as
// the splash screen's drive. Direction: clockwise starting at the top.
//
// Orientation: the icon stays upright (never flips upside down) and only
// mirrors horizontally to match whether it's currently moving left or
// right -- the earlier version kept a fixed rightward-facing orientation
// the whole way around, which reads as driving backwards on the left half
// of the loop.
function OrbitingTruck() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (REDUCED_MOTION) {
      el.style.transform = `translate(${CENTER}px, ${CENTER - ORBIT_R}px) translate(-50%, -50%)`;
      return;
    }
    let raf;
    const start = performance.now();
    function tick(now) {
      const t = ((now - start) % PERIOD_MS) / PERIOD_MS;
      const angle = t * Math.PI * 2 - Math.PI / 2;
      const x = CENTER + ORBIT_R * Math.cos(angle);
      const y = CENTER + ORBIT_R * Math.sin(angle);
      // Horizontal component of the velocity vector (d/dtheta of cos(angle)
      // is -sin(angle)) -- its sign tells us whether we're currently
      // moving left or right along the loop.
      const movingLeft = -Math.sin(angle) < 0;
      el.style.transform =
        `translate(${x}px, ${y}px) translate(-50%, -50%)` + (movingLeft ? " scaleX(-1)" : "");
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

// Simplified, recognizable continent silhouettes (not geographically
// precise -- just enough blob-language to read as "Earth" rather than an
// abstract wireframe sphere). Drawn in a 0-140/0-140 local space and
// positioned by each <g> below.
function ContinentBlob({ d, transform }) {
  return <path d={d} transform={transform} fill="var(--color-status-driving)" opacity="0.55" />;
}

export default function GlobeHero() {
  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }} aria-hidden="true">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        <defs>
          <radialGradient id="oceanGradient" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#bfe3f5" />
            <stop offset="55%" stopColor="#8fc9e8" />
            <stop offset="100%" stopColor="#5c9fc9" />
          </radialGradient>
          <radialGradient id="glossHighlight" cx="35%" cy="28%" r="35%">
            <stop offset="0%" stopColor="white" stopOpacity="0.55" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <clipPath id="globeClip">
            <circle cx={CENTER} cy={CENTER} r={GLOBE_R} />
          </clipPath>
        </defs>

        {/* Ground shadow */}
        <ellipse cx={CENTER} cy={CENTER + GLOBE_R + 8} rx={GLOBE_R * 0.75} ry="5" fill="var(--color-ink-950)" opacity="0.08" />

        {/* Static dashed satellite orbit ring -- the truck's path */}
        <circle cx={CENTER} cy={CENTER} r={ORBIT_R} fill="none" stroke="var(--color-ink-200)" strokeWidth="1.5" strokeDasharray="3 6" />

        {/* The sphere: ocean base + continents clipped to the circle + grid + gloss */}
        <g clipPath="url(#globeClip)">
          <circle cx={CENTER} cy={CENTER} r={GLOBE_R} fill="url(#oceanGradient)" />
          <ContinentBlob
            transform={`translate(${CENTER - 46}, ${CENTER - 40})`}
            d="M20 8 C30 2 42 6 46 14 C52 16 50 26 44 28 C46 34 38 40 30 36 C22 40 12 34 14 26 C6 24 8 12 20 8 Z"
          />
          <ContinentBlob
            transform={`translate(${CENTER - 6}, ${CENTER - 6}) scale(0.8)`}
            d="M18 4 C26 0 36 8 34 16 C40 22 32 32 24 30 C22 38 10 38 8 30 C0 26 4 14 12 12 C10 6 14 4 18 4 Z"
          />
          <ContinentBlob
            transform={`translate(${CENTER + 8}, ${CENTER - 42}) scale(0.55)`}
            d="M14 2 C22 0 30 6 26 14 C30 20 22 26 14 22 C6 26 0 18 4 12 C0 6 8 2 14 2 Z"
          />
          {/* Latitude / meridian wireframe */}
          <ellipse cx={CENTER} cy={CENTER} rx={GLOBE_R} ry={GLOBE_R * 0.32} fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="1" />
          <ellipse cx={CENTER} cy={CENTER} rx={GLOBE_R * 0.32} ry={GLOBE_R} fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="1" />
          <line x1={CENTER - GLOBE_R} y1={CENTER} x2={CENTER + GLOBE_R} y2={CENTER} stroke="white" strokeOpacity="0.35" strokeWidth="1" />
          {/* Glossy sphere highlight */}
          <circle cx={CENTER} cy={CENTER} r={GLOBE_R} fill="url(#glossHighlight)" />
        </g>
        <circle cx={CENTER} cy={CENTER} r={GLOBE_R} fill="none" stroke="var(--color-ink-950)" strokeOpacity="0.12" strokeWidth="1" />

        {/* Destination marker sitting on the orbit ring */}
        <circle cx={CENTER + ORBIT_R * 0.95} cy={CENTER + ORBIT_R * 0.31} r="3.5" fill="var(--color-amber-600)" />
        <circle cx={CENTER + ORBIT_R * 0.95} cy={CENTER + ORBIT_R * 0.31} r="1.3" fill="white" />
      </svg>
      <OrbitingTruck />
    </div>
  );
}
