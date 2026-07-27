import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
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

function FitBounds({ geometry }) {
  const map = useMap();
  useMemo(() => {
    if (geometry && geometry.length > 1) {
      map.fitBounds(geometry, { padding: [40, 40] });
    }
  }, [geometry, map]);
  return null;
}

export default function MapView({ waypoints, geometry, stops }) {
  const center = geometry?.[0] || [39.5, -98.35];

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-ink-100">
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

        <FitBounds geometry={geometry} />
      </MapContainer>
    </div>
  );
}
