import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { formatWallClock } from "../lib/datetime";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Draws the route polyline in by animating stroke-dashoffset on the
// underlying SVG path, rather than just having it pop in fully formed --
// same trick used for hand-drawn-map effects, no animation library needed.
function AnimatedRoute({ geometry }) {
  const ref = useRef(null);

  useEffect(() => {
    const layer = ref.current;
    const path = layer?.getElement?.() ?? layer?._path;
    if (!path || REDUCED_MOTION || typeof path.getTotalLength !== "function") return;

    const length = path.getTotalLength();
    path.style.transition = "none";
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    // Force a reflow so the browser registers the starting state before
    // the transition below kicks in -- otherwise it just snaps to the end.
    // eslint-disable-next-line no-unused-expressions
    path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset 1.3s cubic-bezier(0.65, 0, 0.35, 1)";
    const raf = requestAnimationFrame(() => {
      path.style.strokeDashoffset = "0";
    });
    return () => cancelAnimationFrame(raf);
  }, [geometry]);

  return <Polyline ref={ref} positions={geometry} pathOptions={{ color: "#18180f", weight: 4, opacity: 0.9 }} />;
}

const STATUS_COLORS = {
  OFF_DUTY: "#94a3b8",
  SLEEPER_BERTH: "#6d5ce8",
  ON_DUTY_NOT_DRIVING: "#dd8b0a",
};

