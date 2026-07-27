import L from "leaflet";
import { useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

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
    <div className="h-full w-full overflow-hidden rounded-2xl border border-ink-200 shadow-sm">
      <MapContainer center={center} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geometry && geometry.length > 1 && (
          <Polyline positions={geometry} pathOptions={{ color: "#101a2c", weight: 4, opacity: 0.85 }} />
        )}

        {waypoints?.current && (
          <Marker position={[waypoints.current.lat, waypoints.current.lon]} icon={pinIcon("#334467", "C")}>
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
                  {new Date(s.start).toLocaleString()} &rarr; {new Date(s.end).toLocaleString()}
                </span>
              </Popup>
            </Marker>
          ))}

        <FitBounds geometry={geometry} />
      </MapContainer>
    </div>
  );
}