function pinIcon(color, label) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        background:${color};border:3px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:11px;font-weight:700;font-family:Inter,sans-serif;
      ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function stopIcon(status) {
  const color = STATUS_COLORS[status] || "#64748b";
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:16px;height:16px;border-radius:9999px;
        background:${color};border:2px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
      "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

const TRUCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
  <path d="M15 18H9"/>
  <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
  <circle cx="17" cy="18" r="2"/>
  <circle cx="7" cy="18" r="2"/>
</svg>`;

function replayIcon(flip) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:30px;height:30px;border-radius:9999px;
        background:#b45309;border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        transform:${flip ? "scaleX(-1)" : "none"};
      ">${TRUCK_SVG}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function nearestGeometryIndex(geometry, lat, lon) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const [glat, glon] = geometry[i];
    const d = (glat - lat) ** 2 + (glon - lon) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// Turns the stop list into an ordered sequence of "drive from A to B" and
// "pause here" steps, by snapping each stop to its nearest point on the
// route polyline. Distance (not real elapsed HOS time, which the replay
// deliberately compresses) is what paces each driving step, since it's a
// reasonable proxy and doesn't require threading exact timestamps through
// to individual polyline points.
function buildReplayPlan(geometry, stops) {
  if (!geometry || geometry.length < 2) return [];
  const withIdx = (stops ?? [])
    .filter((s) => s.location)
    .map((s) => ({ idx: nearestGeometryIndex(geometry, s.location.lat, s.location.lon), stop: s }))
    .sort((a, b) => a.idx - b.idx);

  const plan = [];
  let cursor = 0;
  for (const { idx, stop } of withIdx) {
    if (idx > cursor) plan.push({ type: "drive", from: cursor, to: idx });
    plan.push({ type: "pause", idx, stop });
    cursor = Math.max(cursor, idx);
  }
  if (cursor < geometry.length - 1) plan.push({ type: "drive", from: cursor, to: geometry.length - 1 });
  return plan;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Animates smoothly through `points` over `durationMs`, weighted by actual
// distance between consecutive points (not just point count) so speed
// reads as roughly constant even where the route has uneven point density.
function animateAlong(points, durationMs, onFrame, isCancelled) {
  return new Promise((resolve) => {
    if (points.length < 2) return resolve();
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      const [la1, lo1] = points[i - 1];
      const [la2, lo2] = points[i];
      cum.push(cum[i - 1] + Math.hypot(la2 - la1, lo2 - lo1));
    }
    const total = cum[cum.length - 1] || 1;
    const start = performance.now();
    function frame(now) {
      if (isCancelled()) return resolve();
      const t = Math.min((now - start) / durationMs, 1);
      const target = t * total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < target) i++;
      const segStart = cum[i - 1];
      const segEnd = cum[i];
      const segT = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0;
      const [la1, lo1] = points[i - 1];
      const [la2, lo2] = points[i];
      const lat = la1 + (la2 - la1) * segT;
      const lon = lo1 + (lo2 - lo1) * segT;
      onFrame([lat, lon], lo2 - lo1 < 0);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

const REPLAY_MS = 13000;
const PAUSE_MS = 650;

function TripReplay({ geometry, stops, active, onDone }) {
  const [pos, setPos] = useState(null);
  const [flip, setFlip] = useState(false);
  const [caption, setCaption] = useState("");
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    cancelledRef.current = false;
    const isCancelled = () => cancelledRef.current;

    async function run() {
      const plan = buildReplayPlan(geometry, stops);
      const driveTotal = plan.reduce((sum, s) => (s.type === "drive" ? sum + (s.to - s.from) : sum), 0) || 1;
      for (const step of plan) {
        if (isCancelled()) return;
        if (step.type === "drive") {
          const points = geometry.slice(step.from, step.to + 1);
          const stepMs = Math.max(300, (REPLAY_MS * (step.to - step.from)) / driveTotal);
          setCaption("Driving…");
          await animateAlong(points, stepMs, (p, f) => { setPos(p); setFlip(f); }, isCancelled);
        } else {
          setPos(geometry[step.idx]);
          setCaption(step.stop.label);
          await sleep(PAUSE_MS);
        }
      }
      if (!isCancelled()) {
        setCaption("");
        setPos(null);
        onDone?.();
      }
    }
    run();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active || !pos) return null;

  return (
    <>
      <Marker position={pos} icon={replayIcon(flip)} zIndexOffset={1000} />
      {caption && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-ink-950 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg">
          {caption}
        </div>
      )}
    </>
  );
}

function highlightIcon() {
  const ringAnim = REDUCED_MOTION ? "" : "map-pulse-ring";
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:1px;height:1px;">
        <span class="${ringAnim}" style="
          position:absolute;top:-15px;left:-15px;
          width:30px;height:30px;border-radius:9999px;
          background:#b45309;
        "></span>
      </div>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

// Resolves a remark's free-text location label (from the daily log grid)
// back to a lat/lon by matching it against the same label strings already
// shown on the map -- there's no shared id between a remark and a stop, but
// both are ultimately derived from the same geocoding call, so the label
// text matches verbatim.
function resolveHighlightPosition(label, waypoints, stops) {
  if (!label) return null;
  const candidates = [waypoints?.current, waypoints?.pickup, waypoints?.dropoff, ...(stops ?? []).map((s) => s.location)];
  const match = candidates.find((c) => c && c.label === label);
  return match ? [match.lat, match.lon] : null;
}

function HighlightMarker({ label, waypoints, stops }) {
  const pos = resolveHighlightPosition(label, waypoints, stops);
  if (!pos) return null;
  return <Marker position={pos} icon={highlightIcon()} interactive={false} zIndexOffset={-100} />;
}

function FitBounds({ geometry }) {
  const map = useMap();
  useMemo(() => {
    if (geometry && geometry.length > 1) {
      // A degenerate route (current/pickup/dropoff all the same point, or
      // close enough to round to it) collapses the bounding box to ~zero
      // area, and fitBounds happily zooms all the way in to the tile
      // provider's max zoom (building-level detail) trying to "fill" it.
      // Capping maxZoom keeps that case showing a sane city-level view
      // instead of a random street corner.
      map.fitBounds(geometry, { padding: [40, 40], maxZoom: 13 });
    }
  }, [geometry, map]);
  return null;
}

export default function MapView({ waypoints, geometry, stops, replaying, onReplayDone, highlightLabel }) {
  const center = geometry?.[0] || [39.5, -98.35];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-ink-100 dark:border-ink-800">
      <MapContainer center={center} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geometry && geometry.length > 1 && <AnimatedRoute geometry={geometry} />}

        {waypoints?.current && (
          <Marker position={[waypoints.current.lat, waypoints.current.lon]} icon={pinIcon("#40403a", "C")}>
            <Popup>
              <strong>Current location</strong>
              <br />
              {waypoints.current.label}
            </Popup>
          </Marker>
        )}
        {waypoints?.pickup && (
          <Marker position={[waypoints.pickup.lat, waypoints.pickup.lon]} icon={pinIcon("#16a34a", "P")}>
            <Popup>
              <strong>Pickup</strong>
              <br />
              {waypoints.pickup.label}
            </Popup>
          </Marker>
        )}
        {waypoints?.dropoff && (
          <Marker position={[waypoints.dropoff.lat, waypoints.dropoff.lon]} icon={pinIcon("#dc2626", "D")}>
            <Popup>
              <strong>Drop-off</strong>
              <br />
              {waypoints.dropoff.label}
            </Popup>
          </Marker>
        )}

        {stops
          ?.filter((s) => s.location)
          .map((s, idx) => (
            <Marker
              key={idx}
              position={[s.location.lat, s.location.lon]}
              icon={stopIcon(s.status)}
            >
              <Popup>
                <strong>{s.label}</strong>
                <br />
                {s.location.label}
                <br />
                <span className="text-ink-500">
                  {formatWallClock(s.start)} &rarr; {formatWallClock(s.end)}
                </span>
              </Popup>
            </Marker>
          ))}

        <HighlightMarker label={highlightLabel} waypoints={waypoints} stops={stops} />
        <FitBounds geometry={geometry} />
        <TripReplay geometry={geometry} stops={stops} active={!!replaying} onDone={onReplayDone} />
      </MapContainer>
    </div>
  );
}
